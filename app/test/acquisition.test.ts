import { describe, expect, test } from "vitest";
import { cleanLastList, entryPath, readCampaign } from "../src/acquisition";
import { buildQuery, readQuery } from "../src/logic";

describe("G01 유입과 탐색 조건 분리", () => {
  test("캠페인 네 값은 검증하고 API에는 탐색 조건만 전달한다", () => {
    const search = "?region=11&cost=free&utm_source=naver_cafe&utm_medium=community&utm_campaign=launch_w2&utm_content=post_a";
    expect(readCampaign(search)).toEqual({ source: "naver_cafe", medium: "community", campaign: "launch_w2", content: "post_a" });
    expect(buildQuery(readQuery(search))).toBe("region=11&cost=free");
  });

  test("미등록·중복·빈 값·긴 값·자유 입력은 unknown, 추적값 없는 진입은 unattributed", () => {
    expect(readCampaign("")).toEqual({ source: "unattributed", medium: "unattributed", campaign: "unattributed", content: "unattributed" });
    for (const value of ["", "Hello", "전화번호 010", "a".repeat(65), "https://evil.test", "a%20b"]) {
      expect(readCampaign(`?utm_campaign=${value}`).campaign).toBe("unknown");
    }
    expect(readCampaign("?utm_source=unregistered&utm_medium=other")).toMatchObject({ source: "unknown", medium: "unknown" });
    expect(readCampaign("?utm_campaign=a&utm_campaign=b").campaign).toBe("unknown");
    expect(readCampaign(`?utm_campaign=${"a".repeat(64)}`).campaign).toBe("a".repeat(64));
  });

  test("저장/복원에서 캠페인과 임의 목적지를 제거하며 무료 조건은 유지한다", () => {
    expect(cleanLastList("/list?cost=free&utm_campaign=stale&targetUrl=https://evil.test&q=AI+영상")).toBe("/list?cost=free&q=AI+%EC%98%81%EC%83%81");
    for (const invalid of [null, "https://evil.test/list", "//evil.test/list", "/list/../course/1", "/bookmarks", "/listening"]) expect(cleanLastList(invalid)).toBeNull();
    expect(cleanLastList("/list")).toBe("/list");
  });

  test("진입 경로는 고정 코드로 제한한다", () => {
    expect(entryPath("/course/123")).toBe("/course/:id");
    expect(entryPath("/course/secret@example.com")).toBe("unknown");
    expect(entryPath("/list")).toBe("/list");
  });
});
