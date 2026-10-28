---
name: flow-submit
description: AI 워크플로우 5단계 — 실기기 확인이 끝난 번들을 릴리스 노트와 함께 토스 검수요청하고 기록한다.
argument-hint: <#이슈번호>
disable-model-invocation: true
---

# 5단계 — 검수요청

흐름 전체: `docs/08-AI워크플로우/00-START-HERE.md`. **콘솔 "출시하기"는 하지 않는다** — 검수 통과 후 사용자가 한다.

대상: $ARGUMENTS

1. **착수 확인** — 이슈 라벨 `stage:testing`. **`/flow-submit #N` 을 부른 것 = 실기기 확인 통과 선언**으로 본다(다시 묻지 않는다). 인자에 실패 내용이 있으면(예: `#1 칩이 안 바뀜`) 검수요청하지 않고, 실패 내용을 이슈 댓글로 남긴 뒤 `/flow-impl #N` 재진행을 권한다.
2. **번들 확인** — `mcp__apps-in-toss-console__bundle_list` 에서 4단계에 기록한 번들 번호가 맞고 `isTested=true` 인지 본다. 콘솔 ID 는 `docs/07-운영/배포-런북.md` 5절.
3. **검수요청** — 릴리스 노트(이슈 기대 동작에서 사용자 눈에 보이는 변화만 1~4줄, 해요체)를 `bundle_submit_review` 의 `releaseNotes` 에 바로 넣는다(`bundle_set_release_note` 따로 부르지 않는다). hook 확인 1회가 유일한 승인이다.
4. **기록** — 그래프 문서 상태 줄과 `backlogs/00-START-HERE.md` 상태 열을 **Edit 도구로**(sed 금지 — 이모지에서 조용히 실패) `검수 요청(<날짜>, 번들 <번호>)` 로 고쳐 커밋 `docs: NNN 검수 요청 (#N)` 후 push. 이슈에 댓글(릴리스 노트 포함)로 남기고:
   ```bash
   gh issue edit <N> --remove-label stage:testing --add-label stage:review
   ```
5. 끝 보고(릴리스 노트 · 상태 REVIEWING · 남은 일). 여기서 멈춘다.

**검수 결과가 나오면**: 통과 → 사용자가 콘솔 "출시하기" → `/flow-close #N`(docs 이관·백로그 삭제·이슈 닫기). 반려 → `review_get_feedback` 으로 사유를 받아 **새 이슈를 `/flow-ticket` 으로** 만든다(사유 원문 인용, 유형 `검수반려`, 원래 이슈 링크).
