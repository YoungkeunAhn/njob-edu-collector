import { afterEach, describe, expect, test, vi } from "vitest";
import { applyOpen, normalize, selectApplicationPeriod, youthcenter, type YouthRow } from "../../src/sources/youthcenter";

// 2026-10-26 실응답에서 확인한 신청기간·링크 형식. 나머지 필드는 테스트용이다.
const row: YouthRow = {
  plcyNo: "test", plcyNm: "AI 교육", refUrlAddr1: "https://example.com/course",
  aplyYmd: "20261001 ~ 20261031\\N20261201 ~ 20261231",
};

afterEach(() => vi.useRealTimers());

describe("온통청년 실응답 형식", () => {
  test.each([
    ["2026-10-26", "2026-10-01", "2026-10-31", true],
    ["2026-11-15", "2026-12-01", "2026-12-31", false],
    ["2026-12-01", "2026-12-01", "2026-12-31", true],
    ["2027-01-01", "2026-12-01", "2026-12-31", true], // 지난 마감일은 런타임이 제외한다.
  ])("여러 기간: %s 기준으로 한 구간을 선택한다", (today, start, end, open) => {
    const selected = selectApplicationPeriod(row, today);
    expect(normalize(selected)).toMatchObject({ apply_start: start, apply_end: end });
    expect(applyOpen(selected, today)).toBe(open);
    expect(row.aplyYmd).toBe("20261001 ~ 20261031\\N20261201 ~ 20261231");
  });

  test("순서가 바뀌거나 실제 줄바꿈이어도 현재 기간을 선택한다", () => {
    const selected = selectApplicationPeriod({ ...row, aplyYmd: "20261201 ~ 20261231\r\n20261001 ~ 20261031" }, "2026-10-26");
    expect(normalize(selected)).toMatchObject({ apply_end: "2026-10-31" });
  });

  test("잘못된 기간이 섞이면 원문을 보존하고 정규화에서 실패한다", () => {
    const invalid = { ...row, aplyYmd: "20261001 ~ 20261031\\N잘못된 기간" };
    expect(selectApplicationPeriod(invalid, "2026-10-26")).toBe(invalid);
    expect(applyOpen(invalid, "2025-01-01")).toBe(true);
    expect(() => normalize(invalid)).toThrow("기간 형식");
  });

  test("전화문의는 참조 링크로 대체하고, 참조도 없으면 의도적으로 제외한다", () => {
    const phone = { ...row, aplyYmd: "", aplyUrlAddr: "전화문의" };
    expect(normalize(phone)?.url).toBe(row.refUrlAddr1);
    expect(normalize({ ...phone, refUrlAddr1: "" })).toBeNull();
    expect(() => normalize({ ...phone, aplyUrlAddr: "알 수 없는 값" })).toThrow("URL 형식");
  });

  test("실제 수집 경로: 500 재시도 뒤 기간을 고르고 다음 접수 전인 행은 제외한다", async () => {
    vi.useFakeTimers();
    const next = { ...row, plcyNo: "next", aplyYmd: "20260101 ~ 20260131\\N20261201 ~ 20261231" };
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 500 }))
      .mockResolvedValueOnce(Response.json({ resultCode: 200, result: { pagging: { totCount: 2 }, youthPolicyList: [row, next] } }));
    const result = youthcenter.fetchList({ fetch: f, env: { YOUTHCENTER_API_KEY: "test" } as never, today: "2026-10-26" });
    await vi.advanceTimersByTimeAsync(2000);
    const rows = await result;
    expect(rows).toHaveLength(1);
    expect(normalize(rows[0]!)).toMatchObject({ apply_start: "2026-10-01", apply_end: "2026-10-31" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0]![0]).toBe(f.mock.calls[1]![0]);
    expect(new URL(String(f.mock.calls[0]![0])).searchParams.get("pageSize")).toBe("1000");
  });
});
