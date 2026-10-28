// 대구 평생학습포털 강좌조회 (data.go.kr 15061491, lectureServiceV3/lectureListV3, XML). 2026-10-12 실응답 드라이런 통과
// (3,891건, 정규화 실패 0). 픽스처는 합성 그대로. lec_refer_url 에 "기관명@" 같은 깨진 값이 있다 → 포털로 대체
import { load } from "cheerio";
import { parseCost } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, kdate, kurl, num } from "./util";

export type DaeguRow = Record<string, string>;

const ROWS = 500;

export function parse(xml: string): { total: number | null; rows: DaeguRow[] } {
  const $ = load(xml, { xml: true });
  const code = $("response > header > resultCode").text().trim();
  if (code !== "00") {
    const msg = $("returnAuthMsg").text() || $("resultMsg").text();
    throw new Error(`daegu ${code || $("returnReasonCode").text() || "응답 형식"} ${msg}`.trim());
  }
  const rows = $("items > item").toArray().map((el) => Object.fromEntries($(el).children().toArray().map((c) => [c.tagName, $(c).text().trim()])));
  return { total: num($("totalCount").text().trim()), rows };
}

const safeUrl = (s?: string) => { try { return kurl(s); } catch { return null; } };

export function normalize(r: DaeguRow): CourseDraft | null {
  if (!r.lec_id || !r.ord_cd || !r.lec_title) throw new Error("daegu 행 형식");
  const cost = /^\d+$/.test(r.lec_cost ?? "") ? (r.lec_cost === "0" ? { type: "free" as const, amount: 0 } : { type: "paid" as const, amount: Number(r.lec_cost) }) : parseCost(r.lec_cost);
  // 링크가 비었거나 못 읽는 값("기관명@", "http://인스타 …" 등 실응답에 있음)이면 포털로 보낸다. ID 는 lec_id 라 링크가 바뀌어도 행은 그대로다
  const url = safeUrl(r.lec_refer_url) ?? "https://dle.study.daegu.kr/";
  return {
    source_id: `${r.ord_cd}-${r.lec_id}`,
    title: r.lec_title,
    provider_name: r.ins_name || null,
    mode: /온라인/.test(r.lec_type ?? "") ? "online" : null,
    address: "대구광역시", // 주소 필드가 없다(impl_place 는 강의실명). 시도까지만 매핑
    cost_type: cost.type,
    cost_amount: cost.amount,
    apply_start: kdate(r.impl_reg_start),
    apply_end: kdate(r.impl_reg_finish),
    course_start: kdate(r.impl_start_dt),
    course_end: kdate(r.impl_finish_dt),
    target: r.lec_target_name || null,
    capacity: /^\d+$/.test(r.lec_fixedcnt ?? "") ? Number(r.lec_fixedcnt) : null,
    url,
  };
}

export const daegu: Source<DaeguRow> = {
  code: "daegu",
  async fetchList({ fetch, env }) {
    const key = env.DATA_GO_KR_KEY;
    if (!key) throw new Error("DATA_GO_KR_KEY 없음");
    return collectPages("daegu", async (page) => {
      const q = new URLSearchParams({ ServiceKey: key, pageNo: String(page), numOfRows: String(ROWS) });
      return parse(await fetchText(fetch, `https://apis.data.go.kr/6270000/lectureServiceV3/lectureListV3?${q}`));
    }, { key: (r) => `${r.ord_cd}-${r.lec_id}`, maxPages: 20 });
  },
  normalize,
};
