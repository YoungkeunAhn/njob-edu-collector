// 경기도일자리재단 잡아바 어플라이 지원사업 공고 — https://apply.jobaba.net/bsns/bsnsListView.do (plan 소스별 표 7행). 문서: docs/02-교육소스/01-지자체-공공/경기도.md
// robots.txt `Allow: /`. 목록 페이지 JS(fn_search)가 common.http.ajax 로 POST /bsns/getBsnsList.do 를 부른다. 요청 형식은 사이트 common.js 그대로:
// URL 에 ?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true, 본문은 폼 인코딩 _REQ_JSON_OBJECT_=<JSON>(JSON 본문으로 보내면 오류 HTML). 로그인·쿠키 불필요.
// 사업유형 schBsnsType ["05"](교육훈련)만, statusCd ""(기본: 진행 중인 공고만 온다). pageNo·listBlock 으로 넘기고 paging.totalCount 로 collectPages.
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, decodeEntities, fetchText, kdate } from "./util";

export interface JobabaRec {
  bsnsSeq: number;
  bsnsTitle: string;
  /** 02 진행예정 · 03 진행 · 04 종료 (목록 JS 주석) */
  statusCd: string;
  instttnName?: string;
  /** "경기도", "경기도 화성시" */
  adstrdAdres?: string;
  /** 접수기간 (목록 카드의 "접수기간" 표기) */
  bsnsStartDate?: string;
  bsnsEndDate?: string;
  tag?: string;
}

const BASE = "https://apply.jobaba.net";
export const API_URL = `${BASE}/bsns/getBsnsList.do?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true`;
const BLOCK = 36; // 목록 JS 의 bsnsListBlockCnt
const CLOSED = new Set(["02", "04"]);

export function listBody(page: number): URLSearchParams {
  const q = { statusCd: "", newSortTarget: "01", listBlock: String(BLOCK), pageNo: String(page), schLocation: ["4100000000"], schBsnsType: ["05"] };
  return new URLSearchParams({ _REQ_JSON_OBJECT_: JSON.stringify(q) });
}

export function parse(body: string): { total: number | null; recs: JobabaRec[] } {
  const j = JSON.parse(body) as { responseCode?: string; responseText?: string; data?: { paging?: { totalCount?: unknown }; list?: unknown } };
  if (j.responseCode !== "0" || !Array.isArray(j.data?.list)) throw new Error(`jobaba 응답 ${j.responseCode} ${j.responseText ?? ""}`.trim());
  const t = j.data.paging?.totalCount;
  return { total: typeof t === "number" ? t : null, recs: j.data.list as JobabaRec[] };
}

export function normalize(r: JobabaRec): CourseDraft | null {
  if (!Number.isSafeInteger(r.bsnsSeq) || r.bsnsSeq <= 0 || !r.bsnsTitle || !r.statusCd) throw new Error("jobaba 공고 형식");
  if (r.statusCd !== "03") {
    if (CLOSED.has(r.statusCd)) return null;
    throw new Error(`jobaba 모르는 상태 ${r.statusCd}`);
  }
  const end = kdate(r.bsnsEndDate);
  if (!end) throw new Error(`jobaba 접수마감일 없음 ${r.bsnsSeq}`);
  return {
    source_id: String(r.bsnsSeq),
    title: decodeEntities(r.bsnsTitle).trim(),
    desc: r.tag?.trim() || undefined, // 분류용 짧은 태그(본문은 받지 않는다)
    provider_name: r.instttnName?.trim() || null,
    address: r.adstrdAdres?.trim() || null,
    apply_start: kdate(r.bsnsStartDate),
    apply_end: end,
    url: `${BASE}/bsns/bsnsDetailView.do?bsnsSeq=${r.bsnsSeq}`,
  };
}

export const jobaba: Source<JobabaRec> = {
  code: "jobaba",
  async fetchList({ fetch }) {
    return collectPages("jobaba", async (page) => {
      const { total, recs } = parse(await fetchText(fetch, API_URL, {
        method: "POST",
        headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)", "x-requested-with": "XMLHttpRequest" },
        body: listBody(page),
      }));
      return { total, rows: recs };
    }, { key: (r) => String(r.bsnsSeq), maxPages: 20, gapMs: 2000 });
  },
  normalize,
};
