import { describe, expect, test, vi } from "vitest";
import { finalize, formatAlert, onCron, POSTPROCESS_CRON, postprocess, runGroup, runSource } from "../../src/collect/run";
import type { CourseDraft, CourseRow, Deps, Repo, RunRecord, Source } from "../../src/collect/types";
import { telegram } from "../../src/collect/notify";

const NOW = new Date("2026-10-11T18:00:00Z"); // KST 2026-10-12 03:00
const TODAY = "2026-10-12";
const ENV = { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RATE_LIMITER: { limit: async () => ({ success: true }) } };

class FakeRepo implements Repo {
  rows = new Map<string, CourseRow & { last_seen_at: string }>();
  runs: RunRecord[] = [];
  pruned: string[] = [];
  expiredCalls: string[] = [];
  prev: number | null = null;
  async prevOkFetched() { return this.prev; }
  async upsertCourses(rows: CourseRow[], seenAt: string) {
    for (const r of rows) this.rows.set(`${r.source}/${r.source_id}`, { ...r, last_seen_at: seenAt });
    return rows.length;
  }
  async pruneUnseen(source: string, seenAt: string) {
    this.pruned.push(source);
    let n = 0;
    for (const [k, r] of this.rows) if (r.source === source && r.last_seen_at < seenAt) { this.rows.delete(k); n++; }
    return n;
  }
  async deleteExpired(today: string) { this.expiredCalls.push(today); return 0; }
  async recordRun(run: RunRecord) { this.runs.push(run); }
}

function deps(repo = new FakeRepo()): Deps & { repo: FakeRepo; sent: string[] } {
  const sent: string[] = [];
  return {
    repo, sent,
    fetch: vi.fn() as unknown as typeof fetch,
    env: ENV,
    now: () => NOW,
    notify: async (t) => { sent.push(t); },
  };
}

const draft = (id: string, over: Partial<CourseDraft> = {}): CourseDraft => ({
  source_id: id, title: "AI 영상 만들기 원데이", url: `https://ex.com/${id}`,
  address: "경기도 수원시 팔달구", course_start: "2026-11-01", course_end: "2026-11-01", ...over,
});
const src = (code: string, drafts: (CourseDraft | Error)[]): Source<CourseDraft | Error> => ({
  code,
  fetchList: async () => drafts,
  normalize: (r) => { if (r instanceof Error) throw r; return r; },
});
const failing = (code: string): Source => ({ code, fetchList: async () => { throw new Error("503"); }, normalize: () => null });

describe("N4 수집 런타임", () => {
  test("T4-1 소스 하나가 throw 해도 다음 소스가 돈다", async () => {
    const d = deps();
    const res = await runGroup([src("a", [draft("1")]), failing("b"), src("c", [draft("2")])], d);
    expect(res.map((r) => [r.source, r.ok])).toEqual([["a", true], ["b", false], ["c", true]]);
    expect(d.repo.rows.size).toBe(2);
  });

  test("T4-2 실패 소스는 ok=false·error 기록, prune 안 함", async () => {
    const d = deps();
    await runSource(failing("b"), d);
    expect(d.repo.runs).toEqual([expect.objectContaining({ source: "b", ok: false, error: "503", fetched: 0 })]);
    expect(d.repo.pruned).toEqual([]);
  });

  test("T4-3 성공이지만 직전 대비 50% 미만이면 prune 건너뛰고 알림", async () => {
    const d = deps();
    d.repo.prev = 100;
    const res = await runGroup([src("a", [draft("1")])], d);
    expect(res[0]).toMatchObject({ pruneSkipped: true, dropped: true, ok: false });
    expect(d.repo.pruned).toEqual([]);
    // 급감 실행은 ok=false 로 남겨 다음 실행의 비교 기준(직전 성공 건수)을 낮추지 않는다
    expect(d.repo.runs[0]).toMatchObject({ ok: false, fetched: 1 });
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0]).toContain("a 건수 급감");
  });

  test("T4-3b normalize 가 전부 null 이어도 급감으로 잡아 정리하지 않는다", async () => {
    const d = deps();
    await d.repo.upsertCourses([finalize("a", draft("old"))], "2026-10-10T18:00:00.000Z");
    d.repo.prev = 100;
    const nulls: Source = { code: "a", fetchList: async () => Array(100).fill(0), normalize: () => null };
    const res = await runSource(nulls, d);
    expect(res).toMatchObject({ ok: false, dropped: true, fetched: 0 });
    expect(d.repo.rows.has("a/old")).toBe(true);
  });

  test("성공 + 건수 정상이면 이번에 안 보인 행만 지운다", async () => {
    const d = deps();
    await d.repo.upsertCourses([finalize("a", draft("old"))], "2026-10-10T18:00:00.000Z");
    d.repo.prev = 1;
    await runSource(src("a", [draft("1")]), d);
    expect([...d.repo.rows.keys()]).toEqual(["a/1"]);
  });

  test("prune=false 소스는 성공해도 정리하지 않는다", async () => {
    const d = deps();
    await d.repo.upsertCourses([finalize("a", draft("old"))], "2026-10-10T18:00:00.000Z");
    await runSource({ ...src("a", [draft("1")]), prune: false }, d);
    expect(d.repo.pruned).toEqual([]);
    expect(d.repo.rows.has("a/old")).toBe(true);
  });

  test("T4-4 normalize 예외 행만 버리고 나머지는 저장, 그 실행은 정리하지 않는다", async () => {
    const d = deps();
    await d.repo.upsertCourses([finalize("a", draft("2"))], "2026-10-10T18:00:00.000Z"); // 이번에 정규화 실패할 기존 행
    const res = await runSource(src("a", [draft("1"), new Error("bad"), draft("3")]), d);
    expect(res).toMatchObject({ ok: true, fetched: 3, upserted: 2, badRows: 1, pruneSkipped: true });
    expect(d.repo.rows.has("a/2")).toBe(true);
    expect(d.repo.pruned).toEqual([]);
  });

  test("T4-5 저장 행에 분류·유형·지역이 채워진다", async () => {
    const d = deps();
    await runSource(src("a", [draft("1")]), d);
    expect(d.repo.rows.get("a/1")).toMatchObject({
      category_main: "video", category_sub: "video_gen", course_type: "oneday",
      sido_code: "41", sigungu_code: "41110", title_norm: "ai영상만들기원데이",
    });
  });

  test("온라인 강좌는 지역 코드를 비운다", () => {
    expect(finalize("a", draft("1", { mode: "online" }))).toMatchObject({ sido_code: null, sigungu_code: null });
  });

  test("T4-6 접수 마감일이 KST 오늘보다 앞이면 저장하지 않는다", async () => {
    const d = deps();
    await runSource(src("a", [draft("1", { apply_end: "2026-10-11" }), draft("2", { apply_end: TODAY })]), d);
    expect([...d.repo.rows.keys()]).toEqual(["a/2"]);
  });

  test("T4-7 postprocess 는 KST 오늘로 deleteExpired 를 부른다", async () => {
    const d = deps();
    await postprocess(d);
    expect(d.repo.expiredCalls).toEqual([TODAY]);
  });

  test("T4-8 문제가 있을 때만 알림 1회", async () => {
    const ok = deps();
    await runGroup([src("a", [draft("1")])], ok);
    expect(ok.sent).toHaveLength(0);
    const bad = deps();
    await runGroup([failing("x"), failing("y")], bad);
    expect(bad.sent).toHaveLength(1);
    expect(formatAlert([])).toBeNull();
  });

  test("T4-8b 텔레그램 sendMessage 호출 형태, 토큰 없으면 호출 안 함", async () => {
    const f = vi.fn(async () => new Response("{}"));
    await telegram({ ...ENV, TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "42" }, f as unknown as typeof fetch)("hi");
    expect(f).toHaveBeenCalledWith("https://api.telegram.org/botT/sendMessage", expect.objectContaining({ method: "POST", body: JSON.stringify({ chat_id: "42", text: "hi" }) }));
    const g = vi.fn();
    await telegram(ENV, g as unknown as typeof fetch)("hi");
    expect(g).not.toHaveBeenCalled();
  });

  test("T4-9 cron 으로 그룹 선택, 후처리 cron, 모르는 cron 은 알림", async () => {
    const d = deps();
    const a = src("a", [draft("1")]);
    const b = src("b", [draft("2")]);
    await onCron("0 18 * * *", { "0 18 * * *": [a], "20 18 * * *": [b] }, d);
    expect([...d.repo.rows.keys()]).toEqual(["a/1"]);
    await onCron(POSTPROCESS_CRON, {}, d);
    expect(d.repo.expiredCalls).toHaveLength(1);
    await onCron("1 2 * * *", { "0 18 * * *": [a] }, d);
    expect(d.sent.at(-1)).toContain("등록되지 않은 cron");
  });

  test("recordRun 이 실패해도 결과는 반환된다", async () => {
    const d = deps();
    d.repo.recordRun = async () => { throw new Error("db down"); };
    const r = await runSource(src("a", [draft("1")]), d);
    expect(r.ok).toBe(true);
  });

  test("같은 source_id 가 두 번 오면 마지막 것 하나만 upsert 한다", async () => {
    const d = deps();
    const r = await runSource(src("a", [draft("1"), draft("1", { title: "AI 영상 만들기 2회차" })]), d);
    expect([r.fetched, r.upserted]).toEqual([2, 1]);
    expect(d.repo.rows.get("a/1")!.title).toBe("AI 영상 만들기 2회차");
  });
});
