// 고용24 훈련과정 — 인증키 받기 전 공개 검색 화면(SSR). 문서: docs/02-교육소스/02-국비-내일배움카드/고용24-훈련과정-API.md 9절
// robots.txt 는 /hr/ 검색을 막지 않는다. 키를 받으면 Open API(callOpenApiSvcInfo310L01)로 바꾼다.
import { load } from "cheerio";
import { kstToday } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, kperiod } from "./util";
import { DETAIL_HOST, DETAIL_PATH } from "./work24-detail";

export interface Work24Rec {
  id: string;
  tme: string;
  title: string;
  provider: string;
  period: string;
  address: string;
  status: string;
  /** "할인 금액: 300,000원" = 일반 훈련생 본인부담금 */
  selfPay: string;
  crseTracseSe: string;
  trainstCstmrId: string;
}

/** 검색어. 분류 키워드의 AI 게이트에 걸릴 과정만 받는다 (카테고리-체계와-키워드.md 2절) */
export const KEYWORDS = ["AI", "인공지능", "챗GPT", "바이브코딩"];
const ROWS = 100;
/** 훈련시작일 범위: 오늘 ~ 90일 뒤 (그보다 먼 과정은 대개 아직 모집 전) */
const DAYS = 90;
const MAX_PAGES = 40;

/** 모집중이 아닌 것으로 알려진 상태값 */
const CLOSED = new Set(["모집마감", "모집예정", "마감", "정원마감", "접수마감"]);

const ymd = (d: string) => d.replaceAll("-", "");

export function searchUrl(keyword: string, today: string, page: number): string {
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + DAYS * 86400_000).toISOString().slice(0, 10);
  const p = new URLSearchParams({
    keyword, startDate: ymd(today), endDate: ymd(end), pageIndex: String(page), pageRow: String(ROWS),
    orderKey: "2", orderBy: "ASC", action: "trnnCrsInfPost.do", pageId: "2",
  });
  return `https://www.work24.go.kr/hr/a/a/1100/trnnCrsInf.do?${p}`;
}

const text = (s: string) => s.replace(/\s+/g, " ").trim();

export function parse(html: string): { total: number | null; recs: Work24Rec[] } {
  const $ = load(html);
  // 총건수 영역이 없으면(점검 페이지 등) null → 수집 실패. "총 0건" 은 정상 0건
  const t = $("#totalCount span").first().text().replace(/,/g, "").trim();
  const total = /^\d+$/.test(t) ? Number(t) : null;
  const recs = $("div.list[data-tracseid]").toArray().map((el) => {
    const c = $(el);
    const a = c.find("h3 a[onclick*='fn_viewTracseInfo']").first();
    const args = /fn_viewTracseInfo\('([^']*)','([^']*)','([^']*)','([^']*)'/.exec(a.attr("onclick") ?? "") ?? [];
    return {
      id: c.attr("data-tracseid")!,
      tme: c.attr("data-tracsetme")!,
      title: text(a.text()),
      provider: text(c.find(".company_title > span > a").first().text()),
      period: text(c.find(".info_area .time").first().text()),
      address: text(c.find(".info_area .site p").first().text()),
      status: text(c.find(".right_btn_area span.t3_sb").first().text()),
      selfPay: c.find(".right_btn_area .mb8[aria-label]").first().attr("aria-label") ?? "",
      crseTracseSe: args[3] ?? "",
      trainstCstmrId: args[4] ?? "",
    };
  });
  return { total, recs };
}

export function normalize(r: Work24Rec): CourseDraft | null {
  if (!r.id || !r.tme || !r.title || !r.status) throw new Error("work24 카드 형식");
  if (r.status !== "모집중") {
    if (CLOSED.has(r.status)) return null; // 모집 중 필터
    throw new Error(`work24 모르는 상태 ${r.status}`); // 처음 보는 상태값을 마감으로 오인하지 않는다
  }
  const [start, end] = kperiod(r.period);
  const pay = /([\d,]+)\s*원/.exec(r.selfPay);
  const q = new URLSearchParams({ tracseId: r.id, tracseTme: r.tme, crseTracseSe: r.crseTracseSe, trainstCstmrId: r.trainstCstmrId });
  return {
    source_id: `${r.id}-${r.tme}`,
    title: r.title,
    provider_name: r.provider || null,
    address: r.address.replace(/\(.*$/, "").trim() || null,
    cost_type: "card",
    cost_amount: pay ? Number(pay[1]!.replace(/,/g, "")) : null,
    // 목록에 접수기간이 없어 훈련시작일을 마감일로 쓴다 (plan 소스별 표 1행)
    apply_end: start,
    course_start: start,
    course_end: end,
    // 옛 hrd.work24 PCOBO0500P.do 는 "존재하지 않는 페이지". 사이트는 selectTracseDetlPost.do 로 POST 하지만 같은 화면을 GET 으로도 연다(C0061 국민내일배움카드)
    url: `https://${DETAIL_HOST}${DETAIL_PATH}?${q}`,
  };
}

export const work24: Source<Work24Rec> = {
  code: "work24",
  async fetchList({ fetch, today }) {
    const seen = new Map<string, Work24Rec>();
    for (const [i, kw] of KEYWORDS.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2000));
      const recs = await collectPages(`work24 ${kw}`, async (page) => {
        const { total, recs } = parse(await fetchText(fetch, searchUrl(kw, today || kstToday(), page), { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } }, 90_000)); // 100건 페이지는 약 6MB라 느리다
        return { total, rows: recs };
      }, { key: (r) => `${r.id}-${r.tme}`, maxPages: MAX_PAGES, gapMs: 2000 });
      for (const r of recs) seen.set(`${r.id}-${r.tme}`, r);
    }
    return [...seen.values()];
  },
  normalize,
};

