// 002 N2: 상세 보강 /courses/:id/extra (고용24 상세·교과편성 실응답 2026-10-14)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CourseExtra, CourseItem } from "../../../shared/api-types";
import { handle, type ApiDeps } from "../../src/api/handle";
import { parseCurriculum, parseDetail } from "../../src/sources/work24-detail";

const fx = (f: string) => readFileSync(join(import.meta.dirname, "../sources/fixtures", f), "utf8");
const DETAIL = fx("work24-detail.html");
const CURRICULUM = fx("work24-curriculum.html");

const URL24 = "https://www.work24.go.kr/hr/a/a/3100/selectTracseDetl.do?tracseId=AIG20250000526545&tracseTme=6&crseTracseSe=C0061&trainstCstmrId=1";
const course = (over: Partial<CourseItem> = {}): CourseItem => ({
  id: 7, source: "work24", attribution: "고용24", title: "숏폼", course_type: "training", provider_name: null,
  category_main: "video", category_sub: null, mode: null, sido_code: null, sigungu_code: null, address: null,
  cost_type: "card", cost_amount: null, apply_start: null, apply_end: null, course_start: null, course_end: null,
  target: null, url: URL24, image_url: null, capacity: null, ...over,
});

class FakeCache {
  store = new Map<string, Response>();
  async match(k: RequestInfo | URL) { return this.store.get(String(k))?.clone(); }
  async put(k: RequestInfo | URL, r: Response) { this.store.set(String(k), r); }
}

/** 원천 가짜: 상세·교과편성 응답과 호출 기록 */
function source(detail: () => Response = () => new Response(DETAIL), curriculum: () => Response = () => new Response(CURRICULUM)) {
  const calls: { url: string; body: string | null }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? String(init.body) : null });
    return url.includes("selectCurriculum") ? curriculum() : detail();
  }) as typeof fetch;
  return { f, calls };
}

function deps(c: CourseItem | null, f: typeof fetch, cache: FakeCache | null = null): ApiDeps {
  return {
    repo: { list: async () => [], get: async (id) => (c && c.id === id ? c : null) },
    cache, limiter: { limit: async () => ({ success: true }) }, allowedOrigins: [], fetch: f,
  };
}
const get = (path: string, d: ApiDeps) => handle(new Request(`https://api.example${path}`), d);

describe("002 N2 상세 보강", () => {
  test("T2-1 상세 → 신청 8명·모집 20명, 교과편성 팝업 요청값을 페이지에서 옮긴다(함수 선언 띄어쓰기 달라도)", () => {
    expect(parseDetail(DETAIL.replace("function fn_PopOpen()", "function fn_PopOpen ( )"))!.popup!.get("tracseId")).toBe("AIG20250000526545");
    const d = parseDetail(DETAIL)!;
    expect([d.applicants, d.capacity]).toEqual([8, 20]);
    expect(Object.fromEntries(d.popup!)).toEqual({
      hpgYn: "Y", tracseId: "AIG20250000526545", tracseTme: "6", ncsYn: "N", pssrpYear: "2025", pssrpTme: "11",
      spclizTracseKndCd: "C", crseTracseSe: "C0061", mainTracseSe: "C0031",
    });
  });

  test("T2-1 교과편성: 비NCS 표는 교과목·단원·시간(이론+실기)", () => {
    expect(parseCurriculum(CURRICULUM)).toEqual([
      { subject: "숏폼 콘텐츠 제작 실습 (CapCut & ChatGPT)", unit: "숏폼 콘텐츠 기획 및 트렌드 분석", hours: 6 },
      { subject: "숏폼 콘텐츠 제작 실습 (CapCut & ChatGPT)", unit: "캡컷을 활용한 영상 편집 실습", hours: 10 },
      { subject: "숏폼 콘텐츠 제작 실습 (CapCut & ChatGPT)", unit: "생성형 AI를 활용한 콘텐츠 제작", hours: 17 },
      { subject: "숏폼 콘텐츠 제작 실습 (CapCut & ChatGPT)", unit: "콘텐츠 업로드 및 채널 운영", hours: 6 },
    ]);
  });

  test("T2-1 교과편성: NCS 표는 능력단위명, 재량교과(입학식 등)·빈 표('해당 데이터가 없습니다')·총계 줄은 뺀다", () => {
    const items = parseCurriculum(fx("work24-curriculum-ncs.html"))!;
    expect(items[0]).toEqual({ subject: "프론트엔드 프로그래밍 기본 및 응용", unit: "프로그래밍 언어 응용", hours: 66 });
    expect(items.some((i) => i.subject === "재량교과" || i.subject.includes("총 훈련시간") || i.subject.includes("해당 데이터"))).toBe(false);
    expect(items.every((i) => !/^\d{10}_/.test(i.unit ?? ""))).toBe(true); // 능력단위 코드가 아니라 이름
    expect(items.map((i) => i.unit)).toContain("생성형 AI 기반 UI/UX 설계 및 화면 구현");
  });

  test("T2-2 세부내용·강사는 응답에 없다(FR-014)", async () => {
    const s = source();
    const body = JSON.stringify(await (await get("/courses/7/extra", deps(course(), s.f))).json());
    expect(DETAIL).toContain("신*아"); // 픽스처에는 강사 이름이 있다
    expect(CURRICULUM).toContain("ChatGPT로 대본 작성"); // 세부내용
    expect(body).not.toContain("신*아");
    expect(body).not.toContain("대본 작성");
  });

  test("T2-1 /extra: 상세 GET 후 교과편성 POST, 6시간 캐시 헤더", async () => {
    const s = source();
    const res = await get("/courses/7/extra", deps(course(), s.f));
    const body = (await res.json()) as CourseExtra;
    expect([res.status, body.applicants, body.capacity, body.curriculum.length]).toEqual([200, 8, 20, 4]);
    expect(res.headers.get("cache-control")).toBe("public, max-age=21600");
    expect(s.calls.map((c) => c.url)).toEqual([URL24, "https://www.work24.go.kr/hr/a/a/3100/selectCurriculum.do"]);
    expect(s.calls[1]!.body).toContain("tracseId=AIG20250000526545");
  });

  test.each([
    ["상세 404", () => new Response("x", { status: 404 }), () => new Response(CURRICULUM)],
    ["상세 네트워크 오류", () => { throw new Error("timeout"); }, () => new Response(CURRICULUM)],
    ["없는 과정 페이지(인원 영역 없음)", () => new Response("<p>존재하지 않는 페이지입니다.</p>"), () => new Response(CURRICULUM)],
    ["교과편성 500", () => new Response(DETAIL), () => new Response("x", { status: 500 })],
    ["상세에 교과편성 팝업 함수 없음", () => new Response(DETAIL.replace("fn_PopOpen", "fn_Other")), () => new Response(CURRICULUM)],
  ])("T2-3·T2-4 원천 실패(%s) → 200 빈 값, DB 정원은 유지, 캐시하지 않는다", async (_, detail, curriculum) => {
    const cache = new FakeCache();
    const s = source(detail as () => Response, curriculum);
    const res = await get("/courses/7/extra", deps(course({ capacity: 30 }), s.f, cache));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applicants: null, capacity: 30, curriculum: [] });
    expect(res.headers.get("cache-control")).toBeNull();
    expect(cache.store.size).toBe(0);
  });

  test("T2-4 교과편성 표가 없으면(점검 페이지 200) 실패와 같다: 빈 값, 캐시 안 함", async () => {
    const cache = new FakeCache();
    const s = source(undefined, () => new Response("<html><body>점검 중</body></html>"));
    const res = await get("/courses/7/extra", deps(course(), s.f, cache));
    expect(await res.json()).toEqual({ applicants: null, capacity: null, curriculum: [] });
    expect(cache.store.size).toBe(0);
  });

  test("T2-4 표는 있는데 '해당 데이터가 없습니다'(원격 과정 등) → 빈 커리큘럼은 정상 값", () => {
    expect(parseCurriculum("<table><thead><tr><th>교과목</th><th>단원명</th><th>세부내용</th><th>이론시간</th><th>실기시간</th></tr></thead><tbody><tr><td colspan='5'>해당 데이터가 없습니다.</td></tr></tbody></table>")).toEqual([]);
  });

  test("T2-2 열은 머리글 이름으로: 강사 표는 안 읽고, 단원 열이 없으면 세부내용을 단원으로 쓰지 않는다", () => {
    expect(parseCurriculum(DETAIL)).toBeNull(); // 상세 페이지의 강사 표(성명|전공|자격)는 교과목 표가 아니다
    const noUnit = "<table><thead><tr><th>교과목</th><th>세부내용</th><th>이론시간</th><th>실기시간</th></tr></thead><tbody><tr><td>숏폼</td><td>대본 작성 실습</td><td>0 시간</td><td>6 시간</td></tr></tbody></table>";
    expect(parseCurriculum(noUnit)).toEqual([{ subject: "숏폼", unit: null, hours: 6 }]);
    // 능력단위 머리글이 한 칸이면 그 칸이 이름이다(옆 칸 강사를 단원으로 읽지 않는다)
    const ncs1 = "<table><thead><tr><th>교과목</th><th>NCS 능력단위명</th><th>강사</th><th>훈련시간</th></tr></thead><tbody><tr><td>영상</td><td>영상 편집</td><td>신*아</td><td>30 시간</td></tr></tbody></table>";
    expect(parseCurriculum(ncs1)).toEqual([{ subject: "영상", unit: "영상 편집", hours: 30 }]);
  });

  test("T2-5 원천이 3xx 로 다른 곳을 가리키면 따라가지 않고 실패(호출은 1회, redirect: manual)", async () => {
    const inits: (RequestInit | undefined)[] = [];
    const f = (async (_: RequestInfo | URL, init?: RequestInit) => { inits.push(init); return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }); }) as typeof fetch;
    const body = await (await get("/courses/7/extra", deps(course(), f))).json();
    expect(body).toEqual({ applicants: null, capacity: null, curriculum: [] });
    expect(inits.map((i) => i?.redirect)).toEqual(["manual"]);
  });

  test.each([
    ["고용24 아님", course({ source: "digital-baeum", url: "https://example.com/a", capacity: 50 })],
    ["고용24인데 다른 호스트", course({ url: "https://evil.example/hr/a/a/3100/selectTracseDetl.do?x=1", capacity: 50 })],
    ["고용24인데 다른 경로", course({ url: "https://www.work24.go.kr/cm/common/x.do", capacity: 50 })],
  ])("T2-5 %s → 원천 호출 0회, DB 정원만", async (_, c) => {
    const s = source();
    const body = await (await get("/courses/7/extra", deps(c, s.f))).json();
    expect(body).toEqual({ applicants: null, capacity: 50, curriculum: [] });
    expect(s.calls).toHaveLength(0);
  });

  test("T2-6 같은 id 두 번 → 원천 호출은 처음 한 번(상세+교과편성 2회)", async () => {
    const cache = new FakeCache();
    const s = source();
    await get("/courses/7/extra", deps(course(), s.f, cache));
    const again = await get("/courses/7/extra", deps(course(), s.f, cache));
    expect(((await again.json()) as CourseExtra).applicants).toBe(8);
    expect(s.calls).toHaveLength(2);
  });

  test.each([["/courses/abc/extra", 400], ["/courses/7/extra?x=1", 400], ["/courses/8/extra", 404], ["/courses/7/extra/x", 404]])("T2-7 %s → %i", async (path, status) => {
    expect((await get(path, deps(course(), source().f))).status).toBe(status);
  });

  test("T2-6 앞자리 0 이 붙어도 같은 캐시 키", async () => {
    const cache = new FakeCache();
    const s = source();
    await get("/courses/7/extra", deps(course(), s.f, cache));
    await get("/courses/007/extra", deps(course(), s.f, cache));
    expect(s.calls).toHaveLength(2);
  });

  test("T2-7 기존 /courses/:id 는 그대로", async () => {
    const res = await get("/courses/7", deps(course(), source().f));
    expect(((await res.json()) as CourseItem).id).toBe(7);
  });
});
