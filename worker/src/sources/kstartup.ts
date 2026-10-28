// K-Startup 사업공고 (data.go.kr 15125364, getAnnouncementInformation01). 2026-10-12 실응답 확인:
// 행은 data[], 날짜는 yyyyMMdd, cond[] 필터가 먹고 필터 건수는 matchCount (totalCount 는 필터 전 전체)
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, kdate, kurl, num } from "./util";

export interface KstartupRow {
  pbanc_sn: string | number;
  biz_pbanc_nm: string;
  pbanc_ntrp_nm?: string;
  sprv_inst?: string;
  pbanc_rcpt_bgng_dt?: string;
  pbanc_rcpt_end_dt?: string;
  supt_regin?: string;
  aply_trgt?: string;
  rcrt_prgs_yn?: string;
  detl_pg_url?: string;
  supt_biz_clsfc?: string;
  pbanc_ctnt?: string;
}

const PER = 500;

export function parse(body: string): { total: number | null; rows: KstartupRow[] } {
  const j = JSON.parse(body) as { matchCount?: number; data?: KstartupRow[] | { data?: KstartupRow[] } };
  const rows = Array.isArray(j.data) ? j.data : j.data?.data;
  if (!rows) throw new Error("kstartup 응답 형식");
  return { total: num(j.matchCount), rows };
}

export function normalize(r: KstartupRow): CourseDraft | null {
  if (!(typeof r.pbanc_sn === "number" || (typeof r.pbanc_sn === "string" && r.pbanc_sn !== "")) || !r.biz_pbanc_nm) throw new Error("kstartup 행 형식");
  if (r.rcrt_prgs_yn === "N") return null; // 모집 중 필터
  if (r.rcrt_prgs_yn !== "Y") throw new Error(`kstartup 모르는 모집 상태 ${r.rcrt_prgs_yn}`); // 마감으로 오인하지 않는다
  // "www.k-startup.go.kr/..." 처럼 스킴 없이 오거나 "/web/..." 상대 경로로 온다
  const url = kurl(r.detl_pg_url, "https://www.k-startup.go.kr");
  if (!url) return null; // 원문 링크 없는 공고는 보여줄 수 없다
  return {
    source_id: String(r.pbanc_sn),
    title: r.biz_pbanc_nm.trim(),
    desc: `${r.supt_biz_clsfc ?? ""} ${r.pbanc_ctnt ?? ""}`,
    provider_name: r.pbanc_ntrp_nm || r.sprv_inst || null,
    // 지역이 "전국" 이거나 시도명만 있다. 시도명이면 시도까지만 매핑된다
    address: r.supt_regin && r.supt_regin !== "전국" ? r.supt_regin : null,
    mode: r.supt_regin === "전국" ? "online" : null,
    apply_start: kdate(r.pbanc_rcpt_bgng_dt),
    apply_end: kdate(r.pbanc_rcpt_end_dt),
    target: r.aply_trgt ?? null,
    url,
  };
}

export const kstartup: Source<KstartupRow> = {
  code: "kstartup",
  async fetchList({ fetch, env }) {
    const key = env.DATA_GO_KR_KEY;
    if (!key) throw new Error("DATA_GO_KR_KEY 없음");
    return collectPages("kstartup", async (page) => {
      const q = new URLSearchParams({ serviceKey: key, page: String(page), perPage: String(PER), returnType: "json", "cond[rcrt_prgs_yn::EQ]": "Y" });
      return parse(await fetchText(fetch, `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?${q}`));
    }, { key: (r) => String(r.pbanc_sn), maxPages: 20 });
  },
  normalize,
};
