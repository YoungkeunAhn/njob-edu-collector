import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { listUrl, normalize, parse, sesac } from "../../src/sources/sesac";
import { runSource } from "../../src/collect/run";

const html = readFileSync(join(import.meta.dirname, "fixtures/sesac.html"), "utf8");

describe("sesac (오프라인 과정 목록 실응답 2026-10-12, 필터 없음 1페이지)", () => {
  test("픽스처 12건 파싱, 총건수 197, 모집중 4건", () => {
    const { total, recs } = parse(html);
    expect([total, recs.length]).toEqual([197, 12]);
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(4);
  });

  test("첫 모집중 행의 필드 매핑 (목록에 가격이 없어 비용은 비운다)", () => {
    const d = normalize(parse(html).recs[0]!)!;
    expect(d).toMatchObject({
      source_id: "1181",
      title: "AI Harness Engineering 기반 헬스케어 데이터분석 실무과정",
      mode: "offline",
      address: "서울 영등포구",
      apply_start: "2026-10-12", apply_end: "2026-11-08",
      url: "https://sesac.seoul.kr/sesac/course/offline/courseDetail.do?crsSn=1181",
    });
    expect(d.cost_type).toBeUndefined();
  });

  test("source_id 안정, URL 절대 경로", () => {
    const ids = () => parse(html).recs.map((r) => r.crsSn);
    expect(ids()).toEqual(ids());
    for (const d of parse(html).recs.map(normalize).filter(Boolean)) expect(d!.url).toMatch(/^https:\/\/sesac\.seoul\.kr\//);
  });

  test("모집중이 아닌 행은 버리고, 모르는 상태·빈 상태는 throw", () => {
    const recs = parse(html).recs;
    const pre = recs.find((r) => r.status === "모집예정")!;
    expect(normalize(pre)).toBeNull();
    expect(normalize(recs.find((r) => r.status === "운영중")!)).toBeNull();
    expect(() => normalize({ ...recs[0]!, status: "모집 중" })).toThrow("모르는 상태");
    expect(() => normalize({ ...recs[0]!, status: "" })).toThrow("카드 형식");
  });

  test("구조 없는 페이지는 throw", () => {
    expect(() => parse("<html>점검</html>")).toThrow("목록 영역 없음");
  });

  test("fetchList: 모집중 필터 URL, 총건수까지 받는다", async () => {
    vi.useFakeTimers();
    try {
      const one = html.replace("<strong>197</strong>", "<strong>12</strong>");
      const f = vi.fn(async () => new Response(one));
      const p = sesac.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(12);
      expect(String((f.mock.calls[0] as unknown[])[0])).toBe(listUrl(1));
      expect(listUrl(2)).toContain("searchRcrtStts=RECRUITING&cPage=2");
    } finally {
      vi.useRealTimers();
    }
  });

  test("530/1016 뒤 같은 페이지를 재시도해 정상 수집한다", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("error code: 1016", { status: 530 }))
        .mockResolvedValueOnce(new Response(html.replace("<strong>197</strong>", "<strong>12</strong>")));
      const result = sesac.fetchList({ fetch: f, env: {} as never, today: "2026-10-26" });
      await vi.advanceTimersByTimeAsync(2000);
      expect(await result).toHaveLength(12);
      expect(f.mock.calls.map(([url]) => url)).toEqual([listUrl(1), listUrl(1)]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("다음 페이지에서 재시도를 소진하면 부분 저장·기존 행 삭제 없이 실패 기록", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(html.replace("<strong>197</strong>", "<strong>13</strong>")))
        .mockImplementation(async () => new Response("error code: 1016", { status: 530, headers: { server: "cloudflare" } }));
      const repo = {
        prevOkFetched: vi.fn(async () => 13), upsertCourses: vi.fn(async () => 0),
        pruneUnseen: vi.fn(async () => 0), deleteExpired: vi.fn(async () => 0), recordRun: vi.fn(async () => {}),
      };
      const result = runSource(sesac, { fetch: f, repo, env: {} as never, now: () => new Date("2026-10-26T00:00:00Z"), notify: async () => {} });
      await vi.advanceTimersByTimeAsync(8000);
      expect(await result).toMatchObject({ ok: false, fetched: 0, error: "HTTP 530 sesac.seoul.kr [server=cloudflare] error code: 1016" });
      expect(f.mock.calls.map(([url]) => url)).toEqual([listUrl(1), listUrl(2), listUrl(2), listUrl(2)]);
      expect(repo.upsertCourses).not.toHaveBeenCalled();
      expect(repo.pruneUnseen).not.toHaveBeenCalled();
      expect(repo.recordRun).toHaveBeenCalledWith(expect.objectContaining({ source: "sesac", ok: false }));
    } finally {
      vi.useRealTimers();
    }
  });
});
