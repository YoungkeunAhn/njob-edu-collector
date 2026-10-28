import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { META } from "../../worker/src/api/meta";
import { COURSES } from "../mock/data";

const sdk = vi.hoisted(() => ({ log: vi.fn(), createLink: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@apps-in-toss/web-framework", () => ({ Analytics: { log: sdk.log }, Share: { createLink: sdk.createLink, sendMessage: sdk.sendMessage }, Device: {}, Notification: {}, Storage: {}, TossAuth: {} }));
import { buildCampaignPath, buildCourseSharePath, buildListSharePath, fallbackListPath, safeFilters, sharePath } from "../src/share";
import { readQuery } from "../src/logic";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { ReactNativeWebView: {} }); sdk.log.mockResolvedValue(undefined); sdk.createLink.mockResolvedValue("https://share.example/link"); sdk.sendMessage.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllGlobals());

describe("G03 공유 경로", () => {
  test("목록 공유는 필터를 보존하고 새 user_share 캠페인을 만든다", () => {
    const url = new URL(buildListSharePath({ region: "11", cat: "genai", cost: "free", sort: "new", q: "AI 기초" }, META));
    expect(url.protocol).toBe("intoss:");
    expect(url.hostname).toBe("njob-matching");
    expect(url.pathname).toBe("/list");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ region: "11", cat: "genai", cost: "free", sort: "new", q: "AI 기초", utm_source: "user_share", utm_campaign: "list_share" });
  });

  test("상세 대체 조건은 실제 강좌의 비용 분류·온라인·지역을 따른다", () => {
    const offline = { ...COURSES[0]!, id: 123, mode: "offline" as const, sido_code: "11", sigungu_code: null, category_main: "genai", cost_type: "free" as const };
    const a = new URL(buildCourseSharePath(offline, META));
    expect(a.pathname).toBe("/course/123");
    expect(a.searchParams.get("region")).toBe("11");
    expect(a.searchParams.get("cost")).toBe("free");
    const b = new URL(buildCourseSharePath({ ...offline, mode: "online", cost_type: "card", cost_amount: 0 }, META));
    expect(b.searchParams.has("region")).toBe(false);
    expect(b.searchParams.get("mode")).toBe("online");
    expect(b.searchParams.get("cost")).toBe("card");
    expect(() => buildCourseSharePath({ ...offline, id: -1 }, META)).toThrow();
  });

  test("404 대체는 허용 조건만 남기고 오염된 목적지는 버린다", () => {
    expect(fallbackListPath("?region=11&cat=genai&cost=free&utm_campaign=old&targetUrl=https://evil.test", META)).toBe("/list?region=11&cat=genai&cost=free");
    expect(fallbackListPath("?region=99&cat=evil&cost=partial&mode=offline", META)).toBe("/list");
    expect(fallbackListPath("?region=11&region=41&cat=genai", META)).toBe("/list?cat=genai");
    expect(fallbackListPath("?cat=genai&sub=video_gen", META)).toBe("/list?cat=genai");
    expect(fallbackListPath("?region=11&mode=online&cost=free", META)).toBe("/list?mode=online&cost=free");
  });

  test("운영자 캠페인은 목적지·중복·미지원 값·코드를 검증한다", () => {
    const campaign = { source: "naver_cafe", medium: "community", campaign: "launch_w2", content: "post_a" };
    const url = new URL(buildCampaignPath("/list?region=11&cost=free", campaign, META));
    expect(url.searchParams.get("utm_campaign")).toBe("launch_w2");
    for (const path of ["https://evil.test/list", "//evil.test/list", "/list?targetUrl=https://evil.test", "/list?cost=partial", "/list?cost=", "/list?region=11&region=11", "/list?cat=genai&sub=video_gen", "/course/0", "/course/9007199254740992", "/list#evil"]) expect(() => buildCampaignPath(path, campaign, META), path).toThrow();
    expect(() => buildCampaignPath("/list", { ...campaign, campaign: "자유 입력" }, META)).toThrow();
    for (const invalid of [undefined, null, {}, { ...campaign, content: undefined }]) expect(() => buildCampaignPath("/list", invalid as unknown as typeof campaign, META)).toThrow("캠페인");
  });

  test.each(["paid", "free", "card"] as const)("비용 %s를 목록 복원·공유·404 대체·캠페인 링크에서 보존한다", (cost) => {
    const filters = { region: "11", cat: "genai", cost, sort: "new" };
    expect(safeFilters(readQuery(`?region=11&cat=genai&cost=${cost}&sort=new`), META)).toEqual(filters);
    const shared = new URL(buildListSharePath(filters, META));
    expect(shared.searchParams.get("cost")).toBe(cost);
    expect(fallbackListPath(shared.search, META)).toBe(`/list?region=11&cat=genai&cost=${cost}&sort=new`);
    const campaign = { source: "naver_cafe", medium: "community", campaign: "launch_w2", content: "post_a" };
    expect(new URL(buildCampaignPath(`/list?cost=${cost}`, campaign, META)).searchParams.get("cost")).toBe(cost);
    const course = { ...COURSES[0]!, cost_type: cost, cost_amount: 0 };
    expect(new URL(buildCourseSharePath(course, META)).searchParams.get("cost")).toBe(cost);
  });

  test.each(["partial", null] as const)("강좌 비용 분류 %s는 금액 0이어도 다른 비용 조건으로 바꾸지 않는다", (cost_type) => {
    const course = { ...COURSES[0]!, cost_type, cost_amount: 0 };
    expect(new URL(buildCourseSharePath(course, META)).searchParams.has("cost")).toBe(false);
  });

  test("미지원·중복 비용 조건은 복원과 대체 링크에 남기지 않는다", () => {
    for (const cost of ["partial", "unknown", "0", "FREE", "01012345678", ""]) expect(safeFilters({ cost }, META)).toEqual({});
    expect(fallbackListPath("?cost=paid&cost=card&cat=genai", META)).toBe("/list?cat=genai");
  });

  test("intoss URL 파싱을 지원하지 않아도 고정 prefix로 생성·공유한다", async () => {
    const NativeURL = globalThis.URL;
    vi.stubGlobal("URL", class extends NativeURL {
      constructor(input: string | URL, base?: string | URL) {
        if (String(input).startsWith("intoss:")) throw new Error("unsupported custom scheme");
        super(input, base);
      }
    });
    const path = buildListSharePath({ cost: "free", q: "AI 기초" }, META);
    expect(path).toMatch(/^intoss:\/\/njob-matching\/list\?/);
    expect(path).toContain("q=AI+%EA%B8%B0%EC%B4%88");
    expect(buildCourseSharePath({ ...COURSES[0]!, id: 123 }, META)).toMatch(/^intoss:\/\/njob-matching\/course\/123\?/);
    expect(buildCampaignPath("/list", { source: "naver_cafe", medium: "community", campaign: "launch", content: "post_a" }, META)).toContain("utm_campaign=launch");
    await sharePath(path, "강좌");
    expect(sdk.createLink).toHaveBeenCalledWith({ path });
  });

  test("SDK 링크 생성 후 시트 열기, 전송 완료 이벤트는 기록하지 않는다", async () => {
    const path = buildListSharePath({ cost: "free" }, META);
    await sharePath(path, "무료 강좌");
    expect(sdk.createLink).toHaveBeenCalledWith({ path });
    expect(sdk.sendMessage).toHaveBeenCalledWith({ message: "무료 강좌\nhttps://share.example/link" });
    expect(sdk.log).toHaveBeenCalledTimes(1);
    expect(sdk.log.mock.calls[0]![0]).toMatchObject({ log_name: "njob_share_link_created", params: { target_type: "list" } });
  });

  test("링크 생성 실패·시트 취소를 전송 완료로 세지 않는다", async () => {
    const path = buildListSharePath({}, META);
    sdk.createLink.mockRejectedValueOnce(new Error("offline"));
    await expect(sharePath(path, "test")).rejects.toThrow("offline");
    expect(sdk.log).not.toHaveBeenCalled();
    expect(sdk.sendMessage).not.toHaveBeenCalled();
    sdk.sendMessage.mockRejectedValueOnce(new Error("cancel"));
    await expect(sharePath(path, "test")).rejects.toThrow("cancel");
    expect(sdk.log.mock.calls.map(([event]) => event.log_name)).toEqual(["njob_share_link_created"]);
  });

  test("일반 브라우저·외부 목적지는 SDK 호출 없이 거절한다", async () => {
    await expect(sharePath("https://evil.test", "test")).rejects.toThrow();
    for (const path of ["intoss://njob-matching.evil/list", "intoss://njob-matching@evil/list", "intoss://njob-matching//evil/list", "intoss://njob-matching/course/9007199254740992"]) await expect(sharePath(path, "test")).rejects.toThrow();
    await expect(sharePath("intoss://njob-matching/list?targetUrl=https://evil.test", "test")).rejects.toThrow();
    vi.stubGlobal("window", {});
    await expect(sharePath(buildListSharePath({}, META), "test")).rejects.toThrow("토스 앱");
    expect(sdk.createLink).not.toHaveBeenCalled();
  });
});
