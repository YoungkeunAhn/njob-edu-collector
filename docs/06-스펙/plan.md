# Implementation Plan: N잡러 교육 매칭

**Date**: 2026-10-11 | **Spec**: [spec.md](spec.md) | **Diagrams**: [flow.html](flow.html)

> 형식: GitHub Spec Kit의 `plan.md` 템플릿을 따른다. [05-아키텍처/프로젝트-구성-제안.md](../05-아키텍처/프로젝트-구성-제안.md)를 논의한 뒤의 **최종 결정**을 기준으로 한다.

## Summary

앱인토스 WebView 미니앱이 Cloudflare Worker의 조회 API를 호출하고, Worker가 Supabase(Postgres, 서울)를 읽는다. 수집은 **같은 Worker**의 Cron Trigger가 매일 03:00 KST에 돌려 Supabase에 upsert한다. 관리할 곳은 GitHub(코드), Cloudflare, Supabase, 앱인토스 콘솔 4곳이고, 비용은 월 $5부터다.

## Technical Context

| 항목 | 결정 |
|---|---|
| **Language/Version** | TypeScript (앱·Worker 공통) |
| **앱** | 앱인토스 WebView SDK `@apps-in-toss/web-framework` + Vite + React (CSR. SSR은 앱인토스에서 금지) |
| **조회 API** | Cloudflare Worker `fetch` 핸들러. 결과는 Cache API로 캐시하고, 요청 수는 Rate Limiting으로 제한 |
| **수집** | 같은 Worker의 `scheduled` 핸들러(Cron Triggers). HTML 파싱은 `HTMLRewriter`·`cheerio`, 헤드리스는 Browser Rendering(`@cloudflare/playwright`) |
| **Storage** | Supabase Free(서울). 앱은 DB에 직접 접근하지 않음. Worker만 service_role 키로 접근 |
| **DB 접근** | `supabase-js`(HTTP). 필요해지면 Hyperdrive로 드라이버 직접 연결 |
| **분류** | 키워드 룰만 사용. 키워드에 안 걸리면 노출하지 않고, 월 1회 표본 점검으로 키워드 사전을 보강 |
| **Testing** | 소스별 `normalize()` 스냅샷 테스트 1개씩, 분류 룰 테스트 1개 |
| **Target Platform** | 토스앱(iOS·Android) 내 WebView |
| **Constraints** | Worker 메모리 128MB, Cron 1회 CPU 15분(Paid), Browser Rendering 월 10시간 포함, 앱 번들 100MB 이하, HTTPS만 허용 |
| **Scale/Scope** | 강좌 1만~10만 행, 소스 15개(소모임 제외. 잡아바·주변애·더팀스는 로컬 PC 수집), 화면 3개(홈·목록·상세) |
| **Cost** | Cloudflare Workers Paid $5 + Supabase Free $0 = **월 $5** |

## 결정 기록

| # | 결정 | 이유 | 대안 |
|---|---|---|---|
| D1 | 앱은 WebView(Vite + React) | 화면이 단순하다. 광고·`openURL` API가 RN과 같고, Granite 1.x 고정 제약이 없다 | RN(Granite): `app/`만 교체하면 됨 |
| D2 | DB는 Supabase(서울) | Postgres, 서울 리전, 무료로 시작 가능 | MySQL + Hyperdrive: DB를 따로 호스팅해야 함 |
| D3 | 앱 → **Worker 조회 API** → Supabase | DB 키를 숨기고, 캐시로 트래픽을 줄이고, 요청 제한으로 DB를 통째로 긁어가는 것을 막는다 | 앱 → Supabase 직접: 광고를 우회해 데이터를 통째로 가져갈 수 있음 |
| D4 | 수집은 Cloudflare Cron(같은 Worker) | 조회 API와 한곳에서 관리한다. Browser Rendering이 포함돼 있다 | GitHub Actions(약관이 회색지대), VM |
| D5 | Worker 1개에 `fetch`(API)와 `scheduled`(수집)를 같이 둔다 | 배포·시크릿·설정이 한 벌로 끝난다 | 무거워지면 수집 Worker를 분리 |
| D6 | (보류 2026-10-13 — 첫 출시는 광고 없음) 광고는 **배너, 화면당 1개**. 목록은 5번째 카드 뒤(5개 미만이면 마지막 뒤), 상세는 본문 아래 (정책: 같은 화면 같은 포맷 2개 이상 금지) | 초기에는 사용자 확보가 먼저라 이탈이 적은 배너를 쓴다. 스크롤 화면 배너는 앱인토스 정책에 맞는다 | 전면 광고를 섞는 A/B 테스트(예: 검색 3회에 1번) — 데이터가 쌓인 뒤 |
| D7 | 원문 링크는 상세 화면 보조 버튼(`openURL`) | 서비스 원칙과 앱인토스 외부 링크 정책 | — |
| D8 | 배너 로드 실패 시 자리를 숨기고 목록은 그대로 보여준다 | 광고 때문에 사용 흐름이 막히면 안 된다 | — |
| D9 | 수집 알림은 텔레그램 봇 | Worker에서 Bot API `sendMessage`를 한 번 호출하면 끝난다. 봇 토큰과 chat_id는 Worker secret에 둔다 | — |
| D10 | 수집은 하루 1회(03:00 KST 시작). 분기·학기 단위 소스는 주 1회 | 갱신 주기에 맞춘다. 비용과 공공 API 일일 한도에 여유가 있다 | 하루 2회도 월 $5~6 수준이라 가능 |
| D12 | 마감된 강좌는 수집·보관하지 않는다 | 쓸 데가 없다. 모집 중인 것만 받고, 마감일이 지났거나 원천에서 사라지면 지운다 | — |
| D13 | 카테고리 분류는 키워드 룰만 | 무료이고 결과가 예측 가능하다 | 놓치는 강좌가 많으면 LLM 분류 추가 |
| D11 | 사업자 등록은 즉시 진행 | 광고 정산과 고용24 인증키에 필요하다 | — |
| D14 | 조회 API 요청 제한은 IP당 분당 60회 (2026-10-11) | 정상 사용은 막지 않고, 목록을 통째로 긁어 가는 것은 늦춘다 | 낮추면 정상 사용자가 막힌다 |
| D15 | 커리큘럼·신청 인원(고용24만 있음)은 상세를 열 때 원천 상세에서 받아 보여 주고 저장하지 않는다. 캐시 6시간, 교과목·단원 이름과 시간만 (2026-10-14) | 신청 인원은 매일 바뀌어 수집 때 저장하면 하루 묵는다. 저장하지 않으니 FR-014 에 걸리지 않는다 | 매일 수집 때 상세까지 받기: 고용24 1200여 건 × 400KB |
| D16 | 정렬은 마감순(기본)·가격순·최신순. 가격순은 무료 0 → 금액(내일배움카드는 자부담), 모르면 맨 뒤. 최신순은 **우리 앱에 새로 들어온 순**(`id` 내림차순) (2026-10-14, 이름은 [이슈 #1](https://github.com/YoungkeunAhn/njob_matching_app/issues/1) 2026-10-16 "새로 올라온 순" → "최신순") | 고용24 는 목록에 접수 시작일이 없어 접수 시작일 순이면 전부 뒤로 간다 | 접수 시작일·교육 시작일 순 |
| D17 | 뒤로 가기 목록 복원은 메모리에 조건별 상태(카드·커서)를 최근 몇 개만 두고, 스크롤 위치는 history 항목에 둔다 (2026-10-14) | 앱을 다시 열면 처음부터 보여도 된다. 카드 수백 건을 직렬화하지 않는다 | sessionStorage |
| D18 | 찜은 토스 로그인으로 사용자를 식별한다. 마감 하루 전 10:00 KST 에 1회 푸시, 1인당 50개, 알림 동의를 거절해도 찜은 된다. 접수 마감일이 없으면 교육 시작일을 마감으로 본다 (2026-10-13) — [설계](../05-아키텍처/찜-토스로그인-마감알림.md) | 기기 저장만으로는 푸시 대상(`userKey`)을 알 수 없다 | 익명 기기 ID: 푸시 불가 |
| D19 | UI 는 TDS(`@toss/tds-mobile`)를 쓰고 화면마다 위계 3단계만 쓴다 (2026-10-13) — [디자인 규칙](../05-아키텍처/디자인-규칙.md) | 토스 글꼴·큰 글씨 설정은 TDS 컴포넌트로만 적용된다. 디자인 시스템을 따로 만들 일이 없다 | CSS 토큰만 흉내: 토스 글꼴 못 씀 |
| D20 | Cloudflare 에서 나가는 요청을 막는 소스(잡아바·주변애 2026-10-19 IP 차단, 더팀스 2026-10-20 봇 차단 화면)는 Worker Cron 에서 빼고 **로컬 PC**(Windows 작업 스케줄러 `njob-collect-local`, 매일 03:30 KST)가 `worker/scripts/collect-local.ts` 로 수집한다. 어댑터·`runGroup`·DB·알림은 Worker 와 같고, 소스 목록만 `sources/index.ts` 의 `LOCAL` 로 나뉜다 — [이슈 #2](https://github.com/YoungkeunAhn/njob_matching_app/issues/2) | 차단을 우회하지 않는다(로컬은 원래 막히지 않음). 2026-10-22 로컬 수집 1,097건(더팀스 1,076) 중 노출 217건으로 버리기엔 많다 | 수집 중단(2026-10-19~21 방식): 더팀스 공개 강좌 200여 건을 잃는다 · GitHub Actions: 러너 IP 도 막힐 수 있다 — PC 가 자주 꺼져 데이터가 낡으면 그때 옮긴다 |

## 소스별 수집 스케줄

### 원칙
- **갱신 주기에 맞춘다.** 수시로 올라오는 공고형 소스는 매일, 분기·학기 단위로 바뀌는 소스는 주 1회 수집한다.
- **모집 중인 것만 가져온다.** 원천에 "접수중·모집중" 필터나 접수 마감일 파라미터가 있으면 그걸로 걸러서 받는다. 필터가 없는 소스는 받은 뒤 접수 마감일이 지난 건 버린다.
- **사이트 부담을 줄인다.** 같은 도메인에는 요청 간 1~3초 간격을 두고, 목록은 모집 중인 페이지까지만 넘긴다.
- **새벽에 돌린다.** 03:00~05:00 KST는 원천 사이트 트래픽이 적고, 사용자 조회도 적다.

### 소스별 표

| # | 소스 | 방식 | 갱신 특성 | 주기 | 시각(KST) | 그룹 | 모집 중 필터 | 비고 |
|---|---|---|---|---|---|---|---|---|
| 1 | 고용24 훈련과정 | API (키 받기 전엔 공개 검색 HTML) | 과정 수시 등록 | 매일 | 03:00 | A | 훈련시작일 ≥ 오늘 (`srchTraStDt`) | 접수기간 필드가 없어 훈련시작일을 마감일로 쓴다 |
| 2 | 서울 공공서비스예약 교육 | API | 접수 상태 수시 변경 | 매일 | 03:10 | A | 상태 = 접수중 | 수백 건이라 전체 조회 |
| 3 | 대구 평생학습포털 | API | 강좌 수시 등록 | 매일 | 03:10 | A | 접수 마감일 ≥ 오늘 | 개발계정 1,800건/일 한도 안 |
| 4 | K-Startup 사업공고 | API | 공고 수시 | 매일 | 03:10 | A | 모집 상태 = 진행 | AI·교육 키워드로 거름 |
| 5 | 서울시평생학습포털 | HTML | 강좌 수시 등록 | 매일 | 03:20 | B | 모집중 목록 | |
| 6 | SeSAC | HTML | 과정 수시 모집 | 매일 | 03:20 | B | "모집중" 상태 | |
| 7 | 잡아바 | API(JSON) | 공고 수시 | 매일 | 03:30 | 로컬 | 접수 중 공고 | 2026-10-22 재개: 로컬 PC 작업 스케줄러가 수집(D20) |
| 8 | 주변애 | HTML | 월간 캘린더 | 매일 | 03:30 | 로컬 | 이번 달·다음 달 | 2026-10-22 재개: 로컬 PC 작업 스케줄러가 수집(D20) |
| 9 | 데브이벤트 | GitHub README | 수시 커밋 | 매일 | 03:20 | B | 이번 달 이후 항목만 | 파일 1개 |
| 10 | 링커리어 교육 | HTML | 공고 수시 | 매일 | 03:20 | B | 마감 전 공고 | |
| 11 | 더팀스 활동 | HTML | 공고 수시 | 매일 | 03:30 | 로컬 | 마감 전 공고 | 2026-10-22 재개: 로컬 PC 작업 스케줄러가 수집(D20). 약 2분 |
| 12 | ~~소모임~~ | — | — | **수집 안 함** | — | — | — | 2026-10-14 제외: 강의가 아니라 친목 모임 |
| 13 | AI디지털배움터 | 헤드리스 | 강좌 수시 등록 | 매일 | 03:40 | C | 접수중 | Browser Rendering. 1회 10분 이내 목표(월 10시간 포함분 안) |
| 14 | 전국평생학습강좌표준데이터 | API | 분기 갱신, 매월 초 병합 | **주 1회** | 월 04:30 | D | 접수 마감일 ≥ 오늘 | |
| 15 | K-MOOC | API / HTML | 학기 단위 개설 | **주 1회** | 월 04:30 | D | 수강신청 가능 강좌 | |
| 16 | 온통청년 | API | 정책 단위, 변동 적음 | **주 1회** | 월 04:30 | D | 신청기간 중 | |

### Cron 설정

`wrangler.toml`의 `crons`에 아래 7개를 넣는다. `scheduled` 핸들러는 `event.cron` 값으로 어느 그룹을 돌릴지 정한다. 소스를 옮기거나 주기를 바꿀 때는 코드의 `SCHEDULE` 표 한 곳만 고친다.

| Cron (UTC) | KST | 그룹 | 내용 |
|---|---|---|---|
| `0 18 * * *` | 매일 03:00 | A1. 고용24 | 1 (공개 검색 HTML 수집이 약 10분 걸려 따로 돈다, 2026-10-12 드라이런 591초) |
| `10 18 * * *` | 매일 03:10 | A2. 공식 API | 2~4 |
| `20 18 * * *` | 매일 03:20 | B. 정적 HTML | 5~12 |
| `40 18 * * *` | 매일 03:40 | C. 헤드리스 | 13 |
| `30 19 * * SUN` | 매주 월 04:30 | D. 주간 | 14~16 |
| `0 19 * * *` | 매일 04:00 | 후처리 | 정리(아래), 키워드 분류, 중복 표시, 건수 점검, 텔레그램 알림 |
| `0 1 * * *` | 매일 10:00 | 찜 마감 알림 | 내일 마감인 찜에 토스 푸시(`worker/src/me/push.ts`, 2026-10-13 추가) |

```ts
// worker/src/collect.ts
const SCHEDULE: Record<string, Source[]> = {
  "0 18 * * *":     [work24],
  "10 18 * * *":    [seoulYeyak, daeguLifelong, kstartup],
  "20 18 * * *":    [seoulLifelong, sesac, devEvent, linkareer],
  "40 18 * * *":    [digitalBaeum],
  "30 19 * * SUN":  [lifelongStd, kmooc, youthcenter],
};
```

- 그룹 하나가 CPU 15분이나 메모리 128MB를 넘으면 그 그룹만 시각을 나눠 쪼갠다.
- 주간 그룹 D는 월요일 04:30에 돌고, 그날 후처리(04:00)는 이미 지났다. 그래서 D 그룹은 끝날 때 자기 소스의 정리를 직접 한다.

## 마감 강좌 처리

**마감된 강좌는 수집하지 않고, DB에 남기지도 않는다.** 그래서 `status` 컬럼을 두지 않는다.

1. **수집 시점**: 위 표의 "모집 중 필터"로 모집 중인 것만 받는다.
2. **마감일이 지난 행**: 후처리에서 `apply_end < 오늘`인 행을 지운다. 접수 마감일이 없으면 교육 시작일(`course_start`)을 기준으로 한다. 조회 API도 같은 조건으로 한 번 더 거른다(수집과 수집 사이에 마감일이 지난 경우).
3. **원천에서 사라진 행**: 정원 조기 마감이나 취소로 원천에서 사라진 강좌다. 날짜로는 알 수 없으므로, **그 소스의 이번 수집이 성공했는데 결과에 없으면 지운다**.
   - 소스 장애로 멀쩡한 강좌가 지워지는 것을 막기 위해, 수집이 실패했거나 받은 건수가 직전 성공 대비 50% 미만이면 이 단계를 건너뛰고 텔레그램으로 알린다.

## API

| 메서드·경로 | 설명 | 캐시 |
|---|---|---|
| `GET /courses?region=11,41110&cat=video&sub=video_gen&type=oneday&sort=price&q=AI영상&cursor=` | 목록. `region`은 시도(2자리)·시군구(5자리) 코드 최대 3개(2026-10-13 사용자 요청), 하나라도 맞으면 포함. 온라인 강좌를 포함한다. 정렬 `sort`: 없음(또는 `deadline`)=접수 마감일 순, `price`=가격 낮은 순(무료 0, 금액 모름은 맨 뒤, 같으면 마감순), `new`=최신순(우리 앱에 새로 들어온 순, id 내림차순). 검색 `q`: 제목 부분 일치, 띄어쓰기·기호를 뺀 2~30자(원문 100자 이하), 다른 조건과 AND. 규칙은 `worker/src/core/search.ts`(알파벳 → 한글 이름, 초성만이면 초성 검색, 영문 자판 오타는 `es-hangul` 로 바꾼 후보를 OR)와 같은 규칙의 SQL 함수 `search_key`·`hangul_cho`(view 의 `search_key`·`title_cho` 열) (2026-10-15). 한 번에 20건 (2026-10-14 sort·q 추가) | 1시간 |
| `GET /courses/:id/extra` | 상세 보강: 고용24 강좌만 원천 상세 페이지·교과편성 팝업을 그때 받아 `{applicants, capacity, curriculum[]}`. 저장하지 않는다. 그 밖의 소스나 원천 실패는 200 + 빈 값(실패는 캐시하지 않음) (2026-10-14) | 6시간(성공만) |
| `GET /courses/:id` | 상세 | 1시간 |
| `GET /meta` | 카테고리 트리, 시도·시군구 목록 | 1일 |

- 응답에는 화면에 필요한 컬럼만 담는다. 내부 상태(`last_seen_at`·`category_by` 등)는 내보내지 않는다. `course_public` view 에는 검색·정렬용 `title_norm`·`price_sort` 가 있지만 응답 컬럼(`COURSE_COLUMNS`)에는 없다.
- 가격 필터(2026-10-27 무료 구현 후 세 분류로 확장): `cost=paid|free|card`를 붙이면 기존 `course_public.cost_type`이 해당 값인 행만 조회한다. 화면에는 유료·무료·내일배움으로 표시하며, 선택을 해제하면 비용 조건 없이 기존 전체 조회를 유지한다. 빈 값·중복·`partial` 등 미지원 필터 값은 400으로 거절한다. 금액 0만으로 무료로 판단하지 않으며, 일부지원·가격 미상은 전체 조회에서 유지하되 유료로 임의 재분류하지 않는다. 지역·분야·유형·온라인·검색과 AND로 적용하며, 정렬·다음 페이지·공유에도 같은 비용 조건을 유지한다. 예: `GET /courses?region=11&cat=genai&cost=card`.
- 목록 캐시 키는 정규화된 조건에 `cost`를 포함해 무료/전체 및 각 커서 페이지를 분리한다. `utm_*`는 앱의 유입 계측 정보이며 조회 API나 캐시 키로 전달하지 않는다. 비용 필터는 기존 컬럼을 사용하므로 DB 마이그레이션이 없고, 배포 순서는 Worker API → 비용 조건 없는 기존 앱 호환 확인 → 새 앱 번들이다. 로컬 구현·시험 결과와 운영 배포 여부는 구분한다.
- 응답 계약(`CourseItem`)에 필드를 더하면 `worker/src/api/handle.ts` 의 `CACHE_VER` 를 올린다(지금 `v3`, 검색 규칙 변경; `v2`는 `capacity` 추가). 안 올리면 배포 뒤 1시간 동안 캐시된 옛 모양이 나간다. 이번 무료 필터는 응답 모양을 바꾸지 않는다. 원천 원본(`raw`)은 저장하지 않는다(FR-014).
- CORS는 `https://<appName>.apps.tossmini.com`, `https://<appName>.private-apps.tossmini.com`만 허용한다.
- 쓰기 엔드포인트는 없다. 수동 수집 실행이 필요하면 `wrangler`로 Cron을 직접 트리거한다.

## Data Model

[수집-파이프라인-설계.md](../03-데이터수집/수집-파이프라인-설계.md) 3절의 `course`·`source` 테이블을 쓰되, `course`에서 `status`·`first_seen_at` 컬럼과 `category_by` 값 중 `llm`은 뺀다(마감 강좌를 보관하지 않고 키워드 룰만 쓰므로). 여기에 아래 테이블을 더한다.

```sql
create table collect_run (
  id          bigserial primary key,
  source      text not null references source(code),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  fetched     int,       -- 원천에서 받은 건수
  upserted    int,
  error       text
);
```

- 모든 테이블에 RLS를 켜고 anon 권한을 회수한다. Worker만 service_role 키로 접근한다.

## Project Structure

```
n-jobber-edu/
├─ app/                        # 앱인토스 WebView 미니앱
│  ├─ granite.config.ts
│  └─ src/
│     ├─ pages/                # Home(필터+버튼), List, Detail
│     └─ api.ts                # Worker 조회 API 호출
├─ worker/                     # Cloudflare Worker 1개
│  ├─ wrangler.toml            # crons, browser binding, rate limit, secrets
│  └─ src/
│     ├─ index.ts              # export default { fetch, scheduled }
│     ├─ api.ts                # /courses, /courses/:id, /meta
│     ├─ collect.ts            # Cron 그룹 → 소스 순차 실행 → upsert → collect_run
│     ├─ postprocess.ts        # 마감 정리·분류·중복·텔레그램 알림
│     ├─ classify.ts           # 키워드 룰 (course_type, category)
│     ├─ region.ts             # 주소 → 시군구 코드
│     └─ sources/              # 소스 1개 = 파일 1개 (fetch, normalize)
├─ supabase/
│  ├─ migrations/              # 테이블·인덱스·RLS
│  └─ types.ts                 # supabase gen types (app·worker 공용)
├─ docs/
└─ package.json                # npm workspaces: app, worker
```

## Complexity Tracking

| 일부러 뺀 것 | 추가할 시점 |
|---|---|
| LLM 분류 | 키워드 룰로 놓치는 강좌가 많다고 월 점검에서 확인될 때 |
| 로그인·찜·알림 | 사용자별 기능 요구가 생길 때. 로그인은 토스 로그인만 쓸 수 있다 |
| Cloudflare Queues로 소스별 분산 실행 | Cron 그룹 하나가 CPU 15분이나 메모리 128MB를 넘을 때 |
| 소스 간 정교한 중복 병합(`dedup_key`) | 같은 강좌가 두 번 보인다는 피드백이 나올 때 |
| 관리자 화면 | 수동 분류 보정이 잦아질 때. 그전에는 Supabase 콘솔에서 직접 고친다 |
| Supabase Pro($25) | 다운타임이나 백업이 문제가 될 때 |

## Open Questions

- 없음
