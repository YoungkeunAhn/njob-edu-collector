import { describe, expect, test } from "vitest";
import type { CourseItem, CoursesResponse, MetaResponse } from "../../../shared/api-types";
import { cacheKey, corsHeaders, handle, MAX_CURSOR, PAGE, parseQuery, regionOr, inRegion, type ApiDeps, type Query, type ReadRepo } from "../../src/api/handle";
import { COURSE_COLUMNS } from "../../src/api/supabase-read";

const APP = "https://njob.apps.tossmini.com";
const PRIV = "https://njob.private-apps.tossmini.com";

const item = (id: number): CourseItem => ({
  id, source: "a", attribution: "출처", title: `강좌${id}`, course_type: "oneday", provider_name: null,
  category_main: "video", category_sub: "video_gen", mode: "offline", sido_code: "41", sigungu_code: "41110",
  address: null, cost_type: "free", cost_amount: null, apply_start: null, apply_end: null,
  course_start: null, course_end: null, target: null, url: `https://ex.com/${id}`, image_url: null, capacity: null,
});

class FakeRepo implements ReadRepo {
  calls: [Query, number, number][] = [];
  constructor(public rows: CourseItem[] = []) {}
  async list(q: Query, offset: number, limit: number) { this.calls.push([q, offset, limit]); return this.rows.slice(offset, offset + limit); }
  async get(id: number) { return this.rows.find((r) => r.id === id) ?? null; }
}

class FakeCache {
  store = new Map<string, Response>();
  async match(k: RequestInfo | URL) { return this.store.get(String(k))?.clone(); }
  async put(k: RequestInfo | URL, r: Response) { this.store.set(String(k), r); }
}

function deps(over: Partial<ApiDeps> = {}): ApiDeps & { repo: FakeRepo } {
  return { repo: new FakeRepo(), cache: null, limiter: { limit: async () => ({ success: true }) }, allowedOrigins: [APP, PRIV], fetch: (async () => { throw new Error("fetch 호출 안 됨"); }) as typeof fetch, ...over } as ApiDeps & { repo: FakeRepo };
}
const get = (path: string, d: ApiDeps, init: RequestInit = {}) => handle(new Request(`https://api.example${path}`, init), d);

describe("N5 조회 API", () => {
  test("T5-1 region·cat·type 조건이 repo 로 가고, 지역 조건에 온라인이 포함된다, 20건씩", async () => {
    const d = deps({ repo: new FakeRepo(Array.from({ length: 25 }, (_, i) => item(i + 1))) });
    const res = await get("/courses?region=41&cat=video&type=oneday", d);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CoursesResponse;
    expect(body.items).toHaveLength(PAGE);
    expect(d.repo.calls[0]).toEqual([{ regions: [{ sido: "41" }], cat: "video", type: "oneday", cursor: 0 }, 0, PAGE + 1]);
    expect(regionOr({ regions: [{ sido: "41" }], cursor: 0 })).toBe("sido_code.eq.41,mode.eq.online");
    expect(regionOr({ regions: [{ sido: "41", sigungu: "41110" }], cursor: 0 })).toBe("sigungu_code.eq.41110,and(sido_code.eq.41,sigungu_code.is.null),mode.eq.online");
    expect(regionOr({ cursor: 0 })).toBeNull();
  });

  test("지역 여러 개(최대 3): 하나라도 맞으면 포함, 순서와 상관없이 같은 조회", () => {
    const q = parseQuery(new URLSearchParams("region=41110,11,26")) as Query;
    expect(q.regions).toEqual([{ sido: "11" }, { sido: "26" }, { sido: "41", sigungu: "41110" }]);
    expect(regionOr(q)).toBe("sido_code.eq.11,sido_code.eq.26,sigungu_code.eq.41110,and(sido_code.eq.41,sigungu_code.is.null),mode.eq.online");
    // 같은 시도의 시군구 둘이면 "시군구 미상" 조건은 한 번만
    expect(regionOr(parseQuery(new URLSearchParams("region=41110,41130")) as Query)).toBe(
      "sigungu_code.eq.41110,and(sido_code.eq.41,sigungu_code.is.null),sigungu_code.eq.41130,mode.eq.online");
    const row = (sido_code: string | null, sigungu_code: string | null, mode = "offline") => ({ mode, sido_code, sigungu_code }) as CourseItem;
    expect(inRegion(q, row("11", "11110"))).toBe(true);
    expect(inRegion(q, row("41", "41110"))).toBe(true);
    expect(inRegion(q, row("41", null))).toBe(true);
    expect(inRegion(q, row("41", "41130"))).toBe(false);
    expect(inRegion(q, row("27", null))).toBe(false);
    expect(inRegion(q, row(null, null, "online"))).toBe(true);
  });

  test.each([
    "type=foo", "region=999", "foo=1", "region=99999", "cat=video&sub=blog", "region=11,26,27,41", "region=11,11", "region=",
    "region=11,", "sido=999", "sigungu=99999", "sido=11&sigungu=41110", "region=11&sido=11", "cursor=-1", "cursor=abc", `cursor=${MAX_CURSOR + 1}`, "region=41&region=11", "sub=__proto__", "mode=offline", "mode=",
    "sort=foo", "sort=", "sort=new&sort=price", "q=a", "q=", "q=%%", "q=!!", `q=${"가".repeat(31)}`, `q=${"가 ".repeat(60)}`,
    "cost=", "cost=partial", "cost=unknown", "cost=0", "cost=FREE", "cost=free&cost=free", "cost=paid&cost=card", "utm_campaign=launch",
  ])("T5-2 잘못된 파라미터 %s → 400", async (qs) => {
    expect((await get(`/courses?${qs}`, deps())).status).toBe(400);
  });

  test("T1-1 sort 는 price·new 만, 없으면 마감순", () => {
    expect(parseQuery(new URLSearchParams("sort=price"))).toEqual({ sort: "price", cursor: 0 });
    expect(parseQuery(new URLSearchParams("sort=new"))).toEqual({ sort: "new", cursor: 0 });
    expect(parseQuery(new URLSearchParams("sort=deadline"))).toEqual({ cursor: 0 }); // 기본값과 같은 조회
  });

  test("T1-3·T1-4 q 는 검색 키로 해석된다(core/search), 와일드카드·필터 문자는 남지 않는다", () => {
    const q = (s: string) => (parseQuery(new URLSearchParams({ q: s })) as Query).search;
    expect(q("챗 GPT")).toEqual({ cho: false, keys: ["챗지피티"] });
    expect(q("100%")).toEqual({ cho: false, keys: ["100"] });
    expect(q("a_b*c,d)(e")!.keys.join("")).toMatch(/^[가-힣]+$/);
    expect(q("ㅈㅍㅌ")).toEqual({ cho: true, keys: ["ㅈㅍㅌ"] });
  });

  test("T1-5 검색은 다른 조건과 같이 repo 로 간다(AND)", async () => {
    const d = deps();
    await get(`/courses?q=${encodeURIComponent("AI 영상")}&cat=video&sort=price`, d);
    expect(d.repo.calls[0]![0]).toEqual({ search: { cho: false, keys: ["에이아이영상"] }, cat: "video", sort: "price", cursor: 0 });
  });

  test("T1-6 캐시 키: 파라미터 순서·검색어 띄어쓰기가 달라도 같은 키, sort·q 가 다르면 다른 키", () => {
    const k = (s: string) => cacheKey("/courses", parseQuery(new URLSearchParams(s)) as Query);
    expect(k("sort=price&q=AI")).toBe(k("q=ai&sort=price"));
    expect(k("q=챗 GPT")).toBe(k("q=챗GPT"));
    expect(k("sort=price")).not.toBe(k(""));
    expect(k("sort=price")).not.toBe(k("sort=new"));
    expect(k("q=AI영상")).not.toBe(k("q=AI"));
    expect(k("q=지피티")).toBe(k("q=GPT")); // 같은 뜻 = 같은 키
    expect(k("q=ㅈㅍㅌ")).not.toBe(k("q=지피티"));
    expect(k("sort=deadline")).toBe(k(""));
    expect(k("")).toMatch(/^https:\/\/api\.cache\/v3\/courses\?/); // v2: capacity 추가, v3: 검색 규칙 변경. 옛 캐시를 쓰지 않는다
  });

  test("mode=online: 온라인 강좌만", () => {
    expect(parseQuery(new URLSearchParams("mode=online"))).toEqual({ mode: "online", cursor: 0 });
  });

  test.each(["paid", "free", "card"])("cost=%s 는 기존 조건·검색·다음 페이지와 함께 저장소로 전달된다", async (cost) => {
    const d = deps();
    expect(parseQuery(new URLSearchParams({ cost }))).toEqual({ cost, cursor: 0 });
    const response = await get(`/courses?cost=${cost}&region=41110,11&cat=video&sub=video_gen&type=oneday&mode=online&sort=price&q=AI&cursor=20`, d);
    expect(response.status).toBe(200);
    expect(d.repo.calls[0]).toEqual([{
      cost, regions: [{ sido: "11" }, { sido: "41", sigungu: "41110" }], cat: "video", sub: "video_gen",
      type: "oneday", mode: "online", sort: "price", search: { cho: false, keys: ["에이아이"] }, cursor: 20,
    }, 20, PAGE + 1]);
    expect(parseQuery(new URLSearchParams(`sido=41&cost=${cost}`))).toEqual({ regions: [{ sido: "41" }], cost, cursor: 0 });
  });

  test("G02 무료·전체·다음 페이지 캐시는 분리하고 조건 순서는 정규화한다", async () => {
    const d = deps({ cache: new FakeCache(), repo: new FakeRepo(Array.from({ length: 25 }, (_, i) => item(i + 1))) });
    await get("/courses?region=41,11&cat=video", d);
    const first = await (await get("/courses?cost=free&region=11,41&cat=video", d)).json() as CoursesResponse;
    await get("/courses?cat=video&region=41,11&cost=free", d);
    expect(d.repo.calls).toHaveLength(2);
    const second = await (await get(`/courses?cat=video&region=11,41&cost=free&cursor=${first.next}`, d)).json() as CoursesResponse;
    expect(d.repo.calls).toHaveLength(3);
    expect(first.items).toHaveLength(PAGE);
    expect(second.items.map((c) => c.id)).toEqual([21, 22, 23, 24, 25]);
    expect(second.next).toBeNull();
    expect(d.repo.calls[2]![0].cost).toBe("free");
    const k = (s: string) => cacheKey("/courses", parseQuery(new URLSearchParams(s)) as Query);
    expect(k("cost=free")).not.toBe(k(""));
    expect(k("cost=free&sort=price")).not.toBe(k("sort=price"));
    expect(k("cost=free&sort=new")).not.toBe(k("cost=free&sort=price"));
    expect(k("cost=free&cursor=20")).not.toBe(k("cost=free"));
  });

  test("비용 분류별 캐시를 분리하고 같은 분류 요청만 재사용한다", async () => {
    const d = deps({ cache: new FakeCache() });
    for (const cost of ["", "paid", "free", "card"]) {
      const query = cost ? `?cost=${cost}` : "";
      expect((await get(`/courses${query}`, d)).status).toBe(200);
      expect((await get(`/courses${query}`, d)).status).toBe(200);
    }
    expect(d.repo.calls.map(([q]) => q.cost)).toEqual([undefined, "paid", "free", "card"]);
  });

  test("옛 파라미터 sido·sigungu(v3 번들)는 region 하나로 바꿔 받는다", () => {
    expect(parseQuery(new URLSearchParams("sido=41"))).toEqual({ regions: [{ sido: "41" }], cursor: 0 });
    expect(parseQuery(new URLSearchParams("sido=41&sigungu=41110"))).toEqual({ regions: [{ sido: "41", sigungu: "41110" }], cursor: 0 });
    expect(parseQuery(new URLSearchParams("sigungu=41110"))).toEqual({ regions: [{ sido: "41", sigungu: "41110" }], cursor: 0 });
  });

  test("시군구 코드는 시도를 채운다", () => {
    expect(parseQuery(new URLSearchParams("region=41110"))).toEqual({ regions: [{ sido: "41", sigungu: "41110" }], cursor: 0 });
  });

  test("T5-3 내보내는 컬럼은 CourseItem 과 같고 내부 컬럼이 없다", () => {
    const cols = COURSE_COLUMNS.split(",");
    expect(cols.sort()).toEqual(Object.keys(item(1)).sort());
    for (const c of ["raw", "last_seen_at", "category_by", "title_norm", "source_id"]) expect(cols).not.toContain(c);
  });

  test("T5-4 허용 Origin 만 반사하고 * 는 쓰지 않는다", async () => {
    const d = deps();
    const ok = await get("/meta", d, { headers: { origin: PRIV } });
    expect(ok.headers.get("access-control-allow-origin")).toBe(PRIV);
    const bad = await get("/meta", d, { headers: { origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    expect(corsHeaders(null, [APP])).toEqual({ vary: "Origin" });
    const pre = await get("/courses", d, { method: "OPTIONS", headers: { origin: APP } });
    expect([pre.status, pre.headers.get("access-control-allow-origin")]).toEqual([204, APP]);
  });

  test("T5-5 같은 조회는 캐시 적중, repo 0회. 파라미터 순서가 달라도 같은 키, 다른 조회는 다른 키", async () => {
    const d = deps({ cache: new FakeCache(), repo: new FakeRepo([item(1)]) });
    await get("/courses?region=41,11&cat=video", d);
    const hit = await get("/courses?cat=video&region=11,41", d, { headers: { origin: APP } });
    expect(d.repo.calls).toHaveLength(1);
    expect(hit.headers.get("access-control-allow-origin")).toBe(APP); // 캐시된 응답에도 요청 Origin 기준 CORS
    await get("/courses?region=11&cat=video", d);
    expect(d.repo.calls).toHaveLength(2);
  });

  test("T5-6 요청 제한 초과 → 429, IP 를 키로 쓴다", async () => {
    const keys: string[] = [];
    const d = deps({ limiter: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } });
    const res = await get("/meta", d, { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(res.status).toBe(429);
    expect(keys).toEqual(["1.2.3.4"]);
    expect(d.repo.calls).toHaveLength(0);
  });

  test("T5-6b 요청 제한 바인딩이 없으면(호출 실패) 500 으로 막는다", async () => {
    const d = deps({ limiter: undefined as unknown as ApiDeps["limiter"] });
    expect((await get("/courses", d)).status).toBe(500);
    expect(d.repo.calls).toHaveLength(0);
  });

  test("T5-7 상세: 있음 200, 없음 404, 숫자 아님 400", async () => {
    const d = deps({ repo: new FakeRepo([item(7)]) });
    const ok = await get("/courses/7", d);
    expect([ok.status, ((await ok.json()) as CourseItem).id]).toEqual([200, 7]);
    expect((await get("/courses/8", d)).status).toBe(404);
    expect((await get("/courses/abc", d)).status).toBe(400);
    expect((await get("/nope", d)).status).toBe(404);
    expect((await get("/meta?select=*", d)).status).toBe(400);
  });

  test.each(["POST", "PUT", "DELETE", "PATCH"])("T5-8 %s → 405", async (method) => {
    const d = deps();
    expect((await get("/courses", d, { method })).status).toBe(405);
    expect(d.repo.calls).toHaveLength(0);
  });

  test("T5-9 cursor 로 두 페이지가 겹치지 않고 끝에서 next=null", async () => {
    const d = deps({ repo: new FakeRepo(Array.from({ length: 25 }, (_, i) => item(i + 1))) });
    const p1 = (await (await get("/courses", d)).json()) as CoursesResponse;
    expect(p1.next).toBe(String(PAGE));
    const p2 = (await (await get(`/courses?cursor=${p1.next}`, d)).json()) as CoursesResponse;
    expect(p2.items.map((r) => r.id)).toEqual([21, 22, 23, 24, 25]);
    expect(p2.next).toBeNull();
    expect(new Set([...p1.items, ...p2.items].map((r) => r.id)).size).toBe(25);
  });

  test("repo 오류는 500, 내부 메시지를 내보내지 않는다", async () => {
    const d = deps();
    d.repo.list = async () => { throw new Error("password=secret"); };
    const res = await get("/courses", d);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });

  test("meta 는 카테고리 6·소분류 18·시도 16", async () => {
    const m = (await (await get("/meta", deps())).json()) as MetaResponse;
    expect(m.categories).toHaveLength(6);
    expect(m.categories.flatMap((c) => c.subs)).toHaveLength(18);
    expect(m.sido).toHaveLength(16);
  });
});
