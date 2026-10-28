// 서울시평생학습포털 시민대학 강좌 — https://sll.seoul.go.kr (plan 소스별 표 5행). 문서: docs/02-교육소스/03-평생교육-온라인/시도-평생학습포털.md
// robots.txt 는 Googlebot 의 /search/ 두 경로만 막는다. 목록 페이지(doListView.do)는 빈 틀이고, 페이지 JS(fncList)가
// POST doListSiminCourse.do 로 전체 목록 JSON 을 한 번에 받는다(페이지·총건수 필드 없음). POST 에는 페이지 <meta name="_csrf"> 값을
// X-CSRF-TOKEN 헤더로 붙여야 한다(없으면 403). 서버 필터 sc_status=ing(모집중)으로 받는다.
import { parseCost } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { decodeEntities, kdate, num, pause } from "./util";

export interface SllRec {
  course_id: string;
  class_no: string;
  course_nm: string;
  /** ING 모집중 · BEFORE 모집예정 · FULL 정원마감(대기자) · PAST 모집완료 (목록 JS 의 분기) */
  status: string;
  /** 캠퍼스 코드 M·DC·MD·O·R·RG … */
  simin_yn: string;
  /** "0" 오프라인 · "1" 온라인 · "2" 실시간온라인 */
  course_gubun: string;
  course_place?: string;
  category_nm2?: string;
  tag_list?: string;
  fee?: string;
  capacity?: string;
  course_str_dt?: string;
  course_end_dt?: string;
  course_request_str_dt?: string;
  course_request_end_dt?: string;
}

const BASE = "https://sll.seoul.go.kr";
export const PAGE_URL = `${BASE}/lms/simin_course/courseRequest/doListView.do?main_se=ssu&simin_yn=M%2CDC%2CMD%2CO%2CR%2CRG&mnid=202501604868`;
export const API_URL = `${BASE}/lms/simin_course/courseRequest/doListSiminCourse.do`;
const UA = "Mozilla/5.0 (compatible; njob-edu-bot)";
const CLOSED = new Set(["BEFORE", "FULL", "PAST"]);
const MODE: Record<string, "online" | "offline"> = { "0": "offline", "1": "online", "2": "online" };

/** 목록 JS(fncList)가 보내는 폼 그대로, 상태만 모집중 */
export function listBody(): URLSearchParams {
  return new URLSearchParams({
    simin_yn: "M,DC,MD,O,R,RG", menu_se: "", course_category_id: "", course_gubun: "", fee: "", sc_status: "ing",
    course_str_dt: "", course_end_dt: "", weekday: "", keyword: "", keyword_status: "", course_nm: "", sorting: "",
  });
}

export function parse(body: string): SllRec[] {
  const list = (JSON.parse(body) as { simin_course_list?: unknown }).simin_course_list;
  if (!Array.isArray(list)) throw new Error("seoul-lifelong simin_course_list 없음");
  return list as SllRec[];
}

export function normalize(r: SllRec): CourseDraft | null {
  if (!r.course_id || !/^\d+$/.test(r.class_no ?? "") || !r.course_nm || !r.status) throw new Error("seoul-lifelong 행 형식");
  if (r.status !== "ING") {
    if (CLOSED.has(r.status)) return null;
    throw new Error(`seoul-lifelong 모르는 상태 ${r.status}`);
  }
  let mode = MODE[r.course_gubun];
  if (!mode) throw new Error(`seoul-lifelong 모르는 강의구분 ${r.course_gubun}`);
  const place = (r.course_place ?? "").trim();
  if (/온라인|zoom/i.test(place)) mode = "online"; // 오프라인 구분인데 장소가 "실시간 온라인(ZOOM)"인 강좌
  const fee = (r.fee ?? "").trim();
  const cost = parseCost(fee);
  if (fee && !cost.type) throw new Error(`seoul-lifelong 비용 형식 ${fee}`);
  const cap = (r.capacity ?? "").trim();
  if (cap && num(cap) === null) throw new Error(`seoul-lifelong 정원 형식 ${cap}`);
  const q = new URLSearchParams({ main_se: "ssu", course_id: r.course_id, class_no: r.class_no, course_gubun: r.course_gubun, mnid: "202501604868", simin_yn: r.simin_yn });
  return {
    source_id: `${r.course_id}_${r.class_no}`,
    title: decodeEntities(r.course_nm).trim(),
    desc: `${r.category_nm2 ?? ""} ${r.tag_list ?? ""}`.trim() || undefined,
    provider_name: "서울시민대학",
    mode,
    address: mode === "offline" ? "서울특별시" : null,
    ...(fee ? { cost_type: cost.type, cost_amount: cost.amount } : {}),
    capacity: num(cap) || null, // 0·빈 값은 정원 표기 없음
    apply_start: kdate(r.course_request_str_dt),
    apply_end: kdate(r.course_request_end_dt),
    course_start: kdate(r.course_str_dt),
    course_end: kdate(r.course_end_dt),
    // 목록 JS fncRequest: 온라인(course_gubun 1)만 doDetailInfo2.do
    url: `${BASE}/lms/simin_course/courseRequest/${r.course_gubun === "1" ? "doDetailInfo2.do" : "doDetailInfo.do"}?${q}`,
  };
}

export const seoulLifelong: Source<SllRec> = {
  code: "seoul-lifelong",
  prune: false, // 응답에 총건수가 없어 부분 응답을 가려낼 수 없다

  async fetchList({ fetch }) {
    const page = await fetch(PAGE_URL, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (!page.ok) throw new Error(`HTTP ${page.status} sll.seoul.go.kr`);
    const token = /<meta name="_csrf" content="([^"]+)"/.exec(await page.text())?.[1];
    if (!token) throw new Error("seoul-lifelong _csrf 없음");
    const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await pause(2000);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "user-agent": UA, "x-csrf-token": token, "x-requested-with": "XMLHttpRequest", ...(cookie ? { cookie } : {}) },
      body: listBody(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sll.seoul.go.kr`);
    // ponytail: 응답에 총건수가 없어 부분 응답은 못 잡는다. 빈 목록·급감은 수집기의 건수 급감 검사에 맡긴다
    return parse(await res.text());
  },
  normalize,
};
