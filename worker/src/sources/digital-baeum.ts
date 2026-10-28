// AI디지털배움터(디지털배움터.kr) — 헤드리스(Browser Rendering). 문서: docs/02-교육소스/01-지자체-공공/전국-AI디지털배움터.md
// 목록 API(POST /api/edc/req/list.do)는 사이트가 붙이는 토큰 헤더가 있어야 한다. 목록 페이지를 브라우저로 연 뒤
// 사이트 함수 FnAjax_DivMethodPost 를 페이지 안에서 불러 JSON 을 받는다(edc_req_list.js 의 fn_search 와 같은 파라미터).
// robots.txt 없음(404). 접수(02)·전국만 요청한다. 강사·연락처·회원 필드는 읽지 않는다(FR-014).
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, kdate, num } from "./util";

const BASE = "https://www.xn--2z1bw8k1pjz5ccumkb.kr";
export const LIST_URL = `${BASE}/edc/crse/req/list.do`;
const SIZE = 100;

export interface BaeumRec {
  edc_plan_id: string;
  edc_plan_nm: string;
  edc_place_nm?: string;
  /** 01 집합, 02 에듀버스, 03 온라인 (공통코드 G0078) */
  edc_mthd_se_cd: string;
  /** 02 접수, 03 마감, 04 개강, 05 종료, 06 폐강 (G0077) */
  oper_sttus_se_cd: string;
  edc_bgn_dt?: string;
  edc_end_dt?: string;
  rcept_bgn_dt?: string;
  rcept_end_dt?: string;
  /** 정원. 실응답은 number */
  edc_nmpr_co?: number | string | null;
  edc_trgter_ty_nm?: string;
  /** WR 이면 real_edc_plc, 아니면 edc_plc_adres 가 실제 교육장 (화면 JS 규칙) */
  real_edc_plc_cd?: string;
  real_edc_plc?: string;
  edc_plc_adres?: string;
}

/** fn_search 와 같은 요청 파라미터. 접수(02)·전국 */
export const params = (pageNo: number) => ({
  supr_cd: "1", edu_type: "E", grp_se_yn: "N", sch_area_cd: "", sch_signgu_cd: "", sch_edc_mthd_se_cd: "",
  sch_edc_bgn_dt: "", sch_edc_end_dt: "", sch_edc_crse_se_cd: "", sch_edc_plan_nm: "", "sch_std_capa_cd[]": [],
  sch_instrt_spts_nm: "", sch_oper_sttus_se_cd: "02", sch_edc_trgter_ty_cd: "", sch_real_edc_plc: "", sch_edc_place_nm: "",
  page_no: String(pageNo), page_size: String(SIZE),
});

export function parse(j: unknown): { total: number | null; rows: BaeumRec[] } {
  const r = j as { message?: string; RK_TOTAL?: unknown; RK_RESULT?: BaeumRec[] } | null;
  if (r?.message !== "SEARCH_OK" || !Array.isArray(r.RK_RESULT)) throw new Error(`digital-baeum 응답 ${r?.message ?? "형식"}`);
  return { total: num(r.RK_TOTAL), rows: r.RK_RESULT };
}

const MODE: Record<string, CourseDraft["mode"]> = { "01": "offline", "02": "offline", "03": "online" };
const CLOSED = new Set(["03", "04", "05", "06"]);

export function normalize(r: BaeumRec): CourseDraft | null {
  if (!/^E\d+$/.test(r.edc_plan_id ?? "") || !r.edc_plan_nm || !r.oper_sttus_se_cd) throw new Error("digital-baeum 행 형식");
  if (r.oper_sttus_se_cd !== "02") {
    if (CLOSED.has(r.oper_sttus_se_cd)) return null; // 모집 중 필터
    throw new Error(`digital-baeum 모르는 상태 ${r.oper_sttus_se_cd}`);
  }
  const mode = MODE[r.edc_mthd_se_cd];
  if (!mode) throw new Error(`digital-baeum 모르는 교육방식 ${r.edc_mthd_se_cd}`);
  const cap = r.edc_nmpr_co === undefined || r.edc_nmpr_co === null || r.edc_nmpr_co === "" ? null : num(r.edc_nmpr_co);
  if (cap === null && r.edc_nmpr_co != null && r.edc_nmpr_co !== "") throw new Error(`digital-baeum 정원 형식 ${String(r.edc_nmpr_co)}`);
  const address = mode === "online" ? null : (r.real_edc_plc_cd === "WR" ? r.real_edc_plc : r.edc_plc_adres)?.trim() || null;
  return {
    source_id: r.edc_plan_id,
    title: r.edc_plan_nm.trim(),
    provider_name: r.edc_place_nm ? `AI디지털배움터 ${r.edc_place_nm}` : "AI디지털배움터",
    mode,
    address,
    cost_type: "free",
    cost_amount: 0,
    apply_start: kdate(r.rcept_bgn_dt),
    apply_end: kdate(r.rcept_end_dt),
    course_start: kdate(r.edc_bgn_dt),
    course_end: kdate(r.edc_end_dt),
    target: r.edc_trgter_ty_nm || null,
    capacity: cap,
    url: `${BASE}/edc/crse/req/dtl_step1.do?edc_plan_id=${encodeURIComponent(r.edc_plan_id)}`,
  };
}

/** Worker 쪽 시간 제한. 브라우저가 멈추면 페이지 안 타이머는 소용이 없다 */
export function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(msg)), ms); })]).finally(() => clearTimeout(t));
}

/**
 * 목록 페이지를 열고 사이트 함수가 준비되기를 기다린다. 페이지가 계속 요청을 보내 networkidle·load 에 닿지 않는다
 * (2026-10-19 엣지 실측: 둘 다 60초 초과, domcontentloaded 4초 + 함수 준비 0.5초) — 이슈 #2.
 * 첫 열기가 가끔 30초를 넘긴다(2026-10-20 03:40 Cron, 같은 날 엣지 재시도는 3/3 성공) — 열기만 1회 다시 한다
 */
export async function openList(page: {
  goto(url: string, o: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  waitForFunction(fn: () => boolean, arg: null, o: { timeout: number }): Promise<unknown>;
}): Promise<void> {
  const go = () => page.goto(LIST_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await go().catch(go);
  await page.waitForFunction(() => typeof (globalThis as { FnAjax_DivMethodPost?: unknown }).FnAjax_DivMethodPost === "function", null, { timeout: 30_000 });
}

/** 전체 수집 예산: Cron 15분 한도 안에서 정리·기록할 시간을 남긴다 (plan: 1회 10분 이내 목표) */
export const BUDGET_MS = 9 * 60_000;
const CALL_MS = 40_000;

/**
 * 페이지 호출 함수를 받아 전체를 모은다(브라우저 없이 테스트하려고 분리). 예산을 넘기면 throw.
 * 5천여 건을 2분 동안 넘기는 사이 접수가 닫혀 총건수가 바뀌는 일이 잦다(2026-10-19 엣지 5335 → 5334) — 처음부터 1회만 다시 받는다(예산은 공유)
 */
export async function collectWith(call: (pageNo: number) => Promise<unknown>, now: () => number = Date.now) {
  const start = now();
  const once = () => collectPages("digital-baeum", async (p) => {
    if (now() - start > BUDGET_MS) throw new Error(`digital-baeum 시간 예산 초과 ${p}페이지`);
    return parse(await withTimeout(call(p), CALL_MS, `digital-baeum ${p}페이지 응답 없음`));
  }, { key: (r) => r.edc_plan_id, maxPages: 100, gapMs: 500 });
  try {
    return await once();
  } catch (e) {
    if (!String(e).includes("총건수 변경")) throw e;
    return once();
  }
}

export const digitalBaeum: Source<BaeumRec> = {
  code: "digital-baeum",
  async fetchList({ env }) {
    if (!env.BROWSER) throw new Error("BROWSER 바인딩 없음");
    // Workers 전용 모듈(cloudflare:)이라 정적 import 하면 Node 테스트에서 이 파일을 못 읽는다
    const { launch } = await import("@cloudflare/playwright");
    // 세션 획득이 멈춰도 Cron 을 붙잡지 않는다. 늦게 열린 세션은 Browser Rendering 의 유휴 종료(기본 60초)에 맡긴다
    const browser = await withTimeout(launch(env.BROWSER), 30_000, "digital-baeum 브라우저 세션 획득 지연");
    try {
      const page = await withTimeout(browser.newPage(), 20_000, "digital-baeum 새 페이지 지연");
      await withTimeout(openList(page), 100_000, "digital-baeum 목록 페이지 응답 없음");
      return await collectWith((pageNo) =>
        page.evaluate(
          // 사이트 함수는 오류 때 콜백을 안 부를 수 있어 30초 뒤 실패로 끝낸다
          (p) => new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error("digital-baeum 목록 호출 시간 초과")), 30_000);
            (globalThis as unknown as { FnAjax_DivMethodPost: (...a: unknown[]) => void }).FnAjax_DivMethodPost(p, false, "/api/edc/req/list.do", null, resolve);
          }),
          params(pageNo),
        ),
      );
    } finally {
      await withTimeout(browser.close(), 10_000, "digital-baeum 브라우저 종료 지연").catch((e) => console.error(String(e)));
    }
  },
  normalize,
};
