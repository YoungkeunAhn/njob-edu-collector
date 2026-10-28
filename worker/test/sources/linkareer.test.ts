import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { linkareer, listUrl, normalize, parse } from "../../src/sources/linkareer";

const data = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/linkareer.json"), "utf8"));
const page = (d: unknown) => `<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(d)}</script></body></html>`;
const html = page(data);
const state = () => structuredClone(data.props.pageProps.__APOLLO_STATE__) as Record<string, Record<string, unknown>>;

describe("linkareer (교육 목록 1페이지 __NEXT_DATA__ 실응답 2026-10-12 발췌)", () => {
  test("20건 파싱(광고 배너 8건은 제외), 총건수 764, 모두 모집중", () => {
    const { total, recs } = parse(html);
    expect([total, recs.length]).toEqual([764, 20]);
    expect(recs.map((r) => r.id)).not.toContain("347881"); // 광고 배너 공고
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(20);
  });

  test("첫 행 필드 매핑: 무료·오프라인·지역 제한없음, KST 날짜", () => {
    expect(normalize(parse(html).recs[0]!)).toMatchObject({
      source_id: "355987",
      title: "생성형 AI기반 업무자동화 실무 서비스 구현(~11/5)",
      provider_name: "부산인재개발원(부산IT교육센터)",
      mode: "offline",
      address: null,
      cost_type: "free", cost_amount: 0,
      apply_end: "2026-11-05", course_start: "2026-10-31", course_end: "2027-02-05",
      url: "https://linkareer.com/activity/355987",
    });
  });

  test("유료 금액, 구 단위·시도 전체 지역, 온라인은 주소 없음", () => {
    const recs = parse(html).recs;
    const by = (id: string) => normalize(recs.find((r) => r.id === id)!)!;
    expect(by("355701")).toMatchObject({ cost_type: "paid", cost_amount: 140000, apply_end: "2026-10-19" });
    expect(by("355941")).toMatchObject({ address: "경기 성남시" });
    expect(by("355743")).toMatchObject({ address: "부산" });
    expect(by("355697")).toMatchObject({ address: "서울", apply_end: "2027-01-06" }); // ASAP(모집 시 마감)
    expect(by("355816")).toMatchObject({ mode: "online", address: null });
  });

  test("source_id 안정, URL 절대 경로", () => {
    expect(parse(html).recs.map((r) => r.id)).toEqual(parse(html).recs.map((r) => r.id));
    for (const d of parse(html).recs.map(normalize)) expect(d!.url).toMatch(/^https:\/\/linkareer\.com\/activity\/\d+$/);
  });

  test("모집예정은 버리고, 모르는 모집유형·온오프라인·날짜는 throw", () => {
    const r = parse(html).recs[0]!;
    expect(normalize({ ...r, recruitType: "SCHEDULED" })).toBeNull();
    expect(normalize({ ...r, recruitType: "ALWAYS", recruitCloseAt: null })).toMatchObject({ apply_end: null });
    expect(() => normalize({ ...r, recruitType: "CLOSED" })).toThrow("모르는 모집유형");
    expect(() => normalize({ ...r, recruitCloseAt: null })).toThrow("마감일 없음");
    expect(() => normalize({ ...r, recruitCloseAt: "2026-11-05" })).toThrow("날짜 형식");
    expect(() => normalize({ ...r, onoffline: "현장" })).toThrow("모르는 온오프라인");
  });

  test("구조 없는 페이지·마감 전 필터가 빠진 질의는 throw", () => {
    expect(() => parse("<html>점검</html>")).toThrow("__NEXT_DATA__ 없음");
    const st = state();
    const root = st.ROOT_QUERY!;
    const key = Object.keys(root).find((k) => k.startsWith("activities("))!;
    root[key.replace('"status":"OPEN"', '"status":null')] = root[key];
    delete root[key];
    expect(() => parse(page({ props: { pageProps: { __APOLLO_STATE__: st } } }))).toThrow("필터 변경");
  });

  test("fetchList: page 를 올리며 총건수만큼 받는다", async () => {
    vi.useFakeTimers();
    try {
      const st = state();
      const root = st.ROOT_QUERY!;
      const key = Object.keys(root).find((k) => k.startsWith("activities("))!;
      (root[key] as { totalCount: number }).totalCount = 20;
      const f = vi.fn(async () => new Response(page({ props: { pageProps: { __APOLLO_STATE__: st } } })));
      const p = linkareer.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(20);
      expect(f.mock.calls.map((c) => String((c as unknown[])[0]))).toEqual([listUrl(1)]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("linkareer 참조", () => {
  test("온·오프라인 참조가 있는데 대상이 없으면 throw", () => {
    const d = structuredClone(data);
    delete d.props.pageProps.__APOLLO_STATE__["Onoffline:2"];
    expect(() => parse(page(d))).toThrow("참조 해석 실패");
  });
});
