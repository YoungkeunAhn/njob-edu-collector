// 실사이트 드라이런: 소스를 실제로 수집해 runSource 까지 돌리되 DB 대신 메모리에 담는다(쓰기 없음).
// 사용: npm run dry-run -w worker [-- code1 code2 …]   (인자 없으면 키 없이 되는 소스 전부)
// 인증키가 있으면 환경변수로 넘긴다: SEOUL_API_KEY, DATA_GO_KR_KEY, YOUTHCENTER_API_KEY
// digital-baeum 은 Browser Rendering 바인딩이 필요해 여기서는 돌지 않는다(배포 후 wrangler 로 cron 트리거).
import { runSource } from "../src/collect/run";
import type { CourseRow, Repo } from "../src/collect/types";
import type { Env } from "../src/env";
import { LOCAL, SCHEDULE } from "../src/sources";

const KEYLESS = ["work24", "seoul-lifelong", "sesac", "dev-event", "linkareer", "jobaba", "greenlove", "theteams"];

class MemRepo implements Repo {
  rows: CourseRow[] = [];
  async prevOkFetched() { return null; }
  async upsertCourses(rows: CourseRow[]) { this.rows.push(...rows); return rows.length; }
  async pruneUnseen() { return 0; }
  async deleteExpired() { return 0; }
  async recordRun() {}
}

const env = {
  SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
  SEOUL_API_KEY: process.env.SEOUL_API_KEY, DATA_GO_KR_KEY: process.env.DATA_GO_KR_KEY, YOUTHCENTER_API_KEY: process.env.YOUTHCENTER_API_KEY,
} as unknown as Env;

const want = process.argv.slice(2).length ? process.argv.slice(2) : KEYLESS;
const all = [...Object.values(SCHEDULE).flat(), ...LOCAL];
let failed = 0;
for (const code of want) {
  const source = all.find((s) => s.code === code);
  if (!source) { console.log(`${code}: 모르는 소스`); failed++; continue; }
  const repo = new MemRepo();
  const t0 = Date.now();
  const r = await runSource(source, { repo, fetch, env, now: () => new Date(), notify: async () => {} });
  const shown = repo.rows.filter((x) => x.category_main);
  console.log(`${code}: ${r.ok ? "OK" : "실패"} 받음 ${r.fetched} · 저장 ${r.upserted} · 분류됨(노출) ${shown.length} · 정규화 실패 ${r.badRows} · ${((Date.now() - t0) / 1000).toFixed(1)}s${r.error ? ` · ${r.error}` : ""}`);
  for (const x of shown.slice(0, 2)) console.log(`   예) [${x.category_sub}] ${x.title} | ${x.apply_end ?? x.course_start ?? "-"} | ${x.sido_code ?? "온라인/미상"} | ${x.url}`);
  if (!r.ok || r.fetched === 0) failed++;
}
process.exitCode = failed ? 1 : 0;
