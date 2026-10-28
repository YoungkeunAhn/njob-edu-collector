#!/usr/bin/env node
// Keep prompts out of PowerShell's native-command text pipeline.
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE = '한글 전달 확인 · 무료 강좌 / 공유 "메모" & <test> 😀\r\n둘째 줄';
const TOSS = 'mcp__apps-in-toss-console__';
const BUNDLE_LIST = `${TOSS}bundle_list`;
const TEST_PUSH = `${TOSS}bundle_test_push`;
const BUILTINS = ['Read', 'Write', 'Glob', 'Grep', 'ToolSearch'];
const RUN_TOOLS = [...BUILTINS, ...['bundle_upload', 'bundle_upload_complete', 'bundle_build_status', 'bundle_list', 'bundle_get_live_version', 'miniapp_get', 'miniapp_get_status', 'miniapp_release_status'].map((name) => TOSS + name)];
const BLOCKED_MUTATIONS = ['bundle_submit_review', 'review_submit', 'review_cancel', 'bundle_rollback', 'bundle_set_release_note'].map((name) => TOSS + name);

function decodeUtf8(bytes) {
  let value;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Input must be valid UTF-8 (an optional UTF-8 BOM is accepted).'); }
  if (/[\u0000\ufffd]/u.test(value)) throw new Error('Input contains NUL or a Unicode replacement character.');
  return value;
}

export function readUtf8(path) {
  return decodeUtf8(readFileSync(path));
}

export function readMemo(path) {
  // A text editor may add one final newline; all other characters are exact.
  const memo = readUtf8(path).replace(/\r?\n$/u, '');
  if (!memo.trim() || memo.length > 120 || /[\r\n]|\?{2,}/u.test(memo)) {
    throw new Error('Memo must be one nonempty line of at most 120 UTF-16 code units, without repeated question marks.');
  }
  return memo;
}

/** Both the local byte probe and the real CLI use this exact transport. */
export function sendUtf8(executable, args, input) {
  return spawnSync(executable, args, {
    input: Buffer.from(input, 'utf8'),
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
}

export function verifyTransport(send = sendUtf8) {
  const result = send(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], SAMPLE);
  if (result.error || result.status !== 0 || !Buffer.from(result.stdout ?? []).equals(Buffer.from(SAMPLE, 'utf8'))) {
    throw new Error('UTF-8 child-process round-trip failed; external command was not started.');
  }
}

function targetFrom(o) {
  const deploymentId = required(o, '--deployment-id');
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(deploymentId)) throw new Error('Invalid deploymentId.');
  const positiveId = (key) => {
    const value = required(o, key);
    if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Workspace and mini-app IDs must be positive integers.');
    return Number(value);
  };
  return { deploymentId, workspaceId: positiveId('--workspace-id'), miniAppId: positiveId('--mini-app-id') };
}

/** Evidence is the original stream trace, never assistant prose or a rewritten JSON object. */
export function verifyMemo(expectedPath, actualPath, target) {
  const expected = readMemo(expectedPath);
  const events = readUtf8(actualPath).split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
  const final = events.at(-1);
  if (final?.type !== 'result' || final.subtype !== 'success' || final.is_error !== false) throw new Error('Evidence must be a complete successful Claude stream-json trace.');
  const calls = new Map();
  const completed = new Set();
  let matches = 0;
  for (const event of events) {
    const content = event?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (event.type === 'assistant' && part.type === 'tool_use' && part.name === BUNDLE_LIST) {
        if (typeof part.id !== 'string' || calls.has(part.id)) throw new Error('Ambiguous bundle_list tool call in evidence.');
        calls.set(part.id, part.input);
      }
      if (event.type !== 'user' || part.type !== 'tool_result' || !calls.has(part.tool_use_id)) continue;
      const input = calls.get(part.tool_use_id);
      if (input?.workspaceId !== target.workspaceId || input?.miniAppId !== target.miniAppId) continue;
      if (part.is_error || completed.has(part.tool_use_id)) throw new Error('Failed or duplicate bundle_list tool result in evidence.');
      completed.add(part.tool_use_id);
      if (!Array.isArray(part.content)) throw new Error('Unsupported bundle_list result format; keep the original tool trace.');
      for (const block of part.content) {
        if (block.type !== 'text' || typeof block.text !== 'string') continue;
        const payload = JSON.parse(block.text);
        if (!Array.isArray(payload?.contents)) throw new Error('Unsupported bundle_list response; expected contents array.');
        for (const row of payload.contents) {
          if (row?.deploymentId !== target.deploymentId) continue;
          if (row.miniAppId !== target.miniAppId || typeof row.memo !== 'string' || row.memo !== expected) {
            throw new Error('Registered deploymentId/memo does not exactly match; stop before test push or release.');
          }
          matches++;
        }
      }
    }
  }
  if (!matches) throw new Error('No matching original bundle_list tool result for this deployment and app.');
  return { ...target, memo: expected };
}

/** CLI options cannot remove the transport format or the stage's permission boundary. */
export function claudeArgs(extra, stage = 'run') {
  let allowed = stage === 'test-push' ? ['ToolSearch', TEST_PUSH, BUNDLE_LIST] : ['Read', 'Glob', 'Grep', 'ToolSearch'];
  const forwarded = [];
  const seen = new Set();
  for (let i = 0; i < extra.length; i++) {
    const flag = extra[i];
    const value = extra[++i];
    if (seen.has(flag) || typeof value !== 'string' || !value || value.startsWith('-')) throw new Error('Invalid or duplicate Claude extra option.');
    seen.add(flag);
    if (flag === '--mcp-config') { forwarded.push(flag, value); continue; }
    if (flag === '--allowedTools' && stage === 'run') {
      const tools = value.split(',');
      if (!tools.length || tools.some((tool) => !RUN_TOOLS.includes(tool))) throw new Error('Only the exact safe tool allowlist is accepted for run.');
      allowed = tools;
      continue;
    }
    throw new Error('Claude extra options may not override the stage guard.');
  }
  const blocked = stage === 'test-push'
    ? [...BLOCKED_MUTATIONS, `${TOSS}bundle_upload`, `${TOSS}bundle_upload_complete`]
    : [...BLOCKED_MUTATIONS, TEST_PUSH];
  // Ignore user/project/local permission grants; managed policies still apply.
  return ['-p', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--permission-mode', 'dontAsk', '--output-format', 'stream-json', '--verbose',
    '--tools', stage === 'test-push' ? 'ToolSearch' : BUILTINS.join(','), '--allowedTools', allowed.join(','), '--disallowedTools', blocked.join(','), ...forwarded];
}

function options(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--') || Object.hasOwn(values, key)) throw new Error('Unknown or duplicate option.');
    if (key === '--check-only') { values[key] = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}.`);
    values[key] = value;
  }
  return values;
}

function required(o, key) {
  if (typeof o[key] !== 'string' || !o[key]) throw new Error(`Required option: ${key}.`);
  return o[key];
}

function allow(o, keys) {
  if (Object.keys(o).some((key) => !keys.includes(key))) throw new Error('Unsupported option.');
}

function canonical(path) {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

export function main(argv) {
  const [command, ...rest] = argv;
  const o = options(rest);
  if (command === 'verify-memo') {
    allow(o, ['--expected', '--actual', '--deployment-id', '--workspace-id', '--mini-app-id']);
    verifyMemo(required(o, '--expected'), required(o, '--actual'), targetFrom(o));
    console.log('MEMO_MATCH');
    return 0;
  }
  if (command !== 'run' && command !== 'test-push') throw new Error('Use run, verify-memo, or test-push.');
  allow(o, command === 'run' ? ['--prompt', '--memo', '--output', '--args', '--executable', '--check-only']
    : ['--expected', '--actual', '--deployment-id', '--workspace-id', '--mini-app-id', '--output', '--args', '--executable', '--check-only']);
  const output = required(o, '--output');
  let prompt;
  if (command === 'test-push') {
    const verified = verifyMemo(required(o, '--expected'), required(o, '--actual'), targetFrom(o));
    prompt = `The user authorized one test push after exact memo verification. Call only ${TEST_PUSH} with these exact arguments: ${JSON.stringify({ workspaceId: verified.workspaceId, miniAppId: verified.miniAppId, deploymentId: verified.deploymentId })}. Do not omit deploymentId or choose the latest bundle. Then use ${BUNDLE_LIST} for the same workspace and miniApp, search this deploymentId, and report the returned isTested state and test links. Do not upload, change metadata, submit review, release, or call other tools.`;
  } else {
    prompt = readUtf8(required(o, '--prompt'));
    if (!prompt.trim()) throw new Error('Prompt must not be empty.');
    if (o['--memo']) {
      const memo = readMemo(o['--memo']);
      prompt += '\n\nExact external memo (JSON string):\n' + JSON.stringify(memo)
        + '\nUse this exact string value for the external memo. Do not translate or replace it with another memo from the earlier prompt.\n';
    }
  }
  const extra = o['--args'] ? JSON.parse(readUtf8(o['--args'])) : [];
  if (!Array.isArray(extra) || extra.some((arg) => typeof arg !== 'string' || /[\u0000\ufffd]/u.test(arg))) throw new Error('Arguments file must contain a JSON array of strings.');
  const executable = o['--executable'] ?? (process.platform === 'win32' ? 'claude.exe' : 'claude');
  const isClaude = /^(?:claude|claude\.exe)$/iu.test(basename(executable));
  const isOfflineFixture = canonical(executable) === canonical(process.execPath);
  if (!isClaude && !isOfflineFixture) throw new Error('Executable must be Claude or this exact Node executable for offline fixtures; renamed CLIs and command wrappers are not supported.');
  const args = isClaude ? claudeArgs(extra, command) : extra;
  const inputs = [o['--prompt'], o['--memo'], o['--args'], o['--expected'], o['--actual']].filter(Boolean).map(canonical);
  const outputs = [output, `${output}.stderr`].map(canonical);
  if (outputs.some((path) => inputs.includes(path) || existsSync(path))) throw new Error('Output files must be new and distinct from every input file.');
  if (!existsSync(dirname(resolve(output)))) throw new Error('Output directory must already exist.');
  verifyTransport();
  if (o['--check-only']) {
    console.log('UTF8_PREFLIGHT_OK (no external CLI or MCP call)');
    return 0;
  }
  // Reserve logs before any external side effect. Never print model output or signed URLs.
  const outFd = openSync(output, 'wx');
  let errFd;
  try {
    errFd = openSync(`${output}.stderr`, 'wx');
    const result = sendUtf8(executable, args, prompt);
    writeFileSync(outFd, result.stdout ?? Buffer.alloc(0));
    writeFileSync(errFd, result.stderr ?? Buffer.alloc(0));
    if (result.error || result.signal || result.status === null) throw new Error('CLI failed to start or finish; inspect the output files locally.');
    if (result.status !== 0) {
      console.error(`CLI_EXIT_${result.status}; inspect the output files locally.`);
      return result.status;
    }
    decodeUtf8(result.stdout ?? Buffer.alloc(0));
    console.log('CLI_COMPLETED (output saved; verify the registered memo before proceeding)');
    return 0;
  } finally {
    closeSync(outFd);
    if (errFd !== undefined) closeSync(errFd);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    // Errors never include prompt, memo, raw tool responses, or CLI arguments.
    console.error(error instanceof SyntaxError ? 'Invalid JSON input.' : error instanceof Error ? error.message : 'UTF-8 command failed.');
    process.exitCode = 1;
  }
}
