// K-MOOC 강좌정보 (data.go.kr 15042355, courseList_v2_0). 픽스처는 원본 서버 실응답(2026-10-12)
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, imageUrl, num } from "./util";

export interface KmoocRow {
  id: string;
  name: string;
  url: string;
  org_name?: string;
  /** Unix epoch 초 문자열 */
  enrollment_start?: string;
  enrollment_end?: string;
  study_start?: string;
  study_end?: string;
  course_image?: string;
}

const SIZE = 1000;
/** epoch 초 → KST 날짜. 비어 있으면 null, 형식이 다르면 throw(마감일을 잃으면 마감 필터를 빠져나간다) */
const kst = (epoch?: string) => {
  if (epoch === undefined || epoch === null || epoch === "") return null;
  if (!/^\d{9,11}$/.test(epoch)) throw new Error(`kmooc 날짜 형식 ${epoch}`);
  return new Date((Number(epoch) + 9 * 3600) * 1000).toISOString().slice(0, 10);
};

/** 수강신청이 열린 강좌만 (plan 소스별 표 15행). 마감은 runSource 가 거른다 */
export const enrollOpen = (r: KmoocRow, today: string) => {
  const s = kst(r.enrollment_start);
  return !s || s <= today;
};

export function parse(body: string): { total: number | null; rows: KmoocRow[] } {
  const j = JSON.parse(body) as { resultCode?: string; resultMsg?: string; totalCount?: number; items?: KmoocRow[] };
  if (j.resultCode !== "00") throw new Error(`kmooc ${j.resultCode ?? "응답 형식"} ${j.resultMsg ?? ""}`.trim());
  return { total: num(j.totalCount), rows: j.items ?? [] };
}

export function normalize(r: KmoocRow): CourseDraft | null {
  if (!r.id || !r.name || !r.url) throw new Error("kmooc 행 형식");
  const apply_end = kst(r.enrollment_end);
  return {
    source_id: r.id,
    title: r.name.trim(),
    provider_name: r.org_name ?? null,
    mode: "online",
    cost_type: "free",
    cost_amount: 0,
    apply_start: kst(r.enrollment_start),
    apply_end, // 신청 마감이 지난 강좌는 runSource 의 마감 필터가 버린다
    course_start: kst(r.study_start),
    course_end: kst(r.study_end),
    url: new URL(r.url).toString(),
    image_url: imageUrl(r.course_image),
  };
}

export const kmooc: Source<KmoocRow> = {
  code: "kmooc",
  async fetchList({ fetch, env, today }) {
    const key = env.DATA_GO_KR_KEY;
    if (!key) throw new Error("DATA_GO_KR_KEY 없음");
    return collectPages("kmooc", async (page) =>
      parse(await fetchText(fetch, `https://apis.data.go.kr/B552881/kmooc_v2_0/courseList_v2_0?ServiceKey=${encodeURIComponent(key)}&Page=${page}&Size=${SIZE}`)),
    { key: (r) => r.id, maxPages: 50, keep: (r) => enrollOpen(r, today) });
  },
  normalize,
};
