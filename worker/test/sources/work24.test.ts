import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { KEYWORDS, normalize, parse, searchUrl, work24 } from "../../src/sources/work24";

const html = readFileSync(join(import.meta.dirname, "fixtures/work24.html"), "utf8");

describe("T6 work24 (공개 검색 실응답 2026-10-12, keyword=생성형)", () => {
  test("픽스처 10건 파싱, 총건수 1,025, 모집중 9건", () => {
    const { total, recs } = parse(html);
    expect([total, recs.length]).toEqual([1025, 10]);
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(9);
  });

  test("모집중 첫 행의 필드 매핑", () => {
    const d = normalize(parse(html).recs[1]!)!;
    expect(d).toEqual({
      source_id: "AIG20263001328938-2",
      title: "[AI Worker]생성형AI활용 영상콘텐츠 제작 전문가(양성)",
      provider_name: expect.any(String),
      address: "전북 전주시 덕진구",
      cost_type: "card", cost_amount: 300000,
      apply_end: "2026-10-12", course_start: "2026-10-12", course_end: "2027-01-21",
      url: "https://www.work24.go.kr/hr/a/a/3100/selectTracseDetl.do?tracseId=AIG20263001328938&tracseTme=2&crseTracseSe=C0061&trainstCstmrId=500020013990",
    });
    expect(d.provider_name!.length).toBeGreaterThan(1);
  });

  test("모집마감 행은 버린다, source_id 는 과정ID-회차로 안정적", () => {
    const recs = parse(html).recs;
    expect(recs[0]!.status).toBe("모집마감");
    expect(normalize(recs[0]!)).toBeNull();
    expect(() => normalize({ ...recs[1]!, status: "모집 중" })).toThrow("모르는 상태");
    expect(parse(html).recs.map((r) => r.id + r.tme)).toEqual(recs.map((r) => r.id + r.tme));
  });

  test("검색 URL: 오늘~90일, 100건씩", () => {
    const u = new URL(searchUrl("AI", "2026-10-12", 3));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ keyword: "AI", startDate: "20261012", endDate: "20270110", pageIndex: "3", pageRow: "100" });
  });

  test("fetchList: 총건수까지 넘기고 검색어 간 중복은 합친다, 페이지 실패는 throw", async () => {
    vi.useFakeTimers();
    try {
      const one = html.replace(">1,025<", ">10<"); // 총건수 = 픽스처 건수 → 검색어마다 1페이지
      const f = vi.fn(async () => new Response(one));
      const p = work24.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(10);
      expect(f).toHaveBeenCalledTimes(KEYWORDS.length);
      const bad = work24.fetchList({ fetch: (async () => new Response("", { status: 503 })) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await expect(bad).rejects.toThrow("503");
      // 총건수 영역이 없는 200 응답(점검 페이지)은 0건 성공이 아니라 실패
      const maint = work24.fetchList({ fetch: (async () => new Response("<html>점검 중</html>")) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await expect(maint).rejects.toThrow("총건수 없음");
      // 총건수보다 덜 받았는데 빈 페이지가 오면 실패
      let call = 0;
      const partial = work24.fetchList({ fetch: (async () => new Response(call++ === 0 ? html : '<p id="totalCount">총 <span>1,025</span>건</p>')) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      partial.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(partial).rejects.toThrow("부분 응답");
      // 페이지 상한까지 다 못 받으면 실패로 끝낸다 (일부만 받고 성공 처리하면 나머지가 정리돼 지워진다)
      const card = html.slice(html.indexOf('<div class="list" data-tracseid='), html.indexOf('<div class="list" data-tracseid=', html.indexOf('<div class="list" data-tracseid=') + 10));
      let n = 0;
      const big = async () => new Response(`<p id="totalCount">총 <span>999,999</span>건</p>${Array.from({ length: 100 }, () => card.replace(/AIG20263001383701/g, `X${n++}`)).join("")}`);
      const many = work24.fetchList({ fetch: big as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      many.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(many).rejects.toThrow("페이지 초과");
    } finally {
      vi.useRealTimers();
    }
  }, 30_000); // 100건×40페이지 cheerio 파싱이라 혼자 2초대, 전체 병렬 실행에선 기본 5초를 넘긴다
});
