// 링커리어 교육 — https://linkareer.com/list/education?page=N (Next.js SSR). 문서: docs/02-교육소스/04-민간-커뮤니티-모임/행사-이벤트-플랫폼.md "링커리어", plan 소스별 표 10행.
// robots.txt 는 /stem/learn/ 일부만 막고 /list/ 는 허용. HTML 안 __NEXT_DATA__ 의 Apollo 캐시를 읽는다(로그인 불필요).
// 목록 기본 질의가 status "OPEN"(마감 전) 필터라 그 질의 결과만 받고, 20건씩 page 로 넘긴다(totalCount 로 collectPages).
// 같은 캐시에 섞여 오는 광고 배너(activityListFromAdsByPlacementCode)의 공고는 쓰지 않는다.
import { parseCost } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText } from "./util";

export interface LinkareerRec {
  id: string;
  title: string;
  org: string;
  /** NORMAL 마감일 · ASAP 모집 시 마감 · ALWAYS 상시 · SCHEDULED 모집예정 (사이트 번들의 enum) */
  recruitType: string;
  /** epoch ms */
  recruitCloseAt: unknown;
  activityStartAt: unknown;
  activityEndAt: unknown;
  cost: unknown;
  /** "온라인" | "오프라인" | "온/오프라인 혼합" */
  onoffline: string;
  /** "서울 강남구", "부산" (구·군이 "전체"면 시도만) */
  places: string[];
  categories: string[];
}

const BASE = "https://linkareer.com";
export const listUrl = (page: number) => `${BASE}/list/education?page=${page}`;
const OPEN = new Set(["NORMAL", "ASAP", "ALWAYS"]);
const CLOSED = new Set(["SCHEDULED"]);
const MODE: Record<string, "online" | "offline" | "blended"> = { 온라인: "online", 오프라인: "offline", "온/오프라인 혼합": "blended" };

type Ref = { __ref: string };
type State = Record<string, Record<string, unknown>>;

/** Apollo 캐시 참조 → name. 참조가 없으면 "", 참조가 있는데 못 풀면 throw(값이 있는데 못 읽음) */
function refName(get: (v: unknown) => unknown, v: unknown): string {
  if (v === null || v === undefined) return "";
  const name = (get(v) as { name?: unknown } | undefined)?.name;
  if (typeof name !== "string" || !name) throw new Error("linkareer 참조 해석 실패");
  return name;
}

export function parse(html: string): { total: number | null; recs: LinkareerRec[] } {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("linkareer __NEXT_DATA__ 없음");
  const st = (JSON.parse(m[1]!) as { props?: { pageProps?: { __APOLLO_STATE__?: State } } }).props?.pageProps?.__APOLLO_STATE__;
  const root = st?.ROOT_QUERY;
  if (!st || !root) throw new Error("linkareer Apollo 캐시 없음");
  const key = Object.keys(root).find((k) => k.startsWith("activities("));
  if (!key) throw new Error("linkareer 목록 질의 없음");
  const args = JSON.parse(key.slice("activities(".length, -1)) as { filterBy?: { status?: string; activityTypeID?: string } };
  // 마감 전 필터가 빠지면 마감 공고까지 받게 되므로 멈춘다
  if (args.filterBy?.status !== "OPEN" || args.filterBy.activityTypeID !== "6") throw new Error(`linkareer 목록 필터 변경 ${key.slice(0, 80)}`);
  const conn = root[key] as { nodes?: Ref[]; totalCount?: unknown };
  if (!Array.isArray(conn?.nodes)) throw new Error("linkareer 목록 nodes 없음");
  const get = (r: unknown) => (r && typeof r === "object" && "__ref" in r ? st[(r as Ref).__ref] : undefined);
  const recs = conn.nodes.map((n): LinkareerRec => {
    const a = st[n.__ref];
    if (!a) throw new Error(`linkareer 캐시에 없는 공고 ${n.__ref}`);
    const districts = ((a.regionDistricts as unknown[]) ?? []).map((d) => {
      const o = get(d) as { name?: string; region?: { name?: string } } | undefined;
      if (!o?.name || !o.region?.name) throw new Error(`linkareer 지역 형식 ${a.id}`);
      return o.name === "전체" ? o.region.name : `${o.region.name} ${o.name}`;
    });
    return {
      id: String(a.id ?? ""),
      title: String(a.title ?? "").trim(),
      org: String(a.organizationName ?? "").trim(),
      recruitType: String(a.recruitType ?? ""),
      recruitCloseAt: a.recruitCloseAt,
      activityStartAt: a.activityStartAt,
      activityEndAt: a.activityEndAt,
      cost: a.cost,
      onoffline: refName(get, a.onoffline),
      places: districts,
      categories: ((a.categories as unknown[]) ?? []).map((c) => String((get(c) as { name?: string } | undefined)?.name ?? "")).filter(Boolean),
    };
  });
  return { total: typeof conn.totalCount === "number" ? conn.totalCount : null, recs };
}

/** epoch ms → KST 날짜. 비면 null, 숫자가 아니면 throw */
function kst(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`linkareer 날짜 형식 ${String(v).slice(0, 30)}`);
  return new Date(v + 9 * 3600_000).toISOString().slice(0, 10);
}

export function normalize(r: LinkareerRec): CourseDraft | null {
  if (!/^\d+$/.test(r.id) || !r.title || !r.recruitType) throw new Error("linkareer 공고 형식");
  if (!OPEN.has(r.recruitType)) {
    if (CLOSED.has(r.recruitType)) return null;
    throw new Error(`linkareer 모르는 모집유형 ${r.recruitType}`);
  }
  const close = kst(r.recruitCloseAt);
  if (r.recruitType !== "ALWAYS" && !close) throw new Error(`linkareer 마감일 없음 ${r.id}`);
  const mode = r.onoffline ? MODE[r.onoffline] : null;
  if (mode === undefined) throw new Error(`linkareer 모르는 온오프라인 ${r.onoffline}`);
  if (r.cost !== null && r.cost !== undefined && (typeof r.cost !== "number" || !Number.isSafeInteger(r.cost) || r.cost < 0)) throw new Error(`linkareer 비용 형식 ${String(r.cost)}`);
  const cost = typeof r.cost === "number" ? parseCost(`${r.cost}원`) : null;
  return {
    source_id: r.id,
    title: r.title,
    desc: [...new Set(r.categories)].join(" ").slice(0, 200) || undefined, // 분류용 짧은 카테고리 이름들
    provider_name: r.org || null,
    mode,
    address: mode === "online" ? null : (r.places[0] ?? null),
    ...(cost ? { cost_type: cost.type, cost_amount: cost.amount } : {}),
    apply_end: close,
    course_start: kst(r.activityStartAt),
    course_end: kst(r.activityEndAt),
    url: `${BASE}/activity/${r.id}`,
  };
}

export const linkareer: Source<LinkareerRec> = {
  code: "linkareer",
  async fetchList({ fetch }) {
    return collectPages("linkareer", async (page) => {
      const { total, recs } = parse(await fetchText(fetch, listUrl(page), { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } }));
      return { total, rows: recs };
    }, { key: (r) => r.id, maxPages: 80, gapMs: 2000 });
  },
  normalize,
};
