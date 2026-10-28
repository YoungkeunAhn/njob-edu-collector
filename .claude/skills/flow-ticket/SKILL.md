---
name: flow-ticket
description: AI 워크플로우 1단계 — 수정사항·변경사항을 티켓 양식으로 정리해 GitHub 이슈로 등록한다.
argument-hint: <변경사항 설명>
disable-model-invocation: true
---

# 1단계 — 티켓

흐름 전체: `docs/08-AI워크플로우/00-START-HERE.md`. **이 단계는 이슈 등록에서 끝난다. 계획·구현을 시작하지 않는다.**

입력: $ARGUMENTS

1. `docs/08-AI워크플로우/01-티켓-양식.md` 를 읽고 그 양식·규칙대로 쓴다.
2. 입력을 이슈 단위로 나눈다(양식의 "변경사항 1건 = 이슈 1개").
3. 이슈마다 겹치는 열린 이슈를 찾는다: `gh issue list --state open --search "<키워드>"`. 겹치면 새로 만들지 않고 그 이슈에 댓글로 더한다.
4. `확인 필요:` 칸이 있거나 완료 기준이 없으면 **등록 전에** 한 번에 모아 묻는다(AskUserQuestion).
5. 라벨이 없으면 만든다(있으면 그대로 둔다):
   ```bash
   for l in stage:ticket stage:planned plan-approved stage:built stage:testing stage:review; do gh label create "$l" --color ededed 2>/dev/null; done
   ```
6. 등록: 본문은 임시 파일로 넘긴다(scratchpad).
   ```bash
   gh issue create --title "[유형] 요지" --body-file <파일> --label "<bug|enhancement>,stage:ticket"
   ```
7. 끝 보고: 이슈 번호·링크 목록, 그리고 "확인 후 `/flow-plan #N`" 한 줄. 여기서 멈춘다.
