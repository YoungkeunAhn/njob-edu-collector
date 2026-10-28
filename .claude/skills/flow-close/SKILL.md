---
name: flow-close
description: AI 워크플로우 6단계(마무리) — 출시·운영 확인이 끝난 이슈의 백로그 문서를 docs 정본으로 이관하고 backlogs 폴더를 삭제한 뒤 이슈를 닫는다.
argument-hint: <#이슈번호>
disable-model-invocation: true
---

# 6단계 — 마무리 (docs 이관 · 백로그 삭제 · 이슈 닫기)

흐름 전체: `docs/08-AI워크플로우/00-START-HERE.md`. **`/flow-close #N` 을 부른 것 = 사용자가 결과를 확인했다는 뜻**이다(graph-plan §7 「🟡 삭제는 사용자 확인 후」의 확인). 다시 묻지 않는다.

대상: $ARGUMENTS

1. **착수 확인** — 결과가 실제로 끝났는지 본다. 아니면 멈추고 무엇이 남았는지 알린다.
   - 앱 번들: `bundle_get_live_version`(콘솔 ID 는 런북 5절)의 번들이 이 이슈의 번들(또는 그 뒤 번들)인가 — 검수 승인 + "출시하기"까지.
   - Worker·DB 만: 그래프 문서 상태 줄에 적힌 Cron 확인 기준을 `collect_run` 으로 조회해 맞는가.
2. **이관** — 그래프 문서(`backlogs/NNN-이슈<N>-…/00-START-HERE.md`)를 읽고 **남길 것만** 정본으로 옮긴다. 복사하지 않고 그 문서의 문체·표 형식에 맞춰 한두 줄로 줄인다.

   | 그래프의 내용 | 옮길 곳 |
   |---|---|
   | Q-표의 답(설계·제품 결정) | `docs/06-스펙/plan.md` 「결정 기록」 다음 D 번호 행(이유·대안 + 이슈 링크) |
   | 동작·화면·API 변화 | `spec.md`·`plan.md` — 노드 단계에서 이미 고쳤는지 확인하고 빠진 것만 |
   | 원인·운영 주의(다시 밟기 쉬운 함정) | `docs/07-운영/배포-런북.md` 「알아 둘 동작」 또는 그 소스 문서(`docs/02-교육소스/…`) |
   | 방법론 발견(워크플로우·검증 방식) | `docs/08-AI워크플로우/02-스킬과-게이트.md` 회고 또는 해당 스킬 |
   | 사실 표·노드·테스트 표·커밋·배포 기록 | **옮기지 않는다** — 이슈 마감 댓글에 요약(아래 4) |

3. **삭제·링크** — `grep -rn "backlogs/NNN-" docs backlogs .claude` 로 그래프 문서를 가리키는 링크를 이관한 docs 위치(또는 이슈 링크)로 바꾼다. `git rm -r backlogs/NNN-…/` · `backlogs/00-START-HERE.md` 인덱스 행 삭제(Edit 도구). `npx vitest run worker/test/docs.test.ts`(T11-1 링크 검사) 초록. 커밋 `docs: NNN 마감 — docs 이관·백로그 삭제 (#N)` → push.
4. **이슈 닫기** — 마감 댓글: 이관한 곳 목록(파일·D 번호) · 노드별 커밋 · 배포 기록 · 남은 일. 남은 일이 있으면 먼저 `flow-ticket` 양식으로 새 이슈를 만들고 링크한다. 그다음 `gh issue close <N>`.
5. 끝 보고: 이관한 곳 · 삭제한 폴더 · 새로 만든 이슈. 여기서 멈춘다.
