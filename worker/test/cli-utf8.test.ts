import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const runner = join(root, "scripts/claude-utf8.mjs");
const dirs: string[] = [];
const run = (args: string[]) => spawnSync(process.execPath, [runner, ...args], { encoding: "utf8", windowsHide: true, shell: false });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "njob-utf8-한글 경로-")); dirs.push(dir);
  const prompt = join(dir, "prompt.txt"), memo = join(dir, "memo.txt"), output = join(dir, "result.txt"), args = join(dir, "args.json"), child = join(dir, "child.mjs");
  writeFileSync(prompt, "한글 프롬프트 & 'quote' `backtick` $(literal) 😀\n둘째 줄", "utf8");
  writeFileSync(memo, "무료 강좌·공유 오류 수정\r\n", "utf8");
  writeFileSync(child, "process.stdin.pipe(process.stdout);", "utf8");
  writeFileSync(args, JSON.stringify([child]));
  const cli = ["run", "--prompt", prompt, "--memo", memo, "--output", output, "--args", args, "--executable", process.execPath];
  return { dir, prompt, memo, output, args, child, cli };
}
const target = { deploymentId: "deployment-1", workspaceId: 52463, miniAppId: 85989 };
function trace(memo = "무료 강좌·공유 오류 수정") {
  return [
    { type: "assistant", message: { content: [{ type: "tool_use", id: "tool-1", name: "mcp__apps-in-toss-console__bundle_list", input: { workspaceId: target.workspaceId, miniAppId: target.miniAppId } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tool-1", content: [{ type: "text", text: JSON.stringify({ contents: [{ deploymentId: target.deploymentId, miniAppId: target.miniAppId, memo }] }) }] }] } },
    { type: "result", subtype: "success", is_error: false },
  ];
}
const saveTrace = (file: string, rows: unknown[]) => writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
const targetArgs = ["--deployment-id", target.deploymentId, "--workspace-id", String(target.workspaceId), "--mini-app-id", String(target.miniAppId)];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("CLI UTF-8 deployment gate", () => {
  test("한글·기호·개행을 실제 child stdin으로 보존하고 검증한 메모를 삽입한다", () => {
    const f = setup(); const r = run(f.cli);
    expect(r.status, r.stderr).toBe(0);
    const delivered = readFileSync(f.output, "utf8");
    expect(delivered.startsWith(readFileSync(f.prompt, "utf8"))).toBe(true);
    expect(delivered).toContain(JSON.stringify("무료 강좌·공유 오류 수정"));
    expect(r.stdout).not.toContain("한글 프롬프트");
    expect(r.stdout).not.toContain("무료 강좌");
  });

  test("check-only는 외부 CLI를 실행하지 않고 결과 파일도 만들지 않는다", () => {
    const f = setup(); writeFileSync(f.child, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(f.dir, "called"))}, 'x');`);
    const r = run([...f.cli, "--check-only"]);
    expect(r.status, r.stderr).toBe(0); expect(r.stdout).toContain("UTF8_PREFLIGHT_OK");
    expect(existsSync(f.output)).toBe(false); expect(existsSync(join(f.dir, "called"))).toBe(false);
  });

  test.each([
    Buffer.from([0xff, 0xfe, 0x61, 0x00]), Buffer.from([0xc3, 0x28]), Buffer.from("a\0b", "utf8"), Buffer.from("깨짐 \ufffd", "utf8"),
  ])("손상·UTF16·NUL 입력이면 실행 전에 중단한다: %j", (bytes) => {
    const f = setup(); writeFileSync(f.prompt, bytes);
    const r = run(f.cli); expect(r.status).not.toBe(0); expect(existsSync(f.output)).toBe(false);
  });

  test("UTF8 BOM을 허용하고 메모의 ???? 손상은 사전 차단한다", () => {
    const f = setup(); writeFileSync(f.prompt, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("정상 한글")]));
    expect(run([...f.cli, "--check-only"]).status).toBe(0);
    writeFileSync(f.memo, "?? ????? (commit)");
    expect(run(f.cli).status).not.toBe(0); expect(existsSync(f.output)).toBe(false);
  });

  test("ASCII로 손상시킨 child roundtrip은 통과하지 않는다", async () => {
    const { verifyTransport } = await import(new URL("../../scripts/claude-utf8.mjs", import.meta.url).href);
    expect(() => verifyTransport((_exe: string, _args: string[], input: string) => ({ status: 0, stdout: Buffer.from(input.replace(/[^\x00-\x7f]/g, "?")) }))).toThrow("round-trip failed");
  });

  test("downstream 실패코드와 출력 파일을 보존하고 터미널에 응답을 노출하지 않는다", () => {
    const f = setup(); writeFileSync(f.child, "process.stdout.write('https://signed.example/private'); process.stderr.write('diagnostic'); process.exitCode=7;");
    const r = run(f.cli); expect(r.status).toBe(7);
    expect(readFileSync(f.output, "utf8")).toBe("https://signed.example/private");
    expect(readFileSync(`${f.output}.stderr`, "utf8")).toBe("diagnostic");
    expect(r.stdout + r.stderr).not.toContain("signed.example");
  });

  test("기존 출력이나 입력 파일을 덮어쓰지 않는다", () => {
    const f = setup(); writeFileSync(f.output, "keep");
    expect(run(f.cli).status).not.toBe(0); expect(readFileSync(f.output, "utf8")).toBe("keep");
  });

  test("renamed CLI나 command wrapper는 guard 없이 실행되지 않는다", () => {
    const f = setup();
    for (const executable of ["claude.cmd", "renamed-claude.exe", "powershell.exe"]) {
      const args = [...f.cli]; args[args.indexOf("--executable") + 1] = executable;
      const result = run(args); expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Executable must be Claude"); expect(existsSync(f.output)).toBe(false);
    }
  });

  test("원본 tool_use와 tool_result를 연결하고 앱·deployment·memo를 정확히 비교한다", () => {
    const f = setup(); const actual = join(f.dir, "actual.jsonl");
    const args = ["verify-memo", "--expected", f.memo, "--actual", actual, ...targetArgs];
    saveTrace(actual, trace());
    expect(run(args).status).toBe(0);
    for (const memo of ["?? ??", "무료 강좌·공유 오류 수정 ", "다른 메모"]) {
      saveTrace(actual, trace(memo)); expect(run(args).status).not.toBe(0);
    }
    saveTrace(actual, trace());
    expect(run(args.map((arg) => arg === "52463" ? "52464" : arg)).status).not.toBe(0);
    expect(run(args.map((arg) => arg === target.deploymentId ? "another-deployment" : arg)).status).not.toBe(0);
    const wrongToolId = JSON.stringify(trace()).replace('"tool_use_id":"tool-1"', '"tool_use_id":"other"');
    saveTrace(actual, JSON.parse(wrongToolId)); expect(run(args).status).not.toBe(0);
  });

  test("모델 요약·재작성 JSON·assistant 본문·잘린/실패 trace는 증거가 아니다", () => {
    const f = setup(); const actual = join(f.dir, "actual.jsonl");
    const args = ["verify-memo", "--expected", f.memo, "--actual", actual, ...targetArgs];
    const forgery = { deploymentId: target.deploymentId, memo: "무료 강좌·공유 오류 수정" };
    const failures = [
      [forgery],
      [{ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(forgery) }] } }, trace().at(-1)],
      [{ type: "result", subtype: "success", is_error: false, result: JSON.stringify(forgery) }],
      trace().slice(0, -1),
      [...trace().slice(0, -1), { type: "result", subtype: "error_max_turns", is_error: true }],
      [{ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(trace()) }] } }, trace().at(-1)],
    ];
    for (const rows of failures) { saveTrace(actual, rows); expect(run(args).status).not.toBe(0); }
  });

  test("같은 deployment의 상충하는 후속 메모가 있으면 첫 정상값으로 통과하지 않는다", () => {
    const f = setup(); const actual = join(f.dir, "actual.jsonl");
    const later = JSON.parse(JSON.stringify(trace("잘못된 메모")).replaceAll("tool-1", "tool-2"));
    saveTrace(actual, [...trace().slice(0, -1), ...later]);
    expect(run(["verify-memo", "--expected", f.memo, "--actual", actual, ...targetArgs]).status).not.toBe(0);
  });

  test("Claude 단계 guard는 bypass/출력형식/임의 tool override를 거절한다", async () => {
    const { claudeArgs } = await import(new URL("../../scripts/claude-utf8.mjs", import.meta.url).href);
    const args = claudeArgs(["--allowedTools", "Read,Glob,Grep"]);
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args[args.indexOf("--disallowedTools") + 1]).toContain("mcp__apps-in-toss-console__bundle_test_push");
    for (const extra of [
      ["--permission-mode", "bypassPermissions"], ["--allowedTools", "mcp__apps-in-toss-console__*"],
      ["--allowedTools", "Bash"], ["--output-format", "text"], ["--disallowedTools", "Read"],
      ["--setting-sources", "user,project,local"],
      ["--allowedTools", "mcp__apps-in-toss-console__bundle_test_push"],
    ]) expect(() => claudeArgs(extra)).toThrow();
    expect(() => claudeArgs(["--allowedTools", "Read"], "test-push")).toThrow();
    const push = claudeArgs([], "test-push");
    expect(push[push.indexOf("--setting-sources") + 1]).toBe("");
    expect(push[push.indexOf("--allowedTools") + 1]).toBe("ToolSearch,mcp__apps-in-toss-console__bundle_test_push,mcp__apps-in-toss-console__bundle_list");
    expect(push[push.indexOf("--disallowedTools") + 1]).toContain("mcp__apps-in-toss-console__review_submit");
  });

  test("test-push는 메모 불일치 시 실행하지 않고 성공 시 검증 target만 고정한다", () => {
    const f = setup(); const actual = join(f.dir, "actual.jsonl");
    const args = ["test-push", "--expected", f.memo, "--actual", actual, ...targetArgs, "--output", f.output, "--args", f.args, "--executable", process.execPath];
    saveTrace(actual, trace("?? 깨진 값"));
    expect(run(args).status).not.toBe(0); expect(existsSync(f.output)).toBe(false);
    saveTrace(actual, trace());
    expect(run([...args, "--check-only"]).status).toBe(0); expect(existsSync(f.output)).toBe(false);
    expect(run(args).status).toBe(0);
    const delivered = readFileSync(f.output, "utf8");
    expect(delivered).toContain(JSON.stringify({ workspaceId: 52463, miniAppId: 85989, deploymentId: "deployment-1" }));
    expect(delivered).toContain("Do not omit deploymentId");
    expect(delivered).not.toContain("한글 프롬프트");
  });

  test.runIf(process.platform === "win32")("Windows PowerShell wrapper도 한글 경로·문자열·exit code를 보존한다", () => {
    const f = setup();
    const invoke = () => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts/Invoke-ClaudeUtf8.ps1"), ...f.cli], { encoding: "utf8", windowsHide: true, shell: false });
    const ok = invoke(); expect(ok.status, ok.stderr).toBe(0); expect(readFileSync(f.output, "utf8")).toContain("무료 강좌·공유 오류 수정");
    rmSync(f.output); rmSync(`${f.output}.stderr`);
    writeFileSync(f.child, "process.exitCode=9;");
    const fail = invoke(); expect(fail.status, fail.stderr).toBe(9);
  });
});
