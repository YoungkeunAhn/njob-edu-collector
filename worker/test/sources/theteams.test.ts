import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { listUrl, normalize, parse, theteams } from "../../src/sources/theteams";

const html = readFileSync(join(import.meta.dirname, "fixtures/theteams.html"), "utf8");
const LAST = html.replace(/<ul class="pagination">[\s\S]*?<\/ul>/, '<ul class="pagination">&nbsp;<li><a href="/activities/edu/2">이전</a></li>&nbsp;<li class="active"><a href="#">3</a></li></ul>');

describe("theteams (교육 탭 1페이지 실응답 2026-10-12)", () => {
  test("카드 20건 파싱, 모두 마감 전, 다음 페이지 있음", () => {
    const { hasNext, recs } = parse(html);
    expect([hasNext, recs.length]).toEqual([true, 20]);
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(20);
  });

  test("첫 카드 필드 매핑", () => {
    expect(normalize(parse(html).recs[0]!)).toEqual({
      source_id: "oe652",
      title: "[고용노동부 X MBN] 디지털헤리티지 큐레이터 양성 과정 4기_충남 공주",
      provider_name: "매일방송, 국립공주대학교 산학협력단, 하이서울기업협회",
      apply_end: "2026-10-12",
      url: "https://www.theteams.kr/activities/page/652/oe",
    });
  });

  test("이스케이프 안 된 꺾쇠 제목을 살리고, 제목의 무료를 가격으로", () => {
    const recs = parse(html).recs;
    expect(normalize(recs.find((r) => r.id === "354312")!)).toMatchObject({ title: "서울청년센터 서초 <AI로 칼퇴하는 법>", apply_end: "2026-10-13" });
    expect(normalize(recs.find((r) => r.id === "353482")!)).toMatchObject({ cost_type: "free", cost_amount: 0, provider_name: "과학기술정보통신부 X 한국지능정보사회진흥원" });
  });

  test("source_id 는 코드+번호로 안정·고유(같은 제목 다른 출처도 구분), URL 절대 경로", () => {
    const ids = parse(html).recs.map((r) => normalize(r)!.source_id);
    expect(ids).toEqual(parse(html).recs.map((r) => normalize(r)!.source_id));
    expect(new Set(ids).size).toBe(20);
    expect(ids).toContain("le353186"); // 첫 카드와 같은 제목
    for (const r of parse(html).recs) expect(normalize(r)!.url).toMatch(/^https:\/\/www\.theteams\.kr\/activities\/page\/\d+\/(le|oe)$/);
  });

  test("교육 밖 종류·모르는 배지·못 읽는 마감일은 throw", () => {
    const r = parse(html).recs[0]!;
    expect(() => normalize({ ...r, code: "lc" })).toThrow("모르는 종류");
    expect(() => normalize({ ...r, badge: "category_gray" })).toThrow("모르는 상태");
    expect(() => normalize({ ...r, deadline: "" })).toThrow("마감일 없음");
    expect(() => normalize({ ...r, deadline: "곧" })).toThrow("날짜 형식");
  });

  test("구조 없는 페이지는 throw, 마지막 페이지는 다음 없음", () => {
    expect(() => parse("<html>점검</html>")).toThrow("목록 영역 없음");
    expect(parse(LAST).hasNext).toBe(false);
  });

  test("fetchList: 다음 링크가 없는 페이지까지 받고, 중간 빈 페이지·전체 0건은 throw", async () => {
    vi.useFakeTimers();
    try {
      const pages = [html, html.replace(/\/activities\/page\/(\d+)\//g, "/activities/page/9$1/"), LAST.replace(/\/activities\/page\/(\d+)\//g, "/activities/page/8$1/")];
      const f = vi.fn(async (u: string) => new Response(pages[[listUrl(1), listUrl(2), listUrl(3)].indexOf(u)]));
      const p = theteams.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(60);
      expect(f.mock.calls.map((c) => c[0])).toEqual(["https://www.theteams.kr/activities/edu", "https://www.theteams.kr/activities/edu/2", "https://www.theteams.kr/activities/edu/3"]);

      const empty = html.replace(/<div class="thumbnail card_recruit"/g, "<div");
      const mid = theteams.fetchList({ fetch: (async () => new Response(empty)) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      mid.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(mid).rejects.toThrow("부분 응답");

      const none = theteams.fetchList({ fetch: (async () => new Response(LAST.replace(/<div class="thumbnail card_recruit"/g, "<div"))) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      none.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(none).rejects.toThrow("빈 목록");

      // 마지막 페이지가 앞 페이지의 반복이면 성공이 아니라 실패
      const rep = [html, LAST];
      const again = theteams.fetchList({ fetch: (async (u: string) => new Response(rep[[listUrl(1), listUrl(2)].indexOf(u)]!.replace(/\/activities\/page\/8?(\d+)\//g, "/activities/page/$1/"))) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      again.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(again).rejects.toThrow("반복 페이지");
    } finally {
      vi.useRealTimers();
    }
  });
});
