import type { CourseItem, MetaResponse } from "../../shared/api-types";
import { CAMPAIGN_CODE, CAMPAIGN_MEDIA, CAMPAIGN_SOURCES, type Campaign } from "./acquisition";
import { track } from "./analytics";
import { getMeta } from "./api";
import { buildQuery, isCostFilter, MAX_REGIONS, readQuery, searchable, type Filters } from "./logic";
import { createShareLink, sendShareMessage } from "./toss";

const APP = "intoss://njob-matching";
const INTERNAL_ORIGIN = "https://internal.invalid";
const FILTER_KEYS = new Set(["region", "cat", "sub", "type", "mode", "cost", "sort", "q"]);

/** URL의 조건을 메타데이터의 허용값으로 좁힌다. 외부 목적지나 캠페인은 옮기지 않는다. */
export function safeFilters(f: Filters, meta: MetaResponse): Filters {
  const safe: Filters = {};
  const regions = f.region?.split(",") ?? [];
  const validRegion = (code: string) => meta.sido.some((x) => x.code === code) || meta.sigungu.some((x) => x.code === code);
  if (regions.length && regions.length <= MAX_REGIONS && new Set(regions).size === regions.length && regions.every(validRegion)) safe.region = regions.join(",");
  const cat = meta.categories.find((c) => c.code === f.cat);
  if (cat) safe.cat = cat.code;
  const subParent = meta.categories.find((c) => c.subs.some((s) => s.code === f.sub));
  if (subParent && (!f.cat || cat?.code === subParent.code)) safe.sub = f.sub;
  if (f.type === "oneday" || f.type === "training") safe.type = f.type;
  if (f.mode === "online") { safe.mode = "online"; delete safe.region; }
  if (isCostFilter(f.cost)) safe.cost = f.cost;
  if (f.sort === "price" || f.sort === "new") safe.sort = f.sort;
  if (f.q && searchable(f.q)) safe.q = f.q.trim();
  return safe;
}

function destination(path: string, filters: Filters): string {
  const query = buildQuery(filters);
  return `${path}${query ? `?${query}` : ""}`;
}

function withCampaign(path: string, campaign: Campaign): string {
  const url = internalURL(path);
  for (const key of ["source", "medium", "campaign", "content"] as const) url.searchParams.set(`utm_${key}`, campaign[key]);
  return `${APP}${url.pathname}${url.search}`;
}

/** 커스텀 scheme 파싱의 WebView별 차이를 피하고 고정된 앱 prefix만 붙인다. */
function internalURL(path: string): URL {
  if (!/^\/(?:list|course\/[1-9]\d*)(?:\?|$)/.test(path) || /[#\\\u0000-\u0020]/.test(path)) throw new Error("목록 또는 강좌의 내부 경로를 입력해 주세요");
  const url = new URL(path, INTERNAL_ORIGIN);
  if (url.origin !== INTERNAL_ORIGIN || !/^\/(?:list|course\/[1-9]\d*)$/.test(url.pathname)) throw new Error("지원하지 않는 목적지예요");
  if (url.pathname.startsWith("/course/") && !Number.isSafeInteger(Number(url.pathname.slice("/course/".length)))) throw new Error("잘못된 강좌 번호예요");
  return url;
}

export function buildListSharePath(filters: Filters, meta: MetaResponse): string {
  return withCampaign(destination("/list", safeFilters(filters, meta)), { source: "user_share", medium: "share", campaign: "list_share", content: "list" });
}

export function buildCourseSharePath(course: CourseItem, meta: MetaResponse): string {
  if (!Number.isSafeInteger(course.id) || course.id <= 0) throw new Error("잘못된 강좌 번호예요");
  const region = meta.sigungu.some((r) => r.code === course.sigungu_code) ? course.sigungu_code : course.sido_code;
  const fallback = safeFilters({
    region: course.mode === "online" ? undefined : region ?? undefined,
    mode: course.mode === "online" ? "online" : undefined,
    cat: course.category_main,
    cost: isCostFilter(course.cost_type) ? course.cost_type : undefined,
  }, meta);
  return withCampaign(destination(`/course/${course.id}`, fallback), { source: "user_share", medium: "share", campaign: "course_share", content: "course" });
}

export function fallbackListPath(search: string, meta: MetaResponse): string {
  const params = new URLSearchParams(search);
  // 중복 값으로 오염된 조건은 대체 탐색에 사용하지 않는다.
  for (const key of FILTER_KEYS) if (params.getAll(key).length > 1) params.delete(key);
  return destination("/list", safeFilters(readQuery(params.toString()), meta));
}

/** 운영자용: 허용된 내부 목적지와 등록 코드만 받는다. SDK 외부 URL 생성은 토스 안에서 한다. */
export function buildCampaignPath(path: string, campaign: Campaign, meta: MetaResponse): string {
  const url = internalURL(path);
  for (const key of url.searchParams.keys()) {
    if (!FILTER_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error("지원하지 않거나 중복된 탐색 조건이에요");
  }
  const input = readQuery(url.search);
  const safe = safeFilters(input, meta);
  if ([...url.searchParams].some(([key, value]) => !value || (input[key as keyof Filters] !== safe[key as keyof Filters]))) throw new Error("탐색 조건을 확인해 주세요");
  if (["source", "medium", "campaign", "content"].some((key) => typeof campaign?.[key as keyof Campaign] !== "string" || !CAMPAIGN_CODE.test(campaign[key as keyof Campaign])) || !CAMPAIGN_SOURCES.has(campaign.source) || !CAMPAIGN_MEDIA.has(campaign.medium)) throw new Error("등록된 캠페인 코드를 입력해 주세요");
  return withCampaign(destination(url.pathname, safe), campaign);
}

/** 반환은 공유 시트를 열었다는 뜻이며, 사용자 전송 완료는 뜻하지 않는다. */
export async function sharePath(path: string, message: string): Promise<void> {
  if (!path.startsWith(`${APP}/`)) throw new Error("지원하지 않는 공유 목적지예요");
  const url = internalURL(path.slice(APP.length));
  for (const key of url.searchParams.keys()) if ((!FILTER_KEYS.has(key) && !["utm_source", "utm_medium", "utm_campaign", "utm_content"].includes(key)) || url.searchParams.getAll(key).length !== 1) throw new Error("지원하지 않는 공유 조건이에요");
  const link = await createShareLink(path);
  track("njob_share_link_created", { target_type: url.pathname === "/list" ? "list" : "course" });
  await sendShareMessage(`${message}\n${link}`);
}

// 개발 WebView에서만 제공하는 운영자 도구. 링크 생성만 하며 공유 시트를 열거나 게시하지 않는다.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as Window & { __createCampaignLink?: (path: string, campaign: Campaign) => Promise<string> }).__createCampaignLink = async (path, campaign) =>
    createShareLink(buildCampaignPath(path, campaign, await getMeta()));
}
