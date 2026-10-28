import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { API_URL, normalize, PAGE_URL, parse, seoulLifelong } from "../../src/sources/seoul-lifelong";

const body = readFileSync(join(import.meta.dirname, "fixtures/seoul-lifelong.json"), "utf8");
const recs = () => parse(body);

describe("seoul-lifelong (doListSiminCourse.do 실응답 2026-10-12, 상태 섞어 14건 발췌)", () => {
  test("14건 파싱, 모집중 8건만 통과, 강사명 없음", () => {
    expect(recs()).toHaveLength(14);
    const ok = recs().map(normalize).filter(Boolean);
    expect(ok).toHaveLength(8);
    for (const r of recs()) expect(r).not.toHaveProperty("prof_nm");
  });

  test("첫 행 필드 매핑", () => {
    expect(normalize(recs()[0]!)).toEqual({
      source_id: "S100120261006092745_01",
      title: "사회 문제를 새로운 기회와 가능성으로 만들기 (공감, 협력, 창의)",
      desc: "직업역량 직업역량",
      provider_name: "서울시민대학",
      mode: "offline",
      address: "서울특별시",
      cost_type: "paid", cost_amount: 10000,
      capacity: 20,
      apply_start: "2026-10-06", apply_end: "2026-10-20",
      course_start: "2026-10-21", course_end: "2026-11-18",
      url: "https://sll.seoul.go.kr/lms/simin_course/courseRequest/doDetailInfo.do?main_se=ssu&course_id=S100120261006092745&class_no=01&course_gubun=0&mnid=202501604868&simin_yn=M",
    });
  });

  test("온라인시민대학은 doDetailInfo2, ZOOM 장소는 온라인, 무료", () => {
    const by = (id: string) => normalize(recs().find((r) => r.course_id === id)!)!;
    expect(by("S100120260224165259")).toMatchObject({ mode: "online", address: null, cost_type: "free", cost_amount: 0, apply_end: "2026-12-31" });
    expect(by("S100120260224165259").url).toContain("/doDetailInfo2.do?");
    expect(by("S100120260928152521")).toMatchObject({ mode: "online", address: null });
  });

  test("source_id 안정, URL 절대 경로", () => {
    const ids = () => recs().map(normalize).filter(Boolean).map((d) => d!.source_id);
    expect(ids()).toEqual(ids());
    expect(new Set(ids()).size).toBe(8);
    for (const id of ids()) expect(id).toMatch(/^S\d+_\d+$/);
    for (const d of recs().map(normalize).filter(Boolean)) expect(d!.url).toMatch(/^https:\/\/sll\.seoul\.go\.kr\/lms\//);
  });

  test("FULL·BEFORE·PAST 는 버리고, 모르는 상태·강의구분·비용·날짜는 throw", () => {
    for (const s of ["FULL", "BEFORE", "PAST"]) expect(recs().filter((r) => r.status === s).map(normalize)).toEqual(expect.arrayContaining([null]));
    const r = recs()[0]!;
    expect(() => normalize({ ...r, status: "CLOSE" })).toThrow("모르는 상태");
    expect(() => normalize({ ...r, status: "" })).toThrow("행 형식");
    expect(() => normalize({ ...r, course_gubun: "3" })).toThrow("모르는 강의구분");
    expect(() => normalize({ ...r, fee: "별도" })).toThrow("비용 형식");
    expect(() => normalize({ ...r, capacity: "20명" })).toThrow("정원 형식");
    expect(() => normalize({ ...r, course_request_end_dt: "미정" })).toThrow("날짜 형식");
    expect(normalize({ ...r, fee: "", capacity: "" })).toMatchObject({ capacity: null });
  });

  test("목록 없는 응답은 throw", () => {
    expect(() => parse('{"dataMap":{}}')).toThrow("simin_course_list 없음");
  });

  test("fetchList: 페이지에서 _csrf·쿠키를 받아 폼 POST(모집중 필터)", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn(async (url: string) =>
        url === PAGE_URL
          ? new Response('<head><meta name="_csrf" content="tok-1" /></head>', { headers: { "set-cookie": "JSESSIONID=abc; Path=/; HttpOnly" } })
          : new Response(body));
      const p = seoulLifelong.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(14);
      const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
      expect(url).toBe(API_URL);
      expect(init.method).toBe("POST");
      const h = init.headers as Record<string, string>;
      expect([h["x-csrf-token"], h.cookie]).toEqual(["tok-1", "JSESSIONID=abc"]);
      const b = init.body as URLSearchParams;
      expect([b.get("simin_yn"), b.get("sc_status")]).toEqual(["M,DC,MD,O,R,RG", "ing"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("fetchList: _csrf 가 없으면 throw", async () => {
    const f = vi.fn(async () => new Response("<html>점검</html>"));
    await expect(seoulLifelong.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-10-12" })).rejects.toThrow("_csrf 없음");
  });
});
