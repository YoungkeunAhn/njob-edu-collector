import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { API_URL, jobaba, normalize, parse } from "../../src/sources/jobaba";

const body = readFileSync(join(import.meta.dirname, "fixtures/jobaba.json"), "utf8");
const data = JSON.parse(body);

describe("jobaba (getBsnsList.do 교육훈련 실응답 2026-10-12, 7건 전부)", () => {
  test("7건 파싱, 총건수 7, 모두 진행(03)이라 7건 통과", () => {
    const { total, recs } = parse(body);
    expect([total, recs.length]).toEqual([7, 7]);
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(7);
  });

  test("첫 행 필드 매핑(엔티티 풀기)", () => {
    expect(normalize(parse(body).recs[0]!)).toEqual({
      source_id: "5924",
      title: "[화성시][2026년 취업시즌대비특강 ⑰] 해커스 권준영 강사님과 함께하는 면접필승합격전략 (이직편)",
      desc: "취업시즌대비특강, 취업 특강, 청년, 청년 취업, 취업, 청년 특강",
      provider_name: "화성시청년취업끝까지 지원센터",
      address: "경기도 화성시",
      apply_start: "2026-09-18", apply_end: "2026-10-14",
      url: "https://apply.jobaba.net/bsns/bsnsDetailView.do?bsnsSeq=5924",
    });
  });

  test("source_id 안정, URL 절대 경로", () => {
    const ids = () => parse(body).recs.map(normalize).map((d) => d!.source_id);
    expect(ids()).toEqual(ids());
    expect(new Set(ids()).size).toBe(7);
    for (const d of parse(body).recs.map(normalize)) expect(d!.url).toMatch(/^https:\/\/apply\.jobaba\.net\/bsns\/bsnsDetailView\.do\?bsnsSeq=\d+$/);
  });

  test("진행예정·종료는 버리고, 모르는 상태·마감일 없음·날짜 형식은 throw", () => {
    const r = parse(body).recs[0]!;
    expect(normalize({ ...r, statusCd: "02" })).toBeNull();
    expect(normalize({ ...r, statusCd: "04" })).toBeNull();
    expect(() => normalize({ ...r, statusCd: "05" })).toThrow("모르는 상태");
    expect(() => normalize({ ...r, statusCd: "" })).toThrow("공고 형식");
    expect(() => normalize({ ...r, bsnsEndDate: "" })).toThrow("접수마감일 없음");
    expect(() => normalize({ ...r, bsnsEndDate: "상시" })).toThrow("날짜 형식");
  });

  test("오류 응답·목록 없는 응답은 throw", () => {
    expect(() => parse('{"responseCode":"-1","responseText":"ERROR"}')).toThrow("jobaba 응답 -1 ERROR");
    expect(() => parse("<html>오류</html>")).toThrow();
  });

  test("fetchList: 폼 인코딩 _REQ_JSON_OBJECT_ 로 POST, pageNo 를 올리며 총건수만큼 받는다", async () => {
    vi.useFakeTimers();
    try {
      const page = (list: unknown[]) => new Response(JSON.stringify({ ...data, data: { paging: { totalCount: 7 }, list } }));
      const f = vi.fn().mockResolvedValueOnce(page(data.data.list.slice(0, 4))).mockResolvedValueOnce(page(data.data.list.slice(4)));
      const p = jobaba.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(7);
      expect(f).toHaveBeenCalledTimes(2);
      const [url, init] = f.mock.calls[1] as [string, RequestInit];
      expect(url).toBe(API_URL);
      expect(init.method).toBe("POST");
      const q = JSON.parse((init.body as URLSearchParams).get("_REQ_JSON_OBJECT_")!);
      expect(q).toMatchObject({ statusCd: "", pageNo: "2", listBlock: "36", schBsnsType: ["05"], schLocation: ["4100000000"] });
    } finally {
      vi.useRealTimers();
    }
  });
});
