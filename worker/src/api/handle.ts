// 조회 API. 정본: docs/06-스펙/plan.md "API", spec FR-012·013
import type { ApiError, CostFilter, CourseItem, CoursesResponse, Sort } from "../../../shared/api-types";
import { MAIN_OF, type Main, type Sub } from "../core/classify";
import { SIDO_LIST, SIGUNGU_LIST } from "../core/region";
import { parseSearch, type Search } from "../core/search";
import { courseExtra, emptyExtra } from "./extra";
import { META } from "./meta";

export const PAGE = 20;
/** offset 상한. 목록을 통째로 긁는 것을 막는다(FR-013). 지역·분야를 좁히면 이 안에 다 들어온다 */
export const MAX_CURSOR = 1000;

/** 지역 하나: 시도 전체 또는 시군구 */
export interface Region {
  sido: string;
  sigungu?: string;
}

/** 지역은 최대 3개까지 고른다 */
export const MAX_REGIONS = 3;

export interface Query {
  regions?: Region[];
  cat?: Main;
  sub?: Sub;
  type?: "oneday" | "training";
  /** 온라인 강좌만 */
  mode?: "online";
  /** 확인된 비용 분류와 정확히 일치한다. 금액으로 분류를 추정하지 않는다 */
  cost?: CostFilter;
  sort?: Sort;
  /** 제목 검색(core/search parseSearch 결과) */
  search?: Search;
  cursor: number;
}



export interface ReadRepo {
  /** 조건에 맞는 행을 접수 마감일 순으로 offset 부터 limit 건 */
  list(q: Query, offset: number, limit: number): Promise<CourseItem[]>;
  get(id: number): Promise<CourseItem | null>;
}

export interface ApiDeps {
  repo: ReadRepo;
  cache: Pick<Cache, "match" | "put"> | null;
  /** 필수. 바인딩이 빠지면 호출이 실패해 500 으로 막힌다(제한 없이 열리지 않는다) */
  limiter: { limit(o: { key: string }): Promise<{ success: boolean }> }; // Workers RateLimit 바인딩과 같은 모양(앱 목업도 이 파일을 쓴다)
  allowedOrigins: string[];
  /** 원천 상세 보강(/courses/:id/extra)용 */
  fetch: typeof fetch;
}

/** 보강 응답 캐시(초). 신청 인원이 바뀌므로 목록(1시간)보다 길되 하루는 넘기지 않는다 */
export const EXTRA_MAX_AGE = 6 * 3600;

const SIDO = new Set(SIDO_LIST.map((s) => s.code));
const SIGUNGU_SIDO = new Map(SIGUNGU_LIST.map((s) => [s.code, s.sido]));
const MAINS = new Set<string>(Object.values(MAIN_OF));
// sido·sigungu: 지역 1개만 고르던 v3 앱 번들(2026-10-13 검토 요청됨)이 쓰는 옛 파라미터. 그 번들이 내려가면 지운다
const KEYS = new Set(["region", "sido", "sigungu", "cat", "sub", "type", "mode", "cost", "sort", "q", "cursor"]);

/** 화이트리스트 검증. 모르는 파라미터·값이면 오류 문자열 */
export function parseQuery(params: URLSearchParams): Query | string {
  const q: Query = { cursor: 0 };
  const legacy: { sido?: string; sigungu?: string } = {};
  for (const [k, v] of params) {
    if (!KEYS.has(k)) return `모르는 파라미터: ${k}`;
    if (params.getAll(k).length > 1) return `중복 파라미터: ${k}`;
    if (k === "region") {
      // region=11,41110 — 시도(2자리) 또는 시군구(5자리) 코드를 쉼표로, 최대 3개. 캐시 키가 같도록 정렬해 둔다
      const codes = v.split(",");
      if (codes.length > MAX_REGIONS || new Set(codes).size !== codes.length) return "region";
      const regions: Region[] = [];
      for (const c of codes.sort()) {
        if (SIDO.has(c)) regions.push({ sido: c });
        else if (SIGUNGU_SIDO.has(c)) regions.push({ sido: SIGUNGU_SIDO.get(c)!, sigungu: c });
        else return "region";
      }
      q.regions = regions;
    }
    if (k === "sido") { if (!SIDO.has(v)) return "sido"; legacy.sido = v; }
    if (k === "sigungu") { if (!SIGUNGU_SIDO.has(v)) return "sigungu"; legacy.sigungu = v; }
    if (k === "cat") { if (!MAINS.has(v)) return "cat"; q.cat = v as Main; }
    if (k === "sub") { if (!Object.hasOwn(MAIN_OF, v)) return "sub"; q.sub = v as Sub; }
    if (k === "type") { if (v !== "oneday" && v !== "training") return "type"; q.type = v; }
    if (k === "mode") { if (v !== "online") return "mode"; q.mode = v; }
    if (k === "cost") { if (v !== "paid" && v !== "free" && v !== "card") return "cost"; q.cost = v; }
    if (k === "sort") {
      if (v !== "deadline" && v !== "price" && v !== "new") return "sort";
      if (v !== "deadline") q.sort = v; // 마감순은 기본값이라 저장하지 않는다(같은 캐시 키)
    }
    if (k === "q") {
      const s = parseSearch(v);
      if (!s) return "q";
      q.search = s;
    }
    if (k === "cursor") {
      if (!/^\d{1,4}$/.test(v) || Number(v) > MAX_CURSOR) return "cursor";
      q.cursor = Number(v);
    }
  }
  if (legacy.sido || legacy.sigungu) {
    if (q.regions) return "region 과 sido·sigungu 를 같이 쓸 수 없음";
    const sido = legacy.sigungu ? SIGUNGU_SIDO.get(legacy.sigungu)! : legacy.sido!;
    if (legacy.sido && legacy.sido !== sido) return "sigungu 가 sido 에 속하지 않음";
    q.regions = [legacy.sigungu ? { sido, sigungu: legacy.sigungu } : { sido }];
  }
  if (q.sub && q.cat && MAIN_OF[q.sub] !== q.cat) return "sub 가 cat 에 속하지 않음";
  return q;
}

/** 지역 조건(PostgREST or 문자열). 고른 지역 중 하나라도 맞으면 포함. 온라인 강좌는 항상 포함,
 *  시군구를 고르면 그 시도 단위로만 알려진 강좌(시군구 미상)도 포함 */
export function regionOr(q: Query): string | null {
  if (!q.regions?.length) return null;
  const parts = new Set<string>();
  for (const r of q.regions) {
    if (r.sigungu) parts.add(`sigungu_code.eq.${r.sigungu}`).add(`and(sido_code.eq.${r.sido},sigungu_code.is.null)`);
    else parts.add(`sido_code.eq.${r.sido}`);
  }
  return [...parts, "mode.eq.online"].join(",");
}

/** regionOr 과 같은 규칙을 행 하나에 적용(앱 개발용 메모리 목업이 쓴다) */
export function inRegion(q: Query, c: Pick<CourseItem, "mode" | "sido_code" | "sigungu_code">): boolean {
  if (!q.regions?.length || c.mode === "online") return true;
  return q.regions.some((r) => (r.sigungu ? c.sigungu_code === r.sigungu || (c.sido_code === r.sido && !c.sigungu_code) : c.sido_code === r.sido));
}

/** 가격순 기준(view price_sort 와 같은 규칙): 무료 0, 그 밖은 금액, 모르면 null */
export const priceSort = (c: Pick<CourseItem, "cost_type" | "cost_amount">) => (c.cost_type === "free" ? 0 : c.cost_amount);

/** list 정렬을 행 둘에 적용(앱 개발용 메모리 목업이 쓴다. SupabaseReadRepo.list 의 order 와 같다) */
export function compareCourses(sort: Sort | undefined) {
  const nullsLast = <T extends string | number>(a: T | null, b: T | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);
  return (a: CourseItem, b: CourseItem): number => {
    if (sort === "new") return b.id - a.id;
    return (sort === "price" ? nullsLast(priceSort(a), priceSort(b)) : 0)
      || nullsLast(a.apply_end, b.apply_end) || nullsLast(a.course_start, b.course_start) || a.id - b.id;
  };
}

/** 응답 계약 버전. CourseItem 에 필드를 더하면 올린다 — 안 올리면 배포 뒤 1시간 동안 캐시된 옛 모양이 나간다 */
const CACHE_VER = "v3"; // v3: 검색 규칙 변경(약어 한글 이름·초성·영타)

/** 캐시 키: 검증을 통과한 값만 정해진 순서로 (같은 조회 = 같은 키) */
export function cacheKey(path: string, q?: Query): string {
  if (!q) return `https://api.cache/${CACHE_VER}${path}`;
  const p = new URLSearchParams();
  if (q.regions?.length) p.set("region", q.regions.map((r) => r.sigungu ?? r.sido).join(","));
  for (const k of ["cat", "sub", "type", "mode", "cost", "sort"] as const) if (q[k]) p.set(k, q[k]!);
  if (q.search) p.set("q", `${q.search.cho ? "cho:" : ""}${q.search.keys.join("|")}`); // 해석한 키로(같은 뜻의 검색어 = 같은 키)
  p.set("cursor", String(q.cursor));
  return `https://api.cache/${CACHE_VER}${path}?${p}`;
}

const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(maxAge ? { "cache-control": `public, max-age=${maxAge}` } : {}) },
  });
const err = (status: number, error: string) => json({ error } satisfies ApiError, status);

/** methods 가 GET 외를 포함하면(찜 API) 세션 헤더도 허용한다 */
export function corsHeaders(origin: string | null, allowed: string[], methods = "GET, OPTIONS"): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return { vary: "Origin" };
  const h: Record<string, string> = { "access-control-allow-origin": origin, "access-control-allow-methods": methods, vary: "Origin" };
  if (methods !== "GET, OPTIONS") h["access-control-allow-headers"] = "authorization, content-type";
  return h;
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

async function cached(deps: ApiDeps, key: string, make: () => Promise<Response>): Promise<Response> {
  const hit = await deps.cache?.match(key);
  if (hit) return hit;
  const res = await make();
  // cache-control 없는 응답(원천 실패로 비운 보강 응답)은 캐시하지 않는다
  if (res.ok && res.headers.has("cache-control") && deps.cache) await deps.cache.put(key, res.clone());
  return res;
}

async function route(req: Request, deps: ApiDeps): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/meta") {
    if (url.search) return err(400, "파라미터 없음");
    return cached(deps, cacheKey("/meta"), async () => json(META, 200, 86400));
  }
  if (url.pathname === "/courses") {
    const q = parseQuery(url.searchParams);
    if (typeof q === "string") return err(400, q);
    return cached(deps, cacheKey("/courses", q), async () => {
      const rows = await deps.repo.list(q, q.cursor, PAGE + 1);
      const next = rows.length > PAGE && q.cursor + PAGE <= MAX_CURSOR ? String(q.cursor + PAGE) : null;
      return json({ items: rows.slice(0, PAGE), next } satisfies CoursesResponse, 200, 3600);
    });
  }
  const x = /^\/courses\/([^/]+)\/extra$/.exec(url.pathname);
  if (x) {
    if (url.search) return err(400, "파라미터 없음");
    if (!/^\d{1,15}$/.test(x[1]!)) return err(400, "id");
    return cached(deps, cacheKey(`/courses/${Number(x[1])}/extra`), async () => { // 07 과 7 은 같은 키
      const row = await deps.repo.get(Number(x[1]));
      if (!row) return err(404, "없음");
      const extra = await courseExtra(row, deps.fetch);
      return extra ? json(extra, 200, EXTRA_MAX_AGE) : json(emptyExtra(row));
    });
  }
  const m = /^\/courses\/([^/]+)$/.exec(url.pathname);
  if (m) {
    if (url.search) return err(400, "파라미터 없음");
    if (!/^\d{1,15}$/.test(m[1]!)) return err(400, "id");
    return cached(deps, cacheKey(`/courses/${Number(m[1])}`), async () => {
      const row = await deps.repo.get(Number(m[1]));
      return row ? json(row, 200, 3600) : err(404, "없음");
    });
  }
  return err(404, "없음");
}

export async function handle(req: Request, deps: ApiDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), deps.allowedOrigins);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return withCors(new Response(null, { status: 405, headers: { allow: "GET, OPTIONS" } }), cors);
  try {
    const { success } = await deps.limiter.limit({ key: req.headers.get("cf-connecting-ip") ?? "unknown" });
    if (!success) return withCors(err(429, "요청이 너무 많습니다"), cors);
    return withCors(await route(req, deps), cors);
  } catch (e) {
    console.error("api", e instanceof Error ? e.message : e);
    return withCors(err(500, "일시적인 오류"), cors);
  }
}
