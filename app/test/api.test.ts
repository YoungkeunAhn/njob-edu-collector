import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, getCourse } from "../src/api";

afterEach(() => vi.unstubAllGlobals());

describe("G03 상세 조회 오류", () => {
  test.each([400, 404, 429, 500, 503])("상태 %i를 보존한다", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    await expect(getCourse("1")).rejects.toMatchObject({ name: "ApiError", status });
    await expect(getCourse("1")).rejects.toBeInstanceOf(ApiError);
  });
  test("네트워크 실패는 404로 바꾸지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(getCourse("1")).rejects.toBeInstanceOf(TypeError);
  });
});
