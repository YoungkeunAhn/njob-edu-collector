// 인증키가 필요한 소스 5개. K-MOOC 는 원본 서버 실응답, 나머지는 공식 문서 필드로 만든 합성 픽스처(🟡)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as daegu from "../../src/sources/daegu";
import * as kmooc from "../../src/sources/kmooc";
import * as kstartup from "../../src/sources/kstartup";
import * as lifelong from "../../src/sources/lifelong-std";
import * as youth from "../../src/sources/youthcenter";

const fx = (f: string) => readFileSync(join(import.meta.dirname, "fixtures", f), "utf8");
const noKey = { fetch: (async () => new Response("{}")) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" };

describe("T6 kmooc (원본 서버 실응답 2026-10-12)", () => {
  const { total, rows } = kmooc.parse(fx("kmooc.json"));
  test("8건 파싱, 첫 행 매핑(epoch → KST 날짜)", () => {
    expect([total, rows.length]).toEqual([8803, 8]);
    expect(kmooc.normalize(rows[0]!)).toEqual({
      source_id: "21390", title: "문화와 생활 속 청렴", provider_name: "국민권익위원회 국가청렴권익교육원",
      mode: "online", cost_type: "free", cost_amount: 0,
      apply_start: "2026-10-12", apply_end: "2026-10-23", course_start: "2026-10-12", course_end: "2026-10-23",
      url: "https://www.kmooc.kr/view/course/detail/21390",
      image_url: "https://lms.kmooc.kr/course/thumb.php?id=21390",
    });
  });
  test("epoch 는 KST 날짜로 바꾼다 (UTC 15:30 = 다음 날 KST 00:30)", () => {
    const e = String(Date.UTC(2026, 9, 12, 15, 30) / 1000);
    expect(kmooc.normalize({ ...rows[0]!, enrollment_end: e })!.apply_end).toBe("2026-10-13");
  });
  test("resultCode 가 00 이 아니면 throw, 키 없으면 throw", async () => {
    expect(() => kmooc.parse('{"resultCode":"20","resultMsg":"비공개"}')).toThrow("20");
    await expect(kmooc.kmooc.fetchList(noKey)).rejects.toThrow("DATA_GO_KR_KEY");
  });
});

describe("T6 kstartup", () => {
  const { total, rows } = kstartup.parse(fx("kstartup.json"));
  test("3건 파싱, 모집중(Y) 2건, 마감(N) 버림", () => {
    expect([total, rows.length]).toEqual([3, 3]); // 총건수는 필터 건수 matchCount (totalCount 는 전체)
    expect(rows.map(kstartup.normalize).filter(Boolean)).toHaveLength(2);
  });
  test("첫 행 매핑: 스킴 없는 URL 에 https, &amp; 풀기, 두 날짜 형식", () => {
    expect(kstartup.normalize(rows[0]!)).toMatchObject({
      source_id: "174001", provider_name: "창업진흥원", address: "서울특별시", apply_start: "2026-10-01", apply_end: "2026-10-31",
      url: "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=174001",
    });
    expect(kstartup.normalize(rows[1]!)).toMatchObject({ address: null, mode: "online", apply_end: "2026-11-15" });
  });
  test("행 경로가 data[] 든 data.data[] 든 읽고, 둘 다 없으면 throw", () => {
    expect(kstartup.parse('{"data":{"data":[{"pbanc_sn":1}]}}').rows).toHaveLength(1);
    expect(() => kstartup.parse('{"currentCount":0}')).toThrow("응답 형식");
  });
});

describe("T6 lifelong-std", () => {
  const { total, rows } = lifelong.parse(fx("lifelong-std.json"));
  test("3건 파싱, 링크 없는 행 버림", () => {
    expect([total, rows.length]).toEqual([3, 3]);
    expect(rows.map(lifelong.normalize).filter(Boolean)).toHaveLength(2);
  });
  test("첫 행 매핑, source_id 는 같은 행이면 같은 값", () => {
    const d = lifelong.normalize(rows[0]!)!;
    expect(d).toMatchObject({
      title: "[26년 4분기] 생성형 AI 활용 블로그 글쓰기", provider_name: "수원시 평생학습관", mode: "offline",
      address: "경기도 수원시 팔달구 월드컵로 381번길 2(우만동 582)", cost_type: "paid", cost_amount: 20000,
      apply_start: "2026-10-05", apply_end: "2026-10-30", course_start: "2026-11-02", course_end: "2026-12-21", capacity: 15,
      url: "http://learning.suwon.go.kr/",
    });
    expect(lifelong.normalize(lifelong.parse(fx("lifelong-std.json")).rows[0]!)!.source_id).toBe(d.source_id);
    expect(lifelong.normalize(rows[1]!)).toMatchObject({ mode: "online", cost_type: "free" });
  });
  test("NODATA(03)는 빈 목록, 다른 코드는 throw", () => {
    expect(lifelong.parse('{"header":{"resultCode":"03"}}').rows).toEqual([]);
    expect(() => lifelong.parse('{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}')).toThrow("30");
  });
  test("fetchList 는 접수 마감(없으면 시작일)이 지난 행을 미리 버린다", async () => {
    const body = JSON.stringify({ header: { resultCode: "00" }, body: { totalCount: 3, items: [{ lctreNm: "x", rceptEndDate: "10월 말", insttCode: "1", operInstitutionNm: "o", edcStartDay: "2026-10-01" }, { lctreNm: "a", rceptEndDate: "2026-10-11", insttCode: "1", operInstitutionNm: "o", edcStartDay: "2026-11-01" }, { lctreNm: "b", rceptEndDate: "2026-10-12", insttCode: "1", operInstitutionNm: "o", edcStartDay: "2026-11-01" }] } });
    const got = await lifelong.lifelongStd.fetchList({ ...noKey, env: { DATA_GO_KR_KEY: "k" } as never, fetch: (async () => new Response(body)) as unknown as typeof fetch });
    expect(got.map((r) => r.lctreNm)).toEqual(["x", "b"]); // 못 읽는 마감일은 남겨 normalize 에서 throw
  });
  test("실응답처럼 같은 행·빈 행이 섞여도 수집은 끝나고, 빈 행은 버리고, 시간만 다른 행은 ID 가 다르다", async () => {
    const a = { lctreNm: "AI 기초", insttCode: "1", operInstitutionNm: "o", edcStartDay: "2026-11-01", edcStartTime: "10:00", homepageUrl: "https://ex.com" };
    const blank = { lctreNm: "", insttCode: "1", operInstitutionNm: "", edcStartDay: "" };
    const body = JSON.stringify({ header: { resultCode: "00" }, body: { totalCount: 4, items: [a, a, blank, { ...a, edcStartTime: "19:00" }] } });
    const got = await lifelong.lifelongStd.fetchList({ ...noKey, env: { DATA_GO_KR_KEY: "k" } as never, fetch: (async () => new Response(body)) as unknown as typeof fetch });
    expect(got).toHaveLength(4);
    expect(lifelong.normalize(blank)).toBeNull();
    expect(lifelong.lifelongId(a)).not.toBe(lifelong.lifelongId({ ...a, edcStartTime: "19:00" }));
    expect(lifelong.lifelongStd.prune).toBe(false);
  });
});

describe("T6 daegu (🟡 합성 XML)", () => {
  const { total, rows } = daegu.parse(fx("daegu.xml"));
  test("2건 파싱, 첫 행 매핑", () => {
    expect([total, rows.length]).toEqual([2, 2]);
    expect(daegu.normalize(rows[0]!)).toMatchObject({
      source_id: "DG01-L2026001", title: "AI 영상 만들기 원데이 특강", provider_name: "대구광역시 평생학습진흥원",
      address: "대구광역시", cost_type: "free", cost_amount: 0, apply_end: "2026-10-25", course_start: "2026-11-01", capacity: 20,
      url: "https://dle.study.daegu.kr/lecture/L2026001",
    });
    expect(daegu.normalize(rows[1]!)).toMatchObject({ cost_type: "paid", cost_amount: 30000, url: "https://dle.study.daegu.kr/" });
    for (const bad of ["한국인성예절교육원@", "http://인스타 top33233"]) expect(daegu.normalize({ ...rows[0]!, lec_refer_url: bad })!.url).toBe("https://dle.study.daegu.kr/"); // 실응답 값
  });
  test("게이트웨이 오류(키 미등록)는 throw", () => {
    const err = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    expect(() => daegu.parse(err)).toThrow("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
  });
});

describe("T6 youthcenter (🟡 합성)", () => {
  const { total, rows } = youth.parse(fx("youthcenter.json"));
  test("3건 파싱, 링크 없는 행 버림", () => {
    expect([total, rows.length]).toEqual([3, 3]);
    expect(rows.map(youth.normalize).filter(Boolean)).toHaveLength(2);
  });
  test("첫 행 매핑: 신청기간 분리, 시군구 1곳이면 그 지역", () => {
    expect(youth.normalize(rows[0]!)).toMatchObject({
      source_id: "20261012000001", provider_name: "서울청년센터", region: { sido: "11", sigungu: "11110" },
      apply_start: "2026-10-01", apply_end: "2026-10-31", course_start: "2026-11-01", target: "만 19~39세",
      url: "https://youth.seoul.go.kr/apply/1",
    });
    expect(youth.normalize(rows[1]!)).toMatchObject({ region: { sido: "41", sigungu: null }, apply_end: null, url: "https://www.gg.go.kr/youth" });
  });
  test("잘못된 키 응답은 throw", () => {
    expect(() => youth.parse('{"errorCode":"e001","errorMsg":"invalid api key."}')).toThrow("e001");
  });
});

describe("T6 공통 — 일부만 받고 성공으로 끝나지 않는다", () => {
  test("collectPages: 중간의 짧은 페이지는 계속, 총건수 없음·부분 응답·상한 초과는 throw", async () => {
    const { collectPages } = await import("../../src/sources/util");
    const o = { key: String, maxPages: 9, gapMs: 0 };
    const pages = [[1, 2], [3], [4, 5]];
    expect(await collectPages("t", async (p) => ({ total: 5, rows: pages[p - 1]! }), o)).toEqual([1, 2, 3, 4, 5]);
    await expect(collectPages("t", async () => ({ total: null, rows: [1] }), o)).rejects.toThrow("총건수 없음");
    await expect(collectPages("t", async (p) => ({ total: 5, rows: p === 1 ? [1, 2] : [] }), o)).rejects.toThrow("부분 응답 2/5");
    await expect(collectPages("t", async (p) => ({ total: p === 1 ? 4 : 0, rows: p === 1 ? [1, 2] : [] }), o)).rejects.toThrow("총건수 변경 4 → 0");
    await expect(collectPages("t", async () => ({ total: 4, rows: [1, 2] }), o)).rejects.toThrow("반복 페이지 2");
    await expect(collectPages("t", async (p) => ({ total: 99, rows: [p] }), { ...o, maxPages: 3 })).rejects.toThrow("3페이지 초과");
    expect(await collectPages("t", async () => ({ total: 0, rows: [] }), o)).toEqual([]);
    await expect(collectPages("t", async () => ({ total: 1, rows: [1, 2] }), o)).rejects.toThrow("총건수보다 많음");
  });

  test("총건수 필드가 빠진 응답은 null (→ 수집 실패)", () => {
    expect(kmooc.parse('{"resultCode":"00","items":[]}').total).toBeNull();
    expect(kstartup.parse('{"data":[]}').total).toBeNull();
    expect(lifelong.parse('{"header":{"resultCode":"00"},"body":{"items":[]}}').total).toBeNull();
    expect(youth.parse('{"resultCode":200,"result":{"youthPolicyList":[]}}').total).toBeNull();
    expect(kmooc.parse('{"resultCode":"00","totalCount":true,"items":[]}').total).toBeNull();
  });

  test("상태·키 필드가 빠진 행은 null(의도적 제외)이 아니라 throw(정리 건너뜀)", () => {
    const ks = kstartup.parse(fx("kstartup.json")).rows[0]!;
    expect(() => kstartup.normalize({ ...ks, rcrt_prgs_yn: undefined })).toThrow("모르는 모집 상태");
    expect(() => kstartup.normalize({ ...ks, pbanc_sn: undefined as never })).toThrow("행 형식");
    expect(() => kstartup.normalize({ ...ks, pbanc_sn: null as never })).toThrow("행 형식");
    expect(() => kstartup.normalize({ ...ks, pbanc_sn: { value: 1 } as never })).toThrow("행 형식");
    expect(() => kstartup.normalize({ ...ks, pbanc_rcpt_end_dt: "2026-10-01 ~ 2026-10-31" })).toThrow("날짜 형식");
    expect(() => kstartup.normalize({ ...ks, rcrt_prgs_yn: "진행" })).toThrow("모르는 모집 상태");
    expect(() => kmooc.normalize({ ...kmooc.parse(fx("kmooc.json")).rows[0]!, enrollment_end: "2026-11-19" })).toThrow("날짜 형식");
    // 날짜가 있는데 못 읽으면 throw (null 이면 마감 판정이 바뀐다)
    expect(() => daegu.normalize({ ...daegu.parse(fx("daegu.xml")).rows[0]!, impl_reg_finish: "10월 말" })).toThrow("날짜 형식");
    expect(() => lifelong.normalize({ ...lifelong.parse(fx("lifelong-std.json")).rows[0]!, rceptEndDate: "상시" })).toThrow("날짜 형식");
    const y0 = youth.parse(fx("youthcenter.json")).rows[0]!;
    expect(() => youth.normalize({ ...y0, aplyYmd: "20261001 - 20261031" })).toThrow("기간 형식");
    expect(() => youth.normalize({ ...y0, aplyYmd: "20261001 ~ " })).toThrow("기간 형식");
    expect(() => youth.normalize({ ...y0, aplyYmd: false as never })).toThrow("기간 형식");
    expect(() => youth.normalize({ ...y0, aplyUrlAddr: "javascript:void(0)" })).toThrow("URL 형식");
    expect(youth.normalize({ ...y0, aplyUrlAddr: "youth.seoul.go.kr/apply/1" })!.url).toBe("https://youth.seoul.go.kr/apply/1");
    expect(() => lifelong.normalize({ ...lifelong.parse(fx("lifelong-std.json")).rows[0]!, homepageUrl: "평생학습관 홈페이지" })).toThrow("URL 형식");
    // 사전 필터도 못 읽는 기간은 버리지 않고 남긴다
    expect(youth.applyOpen({ ...y0, aplyYmd: "20270101 - 20271231" }, "2026-10-12")).toBe(true);
    expect(() => kmooc.normalize({ ...kmooc.parse(fx("kmooc.json")).rows[0]!, id: "" })).toThrow("행 형식");
    expect(() => daegu.normalize({ ...daegu.parse(fx("daegu.xml")).rows[0]!, ord_cd: "" })).toThrow("행 형식");
    expect(() => lifelong.normalize({ ...lifelong.parse(fx("lifelong-std.json")).rows[0]!, insttCode: undefined })).toThrow("키 필드 누락");
  });

  test("신청 시작 전은 뺀다 (kmooc 수강신청 가능, 온통청년 신청기간 중)", () => {
    const k = kmooc.parse(fx("kmooc.json")).rows[0]!; // enrollment_start = 2026-10-12 KST
    expect([kmooc.enrollOpen(k, "2026-10-12"), kmooc.enrollOpen(k, "2026-10-11")]).toEqual([true, false]);
    const y = youth.parse(fx("youthcenter.json")).rows;
    expect([youth.applyOpen(y[0]!, "2026-09-30"), youth.applyOpen(y[0]!, "2026-10-01"), youth.applyOpen(y[1]!, "2026-01-01")]).toEqual([false, true, true]);
  });

  test("K-Startup 상대 경로 URL 은 원천 도메인 기준, 온통청년 실패 코드는 throw", () => {
    const ks = kstartup.parse(fx("kstartup.json")).rows[0]!;
    expect(kstartup.normalize({ ...ks, detl_pg_url: "/web/contents/x.do?a=1" })!.url).toBe("https://www.k-startup.go.kr/web/contents/x.do?a=1");
    expect(() => youth.parse('{"resultCode":500,"resultMessage":"오류","result":{"pagging":{"totCount":10},"youthPolicyList":[]}}')).toThrow("500");
  });
});
