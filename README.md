# N잡 배움터

> 공공 API와 웹 페이지에 흩어진 AI 교육을 매일 모아, 지역·분야별로 찾아 주는 토스 미니앱. 소스 하나가 실패해도 기존 데이터를 지우지 않는 수집 파이프라인이 핵심입니다.

[![CI](https://github.com/YoungkeunAhn/njob-edu-collector/actions/workflows/ci.yml/badge.svg)](https://github.com/YoungkeunAhn/njob-edu-collector/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20Cron-F38020?logo=cloudflare&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-headless-2EAD33?logo=playwright&logoColor=white)

<p>
  <img src=".github/readme/filter.png" width="200" alt="조건 선택: 지역·분야·유형·가격">
  <img src=".github/readme/list.png" width="200" alt="강좌 목록: 정렬과 무료 강좌">
</p>

- **서비스**: 고용24, 지자체 평생학습 포털, 민간 사이트의 AI 활용 교육을 모아 원문 링크로 연결합니다. 토스 앱 안의 미니앱 플랫폼(앱인토스)에 2026.10 출시해 운영 중입니다.
- **이 저장소**: 운영 저장소에서 진행 중 작업 메모(`backlogs/`)만 빼고 옮긴 공개본입니다. Worker·앱·DB 마이그레이션·설계 문서가 모두 들어 있고, 테스트는 이 저장소만으로 전부 돌아갑니다.
- **담당**: 소스 조사, 수집 설계, DB 스키마, 조회 API, 토스 로그인·푸시 연동, 운영

## 핵심 설계 세 가지

1. **정리 가드** — 사라진 강좌를 지우는 정리는 수집 결과를 믿을 수 있을 때만 돕니다. 페이지를 끝까지 못 받았거나, 저장이 실패했거나, 건수가 직전 성공의 절반 미만이거나, 정규화 실패 행이 있으면 지우지 않습니다.
2. **실행 위치를 소스별로** — Open API·HTML·헤드리스 15개 소스 중 12개는 Worker Cron(9개 매일·3개 주 1회), 엣지(Cloudflare)에서 나가는 요청을 막는 3개는 로컬 PC 작업 스케줄러가 같은 어댑터 코드로 매일 수집합니다.
3. **DB는 Worker만** — 모든 테이블에 RLS를 켜고 정책을 두지 않았습니다. 앱은 DB에 직접 붙지 않고 Worker 조회 API만 부르며, 응답 캐시와 IP당 분당 60회 제한이 한곳에 걸립니다.

## 구조

```mermaid
flowchart TB
  API[공공 Open API] --> S
  HTML[웹 페이지 · cheerio] --> S
  JS[JS 렌더링 페이지 · Playwright] --> S
  S[Worker scheduled<br/>Cron 5개 수집 그룹] -->|upsert 500건 단위| DB[(Supabase PostgreSQL 서울<br/>RLS · service_role 전용)]
  Blocked[엣지 요청을 막는 3개 소스] --> Local[로컬 PC 작업 스케줄러<br/>같은 어댑터 코드] -->|upsert| DB
  S -->|실패 · 급감| TG[텔레그램 알림]
  DB -->|course_public 뷰| F[Worker fetch · 조회 API<br/>Cache API · IP당 분당 60회]
  App[미니앱 React · TDS] -->|GET /courses| F
```

| Cron (UTC) | KST | 소스 | 수집 방식 |
|---|---|---|---|
| `0 18 * * *` | 03:00 | 고용24 | HTML · cheerio |
| `10 18 * * *` | 03:10 | 서울시 공공서비스예약, 대구, K-Startup | Open API |
| `20 18 * * *` | 03:20 | 서울시평생학습포털, SeSAC, 데브이벤트, 링커리어 | HTML · cheerio |
| `40 18 * * *` | 03:40 | AI디지털배움터 | 헤드리스 Playwright |
| `30 19 * * SUN` | 월 04:30 | 평생학습 표준데이터, K-MOOC, 온통청년 | Open API |
| 작업 스케줄러 | 03:30 | 잡아바, 주변애, 더팀스 | 로컬 PC |

스케줄은 [`worker/src/sources/index.ts`](worker/src/sources/index.ts)와 [`worker/wrangler.toml`](worker/wrangler.toml)에 있고, 둘과 [설계 문서](docs/06-스펙/plan.md)의 표가 서로 같은지 테스트가 확인합니다.

## 정리 가드

```mermaid
flowchart LR
  A[fetchList<br/>소스별 어댑터] --> B[normalize<br/>분류·지역 코드] --> C[마감 제외 · 중복 제거] --> D[upsert] --> G{정리 가드}
  G -->|통과| P[pruneUnseen<br/>이번에 안 보인 행 삭제]
  G -->|페이지 미완결 · 저장 실패<br/>50% 미만 급감 · 정규화 실패| X[삭제 건너뜀 + 알림]
```

| 조건 | 코드 | 테스트 |
|---|---|---|
| 페이지 미완결: 총건수 없음·페이지마다 총건수 다름·중간 빈 페이지·반복 페이지·상한 초과 → throw | [`collectPages`](worker/src/sources/util.ts#L44-L74) | `collectPages: 중간의 짧은 페이지는 계속, 총건수 없음·부분 응답·상한 초과는 throw` |
| 직전 성공 대비 50% 미만 | [`shouldPrune`](worker/src/core/rules.ts#L25) · [`runSource`](worker/src/collect/run.ts#L81-L84) | `T4-3 성공이지만 직전 대비 50% 미만이면 prune 건너뛰고 알림` |
| 정규화 실패 행 존재 | [`runSource`](worker/src/collect/run.ts#L65-L84) | `T4-4 normalize 예외 행만 버리고 나머지는 저장, 그 실행은 정리하지 않는다` |
| 수집·저장 실패 | [`runSource`](worker/src/collect/run.ts#L55-L100) · [`supabase-repo.ts`](worker/src/collect/supabase-repo.ts) | `T4-2 실패 소스는 ok=false·error 기록, prune 안 함` |
| 총건수를 주지 않는 소스 | 소스별 `prune: false` | `총건수를 확인할 수 없는 소스만 prune=false` |

DB 트리거는 `last_seen_at`이 과거로 돌아가지 않게 하고, 사람이 고친 분류를 덮어쓰지 않게 막습니다([`course_triggers.sql`](supabase/migrations/20261011000003_course_triggers.sql)).

## 기술적 의사결정

| 결정 | 검토한 대안 | 채택 | 근거 |
|---|---|---|---|
| 수집 실행 위치 | GitHub Actions / Vercel Hobby / Oracle 무료 VM에 DB까지 | 조회 API와 같은 Worker의 Cron | Actions는 서비스 일부 용도가 약관상 애매하고 cron 지연, Vercel Hobby는 상업 이용 불가·300초 제한, VM은 DB·백업·TLS 직접 운영. Worker는 Browser Rendering을 함께 씀 |
| 앱의 DB 접근 | anon 키 + RLS로 PostgREST 직접 호출 | Worker 조회 API만 공개 | DB 키·테이블 구조를 숨기고 캐시·요청 제한을 한곳에서 적용 |
| DB | Neon / Cloudflare D1 / MySQL + Hyperdrive | Supabase 서울 | Neon 서울 리전 없음, D1은 SQLite·서울 지정 불가, MySQL은 별도 호스팅 |
| 엣지 차단 소스 | 수집 중단 / GitHub Actions로 이전 | 로컬 PC 작업 스케줄러 | 중단하면 강좌 200여 건 손실, Actions 러너 IP도 막힐 수 있음 |
| 고용24 커리큘럼 | 매일 상세까지 수집(1,200여 건 × 약 400KB) | 열람 시 조회, 저장 안 함, 6시간 캐시 | 매일 받는 양 대비 열람 빈도 |
| 강좌 분류 | LLM 분류 | 키워드 룰 | 비용 0, 같은 입력에 같은 결과, 테스트로 고정 가능 |

결정 기록 전체(D1~D20)는 [`docs/06-스펙/plan.md`](docs/06-스펙/plan.md#결정-기록), 인프라 비교는 [`docs/05-아키텍처/인프라-서비스-스펙비교.md`](docs/05-아키텍처/인프라-서비스-스펙비교.md), 크롤링 법적 검토는 [`docs/03-데이터수집/크롤링-법적-이슈.md`](docs/03-데이터수집/크롤링-법적-이슈.md)에 있습니다.

## 트러블슈팅

| 문제 | 원인 | 해결 |
|---|---|---|
| 3개 소스가 엣지에서만 실패 | 오류에 `HTTP 403 host`만 남아 원인 불명 → 응답 `server` 헤더·본문 앞 120자를 기록하자 Cloudflare 봇 차단·웹방화벽으로 갈림 | 로컬 PC 수집으로 분리 |
| 헤드리스 수집이 엣지에서 60초 초과 | `networkidle` 62.8초, `load` 62.7초, `domcontentloaded` 4.0~4.4초 (엣지 재현) | `domcontentloaded` 후 사이트 함수 준비만 대기, 총건수 변경 시 1회 재수집 → 엣지에서 5,338건 81초 |
| 부분 실패가 데이터를 지울 위험 | 같은 `source_id` 중복으로 upsert 거부, 깨진 링크 9건으로 정리가 매일 건너뜀 | 배치 내 중복 제거, 정리 가드, 깨진 링크는 기관 포털로 대체 |
| Cron 실행 시간 | 고용24 드라이런 전체 591초 | 고용24를 별도 그룹(03:00)으로 분리 |

원인 분석과 재현 과정은 [`docs/troubleshooting.md`](docs/troubleshooting.md)에 정리했습니다.

## 실행과 테스트

```bash
npm ci
npm test            # Vitest 412개 (Worker + 앱). DB 테스트는 PGlite로 실제 마이그레이션을 적용해 돈다
npm run typecheck
```

외부 키 없이 실응답 픽스처와 PGlite로 돕니다. 실사이트 드라이런(`npm run dry-run -w worker`)과 로컬 수집에는 `worker/.dev.vars`에 Supabase·공공 API 키가 필요합니다.

## 저장소 구성

```
worker/src/sources/   소스별 어댑터 15개 + collectPages
worker/src/collect/   수집 실행, upsert·정리, 텔레그램 알림
worker/src/api/       조회 API (캐시, 요청 제한, CORS)
worker/src/me/        토스 로그인(mTLS) · HMAC 세션 · 찜 · 마감 알림
worker/scripts/       드라이런, 로컬 수집
supabase/migrations/  스키마, RLS, 트리거, 뷰
app/                  미니앱 (React · 토스 TDS)
docs/                 소스 조사, 수집 설계, 아키텍처, 스펙·결정 기록, 운영 런북, AI 개발 워크플로우
.claude/              이슈 → 계획 → 구현 → 배포 → 검수 요청 스킬과 검수 hook 게이트
```

## 한계와 다음 과제

- 엣지 차단 소스 3곳은 PC 한 대에 기대고 있어, PC가 꺼진 날은 데이터가 낡습니다. 마지막 성공 시각이 오래되면 알리는 장치가 먼저 필요합니다.
- 운영 배포와 DB 마이그레이션은 런북([`docs/07-운영/배포-런북.md`](docs/07-운영/배포-런북.md))대로 수동입니다. CI는 이 공개본에 처음 붙였습니다.
- 소스 간 같은 강좌를 아직 합치지 못합니다.
