---
name: flow-plan
description: AI 워크플로우 2단계 — GitHub 이슈를 /graph-plan 실행 그래프로 자르고 backlogs/ 아래 폴더에 문서로 저장한다. G0 승인에서 멈춘다.
argument-hint: <#이슈번호 …>
disable-model-invocation: true
---

# 2단계 — 실행계획

흐름 전체: `docs/08-AI워크플로우/00-START-HERE.md`. **이 단계는 계획 문서 커밋과 G0 질문에서 끝난다. 승인을 받아도 구현을 시작하지 않는다** — 구현은 `/flow-impl`.

대상: $ARGUMENTS

1. **착수 확인** — 이슈마다 `gh issue view <N> --json title,body,labels,comments`. `stage:ticket` 라벨이 없으면 멈추고 알린다(1단계를 안 거친 것).
2. **폴더** — 다음 번호 `NNN` 은 `backlogs/` 의 가장 큰 번호 + 1. 폴더는 `backlogs/NNN-이슈<N>-<요지>/`(이슈 여러 개면 `이슈12-13`). 실행 그래프는 그 폴더의 `00-START-HERE.md` 에 쓴다. 문서 첫머리에 이슈 링크를 둔다.
3. **계획** — `graph-plan` 스킬을 그 절차대로 따른다(§0 착수 조건 ~ §6 DoD). 대상 정본은 이슈 본문이고, 완료 기준이 곧 테스트·관문의 기준이다. 형식은 `backlogs/` 에 진행 중인 그래프가 있으면 그것, 없으면 git 의 예시(`git show a263644:backlogs/002-사용자피드백-6건-실행그래프.md`)에 맞춘다. 배포는 그래프 노드가 아니다 — 4·5단계(`/flow-ship`·`/flow-submit`)가 한다. 대신 그래프에 **배포 영향**(DB 마이그레이션 여부 · Worker · 앱 번들)을 한 줄로 적는다.
4. **등록** — `backlogs/00-START-HERE.md` 인덱스 표에 행 추가(상태: `계획 · G0 대기`).
5. **커밋** — `docs: NNN 실행 그래프 (#N)`. push 하지 않는다.
6. **이슈 갱신** — 이슈에 그래프 문서 경로와 Q 개수를 댓글로 남기고 라벨 교체:
   ```bash
   gh issue edit <N> --remove-label stage:ticket --add-label stage:planned
   ```
7. **G0** — Q-표가 있으면 한 번에 모아 묻는다(AskUserQuestion, 권고안 먼저). 답을 문서에 반영·커밋하고 `gh issue edit <N> --add-label plan-approved`. Q 가 없으면 "승인하면 `/flow-impl #N`" 으로 묻고, 사용자가 승인했을 때만 라벨을 붙인다. 여기서 멈춘다.
