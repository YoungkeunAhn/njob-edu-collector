import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { BUDGET_MS, collectWith, digitalBaeum, LIST_URL, normalize, openList, params, parse, withTimeout } from "../../src/sources/digital-baeum";

const body = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/digital-baeum.json"), "utf8"));

describe("T8 digital-baeum (실응답 2026-10-12, 접수·전국 1페이지 앞 12행)", () => {
  test("12건 파싱, 총건수 4341, 모두 접수 → 12건 정규화", () => {
    const { total, rows } = parse(body);
    expect([total, rows.length]).toEqual([4341, 12]);
    expect(rows.map(normalize).filter(Boolean)).toHaveLength(12);
  });

  test("온라인 행: 지역 없음, 무료, 접수·교육 기간", () => {
    expect(normalize(parse(body).rows[0]!)).toEqual({
      source_id: "E2601034812",
      title: "10월 20일(화) 소상공인 야간 특강_사장님 야간 자율학습 AI 왕기초",
      provider_name: "AI디지털배움터 동작구",
      mode: "online", address: null, cost_type: "free", cost_amount: 0,
      apply_start: "2026-06-01", apply_end: "2026-10-19", course_start: "2026-10-20", course_end: "2026-10-20",
      target: "소상공인", capacity: 50,
      url: "https://www.xn--2z1bw8k1pjz5ccumkb.kr/edc/crse/req/dtl_step1.do?edc_plan_id=E2601034812",
    });
  });

  test("집합 행: 실제교육장(WR)이면 real_edc_plc 주소, 아니면 배움터 주소", () => {
    const r = parse(body).rows[1]!;
    expect(normalize(r)).toMatchObject({ mode: "offline", address: "서울특별시 성동구 왕십리로 222 (사근동)" });
    expect(normalize({ ...r, real_edc_plc_cd: "EQ" })).toMatchObject({ address: "서울특별시 성동구 고산자로 270 (행당동)" });
  });

  test("상태: 접수만 통과, 알려진 마감류는 null, 모르는 상태·교육방식은 throw", () => {
    const r = parse(body).rows[0]!;
    expect(normalize({ ...r, oper_sttus_se_cd: "03" })).toBeNull();
    expect(() => normalize({ ...r, oper_sttus_se_cd: "09" })).toThrow("모르는 상태");
    expect(() => normalize({ ...r, edc_mthd_se_cd: "09" })).toThrow("모르는 교육방식");
    expect(() => normalize({ ...r, rcept_end_dt: "10월 19일" })).toThrow("날짜 형식");
  });

  test("응답 메시지가 SEARCH_OK 가 아니면 throw, source_id 안정", () => {
    expect(() => parse({ message: "허용되지 않는 요청" })).toThrow("허용되지 않는 요청");
    expect(() => parse({ message: "SEARCH_FAIL", RK_TOTAL: 0, RK_RESULT: [] })).toThrow("SEARCH_FAIL");
    expect(parse(body).rows.map((r) => r.edc_plan_id)).toEqual(parse(body).rows.map((r) => r.edc_plan_id));
  });

  test("요청 파라미터는 접수(02)·전국·100건, collectWith 는 총건수까지 페이지를 넘긴다", async () => {
    expect(params(3)).toMatchObject({ sch_oper_sttus_se_cd: "02", sch_area_cd: "", page_no: "3", page_size: "100" });
    vi.useFakeTimers();
    try {
      const rows = parse(body).rows;
      const call = vi.fn(async (p: number) => ({ message: "SEARCH_OK", RK_TOTAL: 12, RK_RESULT: p === 1 ? rows.slice(0, 7) : rows.slice(7) }));
      const got = collectWith(call);
      await vi.runAllTimersAsync();
      expect(await got).toHaveLength(12);
      expect(call.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("Worker 쪽 시간 제한: 응답 없는 호출은 실패, 전체 예산을 넘기면 실패", async () => {
    vi.useFakeTimers();
    try {
      const hang = withTimeout(new Promise(() => {}), 1000, "응답 없음");
      hang.catch(() => {});
      await vi.advanceTimersByTimeAsync(1001);
      await expect(hang).rejects.toThrow("응답 없음");
      let t = 0;
      const rows = parse(body).rows;
      const slow = collectWith(async () => { t += BUDGET_MS + 1; return { message: "SEARCH_OK", RK_TOTAL: 100, RK_RESULT: rows }; }, () => t);
      slow.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(slow).rejects.toThrow("시간 예산 초과");
    } finally {
      vi.useRealTimers();
    }
  });

  test("BROWSER 바인딩이 없으면 throw", async () => {
    await expect(digitalBaeum.fetchList({ fetch, env: {} as never, today: "2026-10-12" })).rejects.toThrow("BROWSER");
  });
});

test("004 T1 목록 페이지: domcontentloaded 로 열고 사이트 함수 준비를 기다린다(networkidle·load 는 60초 넘게 안 닿는다, #2)", async () => {
  const calls: unknown[] = [];
  let ready: () => boolean = () => false;
  await openList({
    goto: async (url, o) => { calls.push(["goto", url, o.waitUntil]); },
    waitForFunction: async (fn, _a, o) => { ready = fn; calls.push(["wait", o.timeout]); },
  });
  expect(calls).toEqual([["goto", LIST_URL, "domcontentloaded"], ["wait", 30_000]]);
  expect(ready()).toBe(false);
  (globalThis as { FnAjax_DivMethodPost?: unknown }).FnAjax_DivMethodPost = () => {};
  expect(ready()).toBe(true);
  delete (globalThis as { FnAjax_DivMethodPost?: unknown }).FnAjax_DivMethodPost;
});

test("004 T1c 첫 열기가 실패하면 열기만 1회 다시, 두 번째도 실패하면 throw(#2)", async () => {
  let n = 0;
  const page = (fails: number) => ({
    goto: async () => { if (n++ < fails) throw new Error("Timeout 30000ms"); },
    waitForFunction: async () => {},
  });
  await openList(page(1));
  expect(n).toBe(2);
  n = 0;
  await expect(openList(page(2))).rejects.toThrow("Timeout");
  expect(n).toBe(2);
});

test("004 T1b넘기는 사이 총건수가 바뀌면 처음부터 1회만 다시 받는다(#2)", async () => {
  vi.useFakeTimers();
  try {
    const rows = parse(body).rows;
    // 1회차: 1페이지 12건 기준 → 2페이지에서 11건으로 바뀜. 2회차: 11건 그대로
    let n = 0;
    const call = vi.fn(async (p: number) => {
      n++;
      const total = n === 1 ? 12 : 11;
      return { message: "SEARCH_OK", RK_TOTAL: total, RK_RESULT: p === 1 ? rows.slice(0, 6) : rows.slice(6, 11) };
    });
    const got = collectWith(call);
    await vi.runAllTimersAsync();
    expect(await got).toHaveLength(11);
    expect(call.mock.calls.map((c) => c[0])).toEqual([1, 2, 1, 2]);
    // 다시 받아도 또 바뀌면 실패(정리가 잘못 지우지 않게)
    let m = 0;
    const flappy = collectWith(async (p: number) => ({ message: "SEARCH_OK", RK_TOTAL: 12 - (m++ % 2), RK_RESULT: p === 1 ? rows.slice(0, 6) : rows.slice(6) }));
    flappy.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(flappy).rejects.toThrow("총건수 변경");
  } finally {
    vi.useRealTimers();
  }
});
