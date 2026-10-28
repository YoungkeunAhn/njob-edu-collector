// 청년취업사관학교 SeSAC 오프라인 과정 — https://sesac.seoul.kr/sesac/course/offline/courseList.do (SSR). 문서: docs/02-교육소스/01-지자체-공공/서울.md
// robots.txt 전체 허용. 서버 필터 searchRcrtStts=RECRUITING(모집중)으로 받고, 12건씩 cPage 로 넘긴다.
import { load } from "cheerio";
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, kperiod } from "./util";

export interface SesacRec {
  crsSn: string;
  title: string;
  status: string;
  campus: string;
  field: string;
  /** 모집 기간 "2026.10.12 - 2026.11.08" */
  period: string;
}

const BASE = "https://sesac.seoul.kr";
/** 사이트 모집상태 선택지 중 모집중이 아닌 것 */
const CLOSED = new Set(["모집예정", "운영중", "운영대기", "과정종료"]);
const text = (s: string) => s.replace(/\s+/g, " ").trim();

export const listUrl = (page: number) => `${BASE}/sesac/course/offline/courseList.do?searchRcrtStts=RECRUITING&cPage=${page}`;

export function parse(html: string): { total: number | null; recs: SesacRec[] } {
  const $ = load(html);
  if ($(".list-wrap").length === 0) throw new Error("sesac 목록 영역 없음");
  const t = $(".list-top .cnt strong").first().text().replace(/,/g, "").trim();
  const total = /^\d+$/.test(t) ? Number(t) : null;
  const recs = $(".list-wrap li:has(> a[href*='courseDetail.do'])").toArray().map((el) => {
    const c = $(el);
    const href = c.children("a").attr("href") ?? "";
    return {
      crsSn: new URL(href, BASE).searchParams.get("crsSn") ?? "",
      title: text(c.find("p.tit").first().text()),
      status: text(c.find(".tag-list li").first().text()),
      campus: text(c.find(".tag-list li.clr02").first().text()),
      field: text(c.find(".tag-list li.clr03").first().text()),
      period: text(c.find(".data-area dd").first().text()),
    };
  });
  return { total, recs };
}

export function normalize(r: SesacRec): CourseDraft | null {
  if (!/^\d+$/.test(r.crsSn) || !r.title || !r.status) throw new Error("sesac 카드 형식");
  if (r.status !== "모집중") {
    if (CLOSED.has(r.status)) return null;
    throw new Error(`sesac 모르는 상태 ${r.status}`);
  }
  const [applyStart, applyEnd] = kperiod(r.period.replace(/\s+-\s+/, " ~ "));
  return {
    source_id: r.crsSn,
    title: r.title,
    desc: r.field || undefined,
    mode: "offline",
    // 캠퍼스 태그는 자치구 이름("영등포", "중구")
    address: r.campus ? `서울 ${r.campus.endsWith("구") ? r.campus : `${r.campus}구`}` : null,
    apply_start: applyStart,
    apply_end: applyEnd,
    url: `${BASE}/sesac/course/offline/courseDetail.do?crsSn=${r.crsSn}`,
  };
}

export const sesac: Source<SesacRec> = {
  code: "sesac",
  async fetchList({ fetch }) {
    return collectPages("sesac", async (page) => {
      // 2026-10-26 새벽 Cloudflare 530/1016(DNS) 일시 장애. 페이지별 최대 2회 재시도하고 계속 실패하면 기존 행을 보존한다.
      const { total, recs } = parse(await fetchText(fetch, listUrl(page), { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } }, 30_000, 2));
      return { total, rows: recs };
    }, { key: (r) => r.crsSn, maxPages: 20, gapMs: 2000 });
  },
  normalize,
};
