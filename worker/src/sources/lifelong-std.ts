// 전국평생학습강좌표준데이터 (data.go.kr 15013110). 2026-10-12 실응답 확인: header·body 가 최상위(response 감싸개 없음), numOfRows=1000 가능.
// 고유 ID 가 없다: 28,615건 중 완전히 같은 행 17건, 내용이 전부 빈 행 18건(링크가 없어 normalize 가 버린다), 같은 기관·강좌명·시작일에 시간·장소만 다른 행 수백 건.
// 그래서 행을 하나씩 구분할 수 없어 "사라진 행" 정리를 끈다(prune=false). 만료 삭제로만 지워진다
import { parseCost, parseKDate } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, fetchText, kdate, kurl, num } from "./util";

export interface LifelongRow {
  lctreNm: string;
  operInstitutionNm?: string;
  insttCode?: string;
  edcStartTime?: string;
  operDay?: string;
  instrctrNm?: string;
  edcStartDay?: string;
  edcEndDay?: string;
  lctreCo?: string;
  edcTrgetType?: string;
  edcMthType?: string;
  edcPlace?: string;
  psncpa?: string;
  lctreCost?: string;
  edcRdnmadr?: string;
  rceptStartDate?: string;
  rceptEndDate?: string;
  homepageUrl?: string;
}

const ROWS = 1000;

export function parse(body: string): { total: number | null; rows: LifelongRow[] } {
  const j = JSON.parse(body) as { header?: { resultCode?: string; resultMsg?: string }; body?: { totalCount?: number | string; items?: LifelongRow[] | { item?: LifelongRow[] | LifelongRow } | "" } };
  const h = j.header;
  if (h?.resultCode === "03") return { total: 0, rows: [] }; // NODATA_ERROR
  if (h?.resultCode !== "00") throw new Error(`lifelong-std ${h?.resultCode ?? "응답 형식"} ${h?.resultMsg ?? ""}`.trim());
  const items = j.body?.items;
  const rows = Array.isArray(items) ? items : !items ? [] : Array.isArray(items.item) ? items.item : items.item ? [items.item] : [];
  return { total: num(j.body?.totalCount), rows };
}

/** 원천에 고유 ID 가 없다. 제공기관 코드·운영기관·강좌명·시작일(필수, 없으면 throw)에 시간·요일·장소·강사를 더해 만든다.
 *  그래도 같은 값이면 같은 강좌로 보고 하나만 남는다(런타임이 source_id 로 합친다) */
export function lifelongId(r: LifelongRow): string {
  const must = [r.insttCode, r.operInstitutionNm, r.lctreNm, r.edcStartDay].map((s) => (s ?? "").trim());
  if (must.some((s) => !s)) throw new Error("lifelong-std 키 필드 누락");
  return [...must, ...[r.edcStartTime, r.operDay, r.edcPlace, r.instrctrNm].map((s) => (s ?? "").trim())].join("|");
}

const MODE: Record<string, CourseDraft["mode"]> = { 온라인: "online", 오프라인: "offline", 혼합: "blended", "온라인+오프라인": "blended" };

export function normalize(r: LifelongRow): CourseDraft | null {
  const url = kurl(r.homepageUrl);
  if (!url) return null; // 원문 링크가 없으면 보여줄 수 없다
  const cost = r.lctreCost === "0" ? { type: "free" as const, amount: 0 } : /^\d+$/.test(r.lctreCost ?? "") ? { type: "paid" as const, amount: Number(r.lctreCost) } : parseCost(r.lctreCost);
  const start = kdate(r.edcStartDay);
  return {
    source_id: lifelongId(r),
    title: r.lctreNm.trim(),
    desc: r.lctreCo ?? "",
    provider_name: r.operInstitutionNm ?? null,
    mode: MODE[r.edcMthType ?? ""] ?? null,
    address: r.edcRdnmadr ?? null,
    cost_type: cost.type,
    cost_amount: cost.amount,
    apply_start: kdate(r.rceptStartDate),
    apply_end: kdate(r.rceptEndDate),
    course_start: start,
    course_end: kdate(r.edcEndDay),
    target: r.edcTrgetType ?? null,
    capacity: /^\d+$/.test(r.psncpa ?? "") ? Number(r.psncpa) : null,
    url,
  };
}

export const lifelongStd: Source<LifelongRow> = {
  code: "lifelong-std",
  prune: false,
  async fetchList({ fetch, env, today }) {
    const key = env.DATA_GO_KR_KEY;
    if (!key) throw new Error("DATA_GO_KR_KEY 없음");
    let pos = 0;
    return collectPages("lifelong-std", async (page) => {
      const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: String(ROWS), type: "json" });
      return parse(await fetchText(fetch, `https://api.data.go.kr/openapi/tn_pubr_public_lftm_lrn_lctre_api?${q}`));
    }, {
      key: () => String(pos++), // 같은 행이 여러 번 오므로 건수는 위치로 센다(반복 페이지 감지는 못 한다, prune=false 라 지우지는 않는다)
      maxPages: 1000,
      gapMs: 500,
      // 전국 수십만 건이라 메모리를 아끼려고 접수 마감(없으면 시작일)이 지난 행은 여기서 버린다
      keep: (r) => {
        // 마감일 값이 있으면 그것만 본다. 못 읽는 날짜는 남겨 normalize 에서 throw 되게 한다(정리 건너뜀)
        const raw = r.rceptEndDate?.trim() ? r.rceptEndDate : r.edcStartDay;
        const d = parseKDate(raw);
        return !d || d >= today;
      },
    });
  },
  normalize,
};
