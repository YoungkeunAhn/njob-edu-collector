import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sdk = vi.hoisted(() => ({ log: vi.fn(), getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("@apps-in-toss/web-framework", () => ({
  Analytics: { log: sdk.log }, Storage: { getItem: sdk.getItem, setItem: sdk.setItem },
  Device: {}, Notification: {}, Share: {}, TossAuth: {},
}));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); sdk.log.mockResolvedValue(undefined); vi.stubGlobal("window", { ReactNativeWebView: {} }); });
afterEach(() => vi.unstubAllGlobals());

describe("G01 계측 경계", () => {
  test("웹뷰 최초 캠페인은 내부 이동·중복 초기화 후에도 보존한다", async () => {
    const { initAcquisition, track } = await import("../src/analytics");
    initAcquisition("?utm_source=naver_cafe&utm_medium=community&utm_campaign=first&utm_content=a", "/list");
    initAcquisition("?utm_campaign=second", "/course/1");
    track("njob_outbound_click", { course_id: 1, source: "work24" });
    expect(sdk.log).toHaveBeenCalledTimes(2);
    expect(sdk.log.mock.calls[0]![0]).toMatchObject({ log_name: "njob_entry", params: { entry_path: "/list", campaign: "first", acquisition_source: "naver_cafe" } });
    expect(sdk.log.mock.calls[1]![0]).toMatchObject({ log_name: "njob_outbound_click", params: { campaign: "first", source: "work24" } });
  });

  test("새 웹뷰 추적값 없으면 이전 캠페인을 사용하지 않는다", async () => {
    const first = await import("../src/analytics");
    first.initAcquisition("?utm_campaign=first", "/list");
    vi.resetModules();
    const second = await import("../src/analytics");
    second.initAcquisition("", "/");
    expect(sdk.log.mock.calls.at(-1)![0].params.campaign).toBe("unattributed");
  });

  test("개인정보·자유검색·원문 URL·캠페인 덮어쓰기를 보내지 않는다", async () => {
    const { track, listParams } = await import("../src/analytics");
    track("njob_list_view", { ...listParams({ q: "개인 검색어", region: "11", cost: "free" }, 20), q: "private", token: "secret", url: "https://x", campaign: "override", source: "https://bad" });
    expect(sdk.log.mock.calls[0]![0].params).toEqual({ region: "11", cost: "free", result_bucket: "5_plus", acquisition_source: "unattributed", medium: "unattributed", campaign: "unattributed", content: "unattributed" });
    expect(listParams({}, 0).result_bucket).toBe("0");
    expect(listParams({}, 4).result_bucket).toBe("1_4");
  });

  test("SDK 동기 예외·Promise 거절은 사용자 동작으로 전파하지 않는다", async () => {
    const { track } = await import("../src/analytics");
    sdk.log.mockImplementationOnce(() => { throw new Error("sync"); });
    expect(() => track("njob_outbound_click")).not.toThrow();
    sdk.log.mockRejectedValueOnce(new Error("async"));
    expect(() => track("njob_outbound_click")).not.toThrow();
    await Promise.resolve();
    expect(sdk.log).toHaveBeenCalledTimes(2);
  });

  test.each(["paid", "free", "card"])("비용 %s 계측과 저장된 목록 복원에서 조건을 유지한다", async (cost) => {
    const { listParams, track } = await import("../src/analytics");
    track("njob_list_view", listParams({ cost, q: "비공개 검색어" }, 3));
    expect(sdk.log.mock.calls[0]![0].params).toMatchObject({ cost, result_bucket: "1_4" });
    expect(sdk.log.mock.calls[0]![0].params).not.toHaveProperty("q");
    sdk.getItem.mockResolvedValue(`/list?cost=${cost}&utm_campaign=old`);
    const { lastList } = await import("../src/toss");
    expect(await lastList.get()).toBe(`/list?cost=${cost}`);
  });

  test("계측 비용은 지원 분류만 기록하고 임의 값은 버린다", async () => {
    const { listParams } = await import("../src/analytics");
    for (const cost of ["partial", "unknown", "01012345678", "", "https://private.example"]) expect(listParams({ cost })).not.toHaveProperty("cost");
  });

  test("일반 브라우저에서는 SDK에 기록하지 않는다", async () => {
    vi.stubGlobal("window", {});
    const { track } = await import("../src/analytics");
    track("njob_entry");
    expect(sdk.log).not.toHaveBeenCalled();
  });

  test("Storage 입출력 모두 오래된 캠페인을 정화한다", async () => {
    sdk.getItem.mockResolvedValue("/list?cost=free&utm_campaign=old");
    sdk.setItem.mockResolvedValue(undefined);
    const { lastList } = await import("../src/toss");
    expect(await lastList.get()).toBe("/list?cost=free");
    lastList.set("/list?cost=free&utm_campaign=new");
    expect(sdk.setItem).toHaveBeenCalledWith("last-list", "/list?cost=free");
  });
});
