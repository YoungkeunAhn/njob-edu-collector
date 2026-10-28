import type { CourseItem } from "../../shared/api-types";
import { entryPath, readCampaign, type Campaign } from "./acquisition";
import { isCostFilter, type Filters } from "./logic";
import { logEvent } from "./toss";

export type EventName = "njob_entry" | "njob_intro_continue" | "njob_list_view" | "njob_empty_result" | "njob_course_view" | "njob_outbound_click" | "njob_bookmark_added" | "njob_share_intent" | "njob_share_link_created" | "njob_course_unavailable";
export type EventParams = Record<string, string | number | boolean>;
let attribution: Campaign | undefined;

/** 웹뷰의 첫 진입에만 호출. 내부 탐색이나 StrictMode 재실행으로 귀속을 바꾸지 않는다. */
export function initAcquisition(search: string, path: string): void {
  if (attribution) return;
  attribution = readCampaign(search);
  track("njob_entry", { entry_path: entryPath(path) });
}

const allowed = new Set(["entry_path", "course_id", "source", "category", "cost_type", "region", "cat", "sub", "type", "mode", "cost", "sort", "result_bucket", "target_type", "has_fallback"]);

/** 허용된 파라미터만 기록하며 SDK 동기/비동기 실패는 toss 경계에서 흡수한다. */
export function track(event: EventName, params: EventParams = {}): void {
  const common = attribution ?? readCampaign("");
  const safe = Object.fromEntries(Object.entries(params).filter(([key, value]) => {
    if (!allowed.has(key)) return false;
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
    if (typeof value === "boolean") return true;
    if (key === "entry_path") return ["/", "/list", "/bookmarks", "/course/:id", "unknown"].includes(value);
    return /^[a-z0-9_,:-]{1,64}$/.test(value);
  }));
  logEvent(event, { ...safe, acquisition_source: common.source, medium: common.medium, campaign: common.campaign, content: common.content });
}

export function courseParams(c: CourseItem): EventParams {
  return { course_id: c.id, source: c.source, category: c.category_main, cost_type: c.cost_type ?? "unknown" };
}

export function listParams(f: Filters, count?: number): EventParams {
  const result: EventParams = {};
  for (const key of ["region", "cat", "sub", "type", "mode", "cost", "sort"] as const) {
    if (f[key] && (key !== "cost" || isCostFilter(f.cost))) result[key] = f[key]!;
  }
  if (count !== undefined) result.result_bucket = count === 0 ? "0" : count < 5 ? "1_4" : "5_plus";
  return result;
}
