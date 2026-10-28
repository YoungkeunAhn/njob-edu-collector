// 온통청년 청년정책 (youthcenter.go.kr /go/ythip/getPlcy). 2026-10-26 실응답 확인:
// result.youthPolicyList, pageSize=1000. 신청기간은 여러 구간을 리터럴 \\N으로 구분하기도 한다.
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, kdate, kperiod, kurl, num } from "./util";

export interface YouthRow {
  plcyNo: string;
  plcyNm: string;
  plcyExplnCn?: string;
  plcyKywdNm?: string;
  sprvsnInstCdNm?: string;
  operInstCdNm?: string;
  /** "20261001 ~ 20261031". 여러 기간은 \\N 구분, 상시면 비어 있다 */
  aplyYmd?: string;
  bizPrdBgngYmd?: string;
  bizPrdEndYmd?: string;
  /** 법정동 시군구 5자리, 쉼표 구분 */
  zipCd?: string;
  aplyUrlAddr?: string;
  refUrlAddr1?: string;
  sprtTrgtMinAge?: string;
  sprtTrgtMaxAge?: string;
}

// 실서버가 1000건을 지원한다. 전체 약 3600건을 4회 요청으로 받아 원천 부담·중간 오류를 줄인다.
const SIZE = 1000;

function applicationPeriod(value: unknown): [string | null, string | null] {
  if (typeof value === "string" && /\\N|\r?\n/.test(value)) throw new Error("youthcenter 기간 형식: 선택하지 못한 복수 신청기간");
  return kperiod(value);
}

/** 여러 신청기간을 하나로 합치면 접수 공백에도 모집중으로 노출된다. 수집일에 맞는 한 구간만 선택한다. */
export function selectApplicationPeriod(r: YouthRow, today: string): YouthRow {
  if (typeof r.aplyYmd !== "string" || !/\\N|\r?\n/.test(r.aplyYmd)) return r;
  try {
    const periods = r.aplyYmd.split(/\\N|\r?\n/).map((s) => {
      const [start, end] = kperiod(s);
      if (!start || !end || start > end) throw new Error("신청기간 형식");
      return { start, end };
    }).sort((a, b) => a.start.localeCompare(b.start));
    const selected = periods.find((p) => p.start <= today && today <= p.end)
      ?? periods.find((p) => p.start > today)
      ?? periods.reduce((last, p) => p.end > last.end ? p : last);
    return { ...r, aplyYmd: `${selected.start} ~ ${selected.end}` };
  } catch {
    return r; // 못 읽는 구간은 남겨 normalize 에서 실패·정리 건너뜀으로 처리한다.
  }
}

export function parse(body: string): { total: number | null; rows: YouthRow[] } {
  const j = JSON.parse(body) as { resultCode?: number | string; resultMessage?: string; errorCode?: string; errorMsg?: string; result?: { pagging?: { totCount?: number }; youthPolicyList?: YouthRow[] } };
  if (j.errorCode) throw new Error(`youthcenter ${j.errorCode} ${j.errorMsg ?? ""}`.trim());
  if (!j.result || (j.resultCode !== undefined && Number(j.resultCode) !== 200)) throw new Error(`youthcenter ${j.resultCode ?? "응답 형식"} ${j.resultMessage ?? ""}`.trim());
  return { total: num(j.result.pagging?.totCount), rows: j.result.youthPolicyList ?? [] };
}


/** 신청기간 중인 정책만 (plan 소스별 표 16행). 신청 시작 전이면 뺀다. 마감은 runSource 가 거른다 */
export const applyOpen = (r: YouthRow, today: string) => {
  try {
    const [s] = applicationPeriod(r.aplyYmd);
    return !s || s <= today;
  } catch {
    return true; // 못 읽는 기간은 남겨 normalize 에서 throw 되게 한다(정리 건너뜀)
  }
};

export function normalize(r: YouthRow): CourseDraft | null {
  if (!r.plcyNo || !r.plcyNm) throw new Error("youthcenter 행 형식");
  // 실응답의 "전화문의"는 링크 없음. 그 밖의 알 수 없는 값은 기존처럼 실패시킨다.
  const link = kurl(r.aplyUrlAddr?.trim() === "전화문의" ? null : r.aplyUrlAddr) ?? kurl(r.refUrlAddr1);
  if (!link) return null; // 원문 링크가 없으면 보여줄 수 없다
  const [aplyStart, aplyEnd] = applicationPeriod(r.aplyYmd);
  const zips = (r.zipCd ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s));
  const sidos = new Set(zips.map((z) => z.slice(0, 2)));
  const age = r.sprtTrgtMinAge || r.sprtTrgtMaxAge ? `만 ${r.sprtTrgtMinAge ?? ""}~${r.sprtTrgtMaxAge ?? ""}세` : null;
  return {
    source_id: r.plcyNo,
    title: r.plcyNm.trim(),
    desc: `${r.plcyKywdNm ?? ""} ${r.plcyExplnCn ?? ""}`,
    provider_name: r.operInstCdNm || r.sprvsnInstCdNm || null,
    // 시군구 1곳이면 그 시군구, 한 시도 안 여러 곳이면 시도, 여러 시도면 지역 없음(전국)
    region: zips.length === 1 ? { sido: zips[0]!.slice(0, 2), sigungu: zips[0]! } : sidos.size === 1 ? { sido: [...sidos][0]!, sigungu: null } : null,
    apply_start: aplyStart,
    apply_end: aplyEnd,
    course_start: kdate(r.bizPrdBgngYmd),
    course_end: kdate(r.bizPrdEndYmd),
    target: age,
    url: link,
  };
}

export const youthcenter: Source<YouthRow> = {
  code: "youthcenter",
  async fetchList({ fetch, env, today }) {
    const key = env.YOUTHCENTER_API_KEY;
    if (!key) throw new Error("YOUTHCENTER_API_KEY 없음");
    return collectPages("youthcenter", async (page) => {
      const q = new URLSearchParams({ apiKeyNm: key, pageNum: String(page), pageSize: String(SIZE), pageType: "1", rtnType: "json" });
      const result = parse(await fetchText(fetch, `https://www.youthcenter.go.kr/go/ythip/getPlcy?${q}`, {}, 30_000, 2));
      return { ...result, rows: result.rows.map((r) => selectApplicationPeriod(r, today)) };
    }, { key: (r) => r.plcyNo, maxPages: 100, keep: (r) => applyOpen(r, today) });
  },
  normalize,
};
