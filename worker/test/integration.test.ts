// N9 통합: SCHEDULE · wrangler.toml crons · source 시드(그룹) · plan 표가 한 몸으로 움직이는가
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { POSTPROCESS_CRON } from "../src/collect/run";
import { PUSH_CRON } from "../src/me/push";
import { LOCAL, SCHEDULE } from "../src/sources";

const root = join(import.meta.dirname, "../..");
const GROUP: Record<string, string> = { "0 18 * * *": "A", "10 18 * * *": "A", "20 18 * * *": "B", "40 18 * * *": "C", "30 19 * * SUN": "D" };

test("T9-1 SCHEDULE 12개 + LOCAL 3개, 중복 없음, 시드(끈 소모임 제외)의 code·그룹과 같다", () => {
  const codes = [...Object.values(SCHEDULE).flat(), ...LOCAL].map((s) => s.code);
  expect(codes).toHaveLength(15);
  expect(new Set(codes).size).toBe(15);
  const seed = readFileSync(join(root, "supabase/migrations/20261011000002_seed_source.sql"), "utf8");
  const seeded = Object.fromEntries([...seed.matchAll(/\('([a-z0-9-]+)',\s*'[^']*',\s*'[a-z]+',\s*'([A-D])'/g)].map((m) => [m[1], m[2]]));
  delete seeded.somoim; // 20261014000001_disable_somoim.sql 로 끔
  expect(Object.keys(seeded).sort()).toEqual([...codes].sort());
  for (const [cron, sources] of Object.entries(SCHEDULE)) for (const s of sources) expect([s.code, seeded[s.code]]).toEqual([s.code, GROUP[cron]]);
});

test("T9-2 wrangler.toml crons = SCHEDULE 키 + 후처리·마감 알림 cron", () => {
  const toml = readFileSync(join(root, "worker/wrangler.toml"), "utf8");
  const crons = [...(/^crons\s*=\s*\[([^\]]*)\]/m.exec(toml)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  expect(crons.sort()).toEqual([...Object.keys(SCHEDULE), POSTPROCESS_CRON, PUSH_CRON].sort());
});

test("T9-2b plan 의 Cron 표와도 같다", () => {
  const plan = readFileSync(join(root, "docs/06-스펙/plan.md"), "utf8");
  const table = [...plan.matchAll(/^\| `([^`]+)` \| (?:매일|매주)/gm)].map((m) => m[1]);
  expect(table.sort()).toEqual([...Object.keys(SCHEDULE), POSTPROCESS_CRON, PUSH_CRON].sort());
});
