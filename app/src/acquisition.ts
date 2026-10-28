import { buildQuery, readQuery } from "./logic";

export interface Campaign {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

export const CAMPAIGN_CODE = /^[a-z0-9_-]{1,64}$/;
export const CAMPAIGN_SOURCES = new Set(["naver_cafe", "naver_blog", "gpters", "greenlove", "partner", "user_share"]);
export const CAMPAIGN_MEDIA = new Set(["community", "search_content", "partner", "share", "paid"]);

/** 자유 입력은 로그에 그대로 남기지 않는다. 중복 키 역시 오염된 값으로 본다. */
export function readCampaign(search: string): Campaign {
  const p = new URLSearchParams(search);
  const value = (key: string, allowed?: Set<string>) => {
    const values = p.getAll(`utm_${key}`);
    if (!values.length) return "unattributed";
    const v = values[0]!;
    return values.length === 1 && CAMPAIGN_CODE.test(v) && (!allowed || allowed.has(v)) ? v : "unknown";
  };
  return { source: value("source", CAMPAIGN_SOURCES), medium: value("medium", CAMPAIGN_MEDIA), campaign: value("campaign"), content: value("content") };
}

/** 화면 코드만 기록: 잘못된 경로나 식별자에 담긴 자유 입력은 로그에 보내지 않는다. */
export function entryPath(path: string): string {
  if (["/", "/list", "/bookmarks"].includes(path)) return path;
  if (/^\/course\/[1-9]\d*$/.test(path)) return "/course/:id";
  return "unknown";
}

/** 마지막 목록에는 탐색 조건만 남긴다. 외부/다른 화면 목적지는 복원하지 않는다. */
export function cleanLastList(path: string | null): string | null {
  if (!path || !/^\/list(?:\?|$)/.test(path)) return null;
  const query = buildQuery(readQuery(path.split("?")[1]?.split("#")[0] ?? ""));
  return `/list${query ? `?${query}` : ""}`;
}
