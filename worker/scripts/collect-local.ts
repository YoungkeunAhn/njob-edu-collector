// Worker 에서 막힌 소스(LOCAL)를 이 PC 에서 수집해 운영 DB 에 쓴다(이슈 #2). Worker Cron 과 같은 runGroup — 실행 기록·급감 판단·텔레그램 알림까지 같다.
// 사용: npm run collect-local -w worker   (.dev.vars 의 SUPABASE_*·TELEGRAM_* 를 쓴다)
// 매일 Windows 작업 스케줄러 "njob-collect-local" 이 돌린다 — 등록 명령은 docs/07-운영/배포-런북.md
import { telegram } from "../src/collect/notify";
import { runGroup } from "../src/collect/run";
import { SupabaseRepo } from "../src/collect/supabase-repo";
import type { Env } from "../src/env";
import { LOCAL } from "../src/sources";

const env = process.env as unknown as Env;
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error(".dev.vars 에 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 없다");
const results = await runGroup(LOCAL, { repo: new SupabaseRepo(env), fetch, env, now: () => new Date(), notify: telegram(env, fetch) });
for (const r of results) console.log(`${new Date().toISOString()} ${r.source}: ${r.ok ? "OK" : "실패"} 받음 ${r.fetched} · 저장 ${r.upserted} · 정규화 실패 ${r.badRows}${r.error ? ` · ${r.error}` : ""}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
