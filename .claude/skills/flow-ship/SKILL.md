---
name: flow-ship
description: AI 워크플로우 4단계 — push, 배포 런북 순서로 DB·Worker·앱 번들 배포, 토스 테스트 푸시까지. 실기기 확인에서 멈춘다.
argument-hint: <#이슈번호>
disable-model-invocation: true
---

# 4단계 — 배포 · 테스트 요청

흐름 전체: `docs/08-AI워크플로우/00-START-HERE.md`. 절차 정본: `docs/07-운영/배포-런북.md`. **이 단계는 토스 테스트 푸시에서 끝난다. 검수요청하지 않는다** — 그건 실기기 확인 뒤 `/flow-submit`.

대상: $ARGUMENTS

1. **착수 확인** — 이슈 라벨 `stage:built`, `git status --porcelain` 비어 있음, `npm test && npm run typecheck` 초록. 그래프 문서의 **배포 영향** 줄을 읽어 아래 3~5 중 필요한 것만 한다.
2. **push** — `git push origin main`.
3. **DB** (마이그레이션이 있을 때만) — 사용자 노드다. 마이그레이션 파일 경로를 알려 주고 SQL Editor 적용(또는 `supabase db push`)을 요청한 뒤 **답을 기다린다.** view 를 바꾸는 배포는 DB 가 Worker 보다 먼저다.
4. **Worker** (worker 변경이 있을 때만) — `cd worker && npx wrangler deploy --dry-run` 후 `npx wrangler deploy`. 버전 ID 를 적어 둔다. 운영 API 를 이슈 완료 기준으로 `curl` 확인.
5. **앱** (app 변경이 있을 때만)
   - 빌드: `VITE_API_BASE=<운영 Worker 주소> npm run build -w app` → `app/njob-matching.ait`.
   - 콘솔 ID: `docs/07-운영/배포-런북.md` 5절(workspaceId·miniAppId). `deploymentId` 는 `ait build` 출력값.
   - **한글 전달 사전 검사(필수)**: 런북 5-0절대로 UTF-8 프롬프트·메모 파일을 준비하고 `node scripts/claude-utf8.mjs run --prompt <파일> --memo <메모파일> --args <추가인자JSON파일> --output <결과파일> --check-only`로 로컬 한글 전달 검사를 통과한다. 모든 CLI 한글 프롬프트는 파일 경로로 래퍼에 전달한다. PowerShell에서는 `./scripts/Invoke-ClaudeUtf8.ps1 run ...`을 사용하며 `Get-Content ... | claude ...` 직접 파이프나 명령행에 한글을 펼치는 방식을 쓰지 않는다. Node는 `shell: false`, `windowsHide: true`로 실행하고 추가 터미널 창을 열지 않는다. `--args`에는 토스 콘솔만 담은 `--mcp-config`와 단계별 정확한 `--allowedTools` 추가 옵션만 넣는다. strict·dontAsk·stream-json·verbose·위험 도구 차단은 코드가 강제하므로 파일에서 다시 지정하거나 덮어쓰지 않는다.
   - 등록·업로드: 사전 검사에 통과한 동일 파일로 `--check-only`를 빼고 실행한다. `mcp__apps-in-toss-console__bundle_upload`(원문 memo 120자 이하) → 받은 `uploadUrl` 에 `curl -X PUT -H 'Content-Type: application/zip' --data-binary @app/njob-matching.ait '<uploadUrl>'` → `bundle_upload_complete` → `bundle_build_status`로 완료 확인. PREPARE 상태는 `bundle_list`에서 보이지 않을 수 있어 CREATED 이후 메모를 검증한다.
   - **도구 권한 분리(필수)**: 일반 `run`은 코드에서 `--permission-mode dontAsk`와 정확한 등록·조회 도구 허용 목록을 강제하고 `bundle_test_push`·검수 요청을 차단한다. 전역 `bypassPermissions`나 프롬프트 문구만으로 다음 단계 실행을 제한하지 않는다. 출시 도구 이름은 추정하지 않으며 허용 목록 밖의 도구를 호출하지 않는다.
   - **설정 상속 차단**: CLI의 `--setting-sources ''`를 고정해 user·project·local 설정의 광범위한 `permissions.allow` 병합을 막는다. 관리형 정책은 존중하고, `run`·`test-push`는 검수 도구 자체를 차단한다. 검수 승인 hook과 별도 `/flow-submit` 절차는 변경하지 않는다.
   - **등록 메모 대조(필수)**: 완료 후 `bundle_list`를 별도 호출하고 `--output-format stream-json --verbose`의 stdout 원본을 파일로 저장한다. `node scripts/claude-utf8.mjs verify-memo --expected <메모원문파일> --actual <원시trace파일> --deployment-id <ID> --workspace-id 52463 --mini-app-id 85989`로 **이번 deploymentId**의 메모를 대조한다. 검증기는 정확한 `mcp__apps-in-toss-console__bundle_list`의 tool_use ID와 tool_result ID를 연결하고 입력 workspaceId·miniAppId까지 확인해 실제 결과를 읽는다. `text` 출력·모델의 assistant/result 요약·직접 추출/재작성한 JSON 객체는 증거로 쓰지 않는다. 불일치·대상 누락이면 상태를 보고하고 테스트·검수·출시를 멈추며, 자동 중복 업로드·새 번들 등록·조용한 ASCII 대체를 하지 않는다. 번들 번호·deploymentId와 로컬 전달·메모 대조 결과를 적어 둔다.
   - 테스트 요청: `node scripts/claude-utf8.mjs test-push --expected <메모원문파일> --actual <원시trace파일> --deployment-id <ID> --workspace-id 52463 --mini-app-id 85989 --args <MCP설정추가인자JSON파일> --output <새trace파일>`로만 진행한다. 원본 trace 재검증에 통과한 뒤 고정 프롬프트·대상 ID와 테스트 푸시·번들 확인만 허용한 정확한 도구 목록으로 `mcp__apps-in-toss-console__bundle_test_push`를 호출한다. 이 명령의 `--args`에는 `--mcp-config`만 허용하며 `--allowedTools`도 코드가 정한다. 일반 `run`의 차단을 해제하지 않는다. 성공해도 실제 기기 테스트 통과로 기록하지 않는다.
6. **기록** — 그래프 문서 상태 줄에(**Edit 도구로** — sed 는 이모지에서 조용히 실패) 배포 기록(직전 그래프 형식: 마이그레이션 → Worker 버전 → 앱 번들 번호·deploymentId, 운영 확인 결과)과 `실기기 확인 대기(🟡)`. `backlogs/00-START-HERE.md` 상태 열도 고친다. 커밋 `docs: NNN 배포 기록(Worker <버전>·앱 번들 <번호>) (#N)` 후 push.
7. **이슈 갱신** — 배포 기록과 **실기기 확인 목록**(이슈 완료 기준 + 런북 5절 관문)을 댓글로 남기고:
   ```bash
   gh issue edit <N> --remove-label stage:built --add-label stage:testing
   ```
8. 끝 보고: 배포한 것, 실기기 확인 목록, "확인되면 `/flow-submit #N`" 한 줄. 여기서 멈춘다.

실패하면 그 자리에서 멈추고 보고한다. 롤백(`bundle_rollback`, Worker 이전 버전)은 사용자가 요청할 때만.
