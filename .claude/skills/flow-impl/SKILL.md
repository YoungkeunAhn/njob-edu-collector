---
name: flow-impl
description: AI 워크플로우 3단계 — 승인된 실행 그래프의 노드를 테스트 포함 구현하고 노드마다 커밋한다. push·배포는 하지 않는다.
argument-hint: <#이슈번호>
disable-model-invocation: true
---

# 3단계 — 구현 (테스트 포함)

흐름 전체: `docs/08-AI워크플로우/00-START-HERE.md`. **이 단계는 마지막 노드 커밋에서 끝난다. push·빌드·배포하지 않는다** — 그건 `/flow-ship`.

대상: $ARGUMENTS

1. **착수 확인** — `gh issue view <N> --json labels,comments`. `plan-approved` 가 없으면 멈추고 알린다. 댓글의 그래프 문서(`backlogs/NNN-…/00-START-HERE.md`)를 읽는다.
2. **노드 진행** — `graph-plan` 스킬 §8 루프를 그래프 위상 순서대로 돈다. 노드 1개 = 커밋 1개, 커밋 메시지 끝에 `(#N)`. 이미 커밋된 노드는 건너뛴다(재개 = 마지막 커밋).
3. **검증 — 노드마다 커밋 전**
   - `npm test && npm run typecheck` (루트) 초록.
   - 화면 노드는 그래프의 W-id 를 `npm run dev -w app` 로 띄워 aside 로 확인.
   - 마지막 노드 뒤 `/code-review` 로 전체 변경을 한 번 더 본다. 반영할 것이 있으면 고치고 커밋.
   - **빈 출력은 clean 이 아니라 무효(E0)다.** 1회만 재시도한다: 서브에이전트(읽기 전용)에 `git diff` 범위 · 그래프의 이 노드 교차검증 초점 · 출력 형식 `[MAJOR|MINOR] [파일:줄] 문제 + 근거`, 없으면 `findings 없음` + 확인한 것 한 줄(빈 출력 금지)을 넣어 돌린다. 또 비면 멈추고 보고한다. 커밋 메시지에 라운드(E0 → 재시도)를 남긴다.
4. **멈추는 곳** — 그래프의 게이트·사용자 노드(`U`), 3회 재시도 실패, 그래프에 없는 일이 필요해질 때. 상황·선택지를 보고하고 기다린다.
5. **마감** — `git status --porcelain` 비어 있음 확인. 그래프 문서 상태 줄을 `구현 완료 · 배포 대기` 로, `backlogs/00-START-HERE.md` 상태 열도 같이 고쳐 커밋. 이슈에 노드별 커밋 표를 댓글로 남기고:
   ```bash
   gh issue edit <N> --remove-label stage:planned --add-label stage:built
   ```
6. 끝 보고: 노드별 커밋·테스트 결과, 배포 영향(DB·Worker·앱), "배포하려면 `/flow-ship #N`" 한 줄. 여기서 멈춘다.
