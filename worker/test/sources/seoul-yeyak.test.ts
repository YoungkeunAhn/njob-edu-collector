import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { normalize, parse, seoulYeyak } from "../../src/sources/seoul-yeyak";
import { imageUrl } from "../../src/sources/util";

const body = readFileSync(join(import.meta.dirname, "fixtures/seoul-yeyak.json"), "utf8");

describe("T6 seoul-yeyak (sample 키 실응답 2026-10-12)", () => {
  test("픽스처 5건 파싱, 접수중 1건만 남는다", () => {
    const { total, rows } = parse(body);
    expect([total, rows.length]).toEqual([388, 5]);
    expect(rows.map(normalize).filter(Boolean)).toHaveLength(1);
  });

  test("접수중 행의 필드 매핑", () => {
    const d = parse(body).rows.map(normalize).find(Boolean)!;
    expect(d).toMatchObject({
      source_id: "S260924084614615176",
      title: "[월드컵공원] 꽁지 불빛 반딧불이 해설(10월)",
      provider_name: "서울특별시 산악문화체험센터",
      address: "서울특별시 마포구",
      cost_type: "free", cost_amount: 0,
      apply_start: "2026-09-28", apply_end: "2026-10-26",
      course_start: "2026-09-28", course_end: "2026-10-27",
      target: "제한없음",
    });
    expect(d.url).toMatch(/^https:\/\/yeyak\.seoul\.go\.kr\//);
  });

  test("source_id 가 안정적이다", () => {
    const ids = () => parse(body).rows.map((r) => r.SVCID);
    expect(ids()).toEqual(ids());
  });

  test("HTML 엔티티를 푼다", () => {
    const r = parse(body).rows.find((x) => x.SVCNM.includes("&#39;"))!;
    expect(normalize({ ...r, SVCSTATNM: "접수중" })!.title).toBe("2026년 하반기 '우리 가족 경희궁 탐험대' 교육생 모집");
  });

  test("처음 보는 상태값은 throw, 알려진 마감 상태는 null", () => {
    const r = parse(body).rows[0]!;
    expect(() => normalize({ ...r, SVCSTATNM: "접수 중" })).toThrow("모르는 상태");
    expect(normalize({ ...r, SVCSTATNM: "예약마감" })).toBeNull();
  });

  test("상태값이 빠진 행은 throw (마감으로 오인해 정리하지 않는다)", () => {
    expect(() => normalize({ ...parse(body).rows[0]!, SVCSTATNM: "" })).toThrow("행 형식");
  });

  test("INFO-200 은 빈 목록, 다른 오류 코드는 throw", () => {
    expect(parse('{"RESULT":{"CODE":"INFO-200","MESSAGE":"해당하는 데이터가 없습니다."}}').rows).toEqual([]);
    expect(() => parse('{"RESULT":{"CODE":"ERROR-500","MESSAGE":"서버 오류"}}')).toThrow("ERROR-500");
    expect(() => parse("<RESULT><CODE>ERROR-335</CODE><MESSAGE>샘플 5건</MESSAGE></RESULT>")).toThrow("ERROR-335");
  });

  test("fetchList 는 total 까지 1000건 단위로 넘기고, 키가 없으면 throw", async () => {
    let id = 0;
    const page = (n: number) => JSON.stringify({ ListPublicReservationEducation: { list_total_count: 1500, RESULT: { CODE: "INFO-000", MESSAGE: "" }, row: Array.from({ length: n }, () => ({ ...parse(body).rows[0]!, SVCID: `S${id++}` })) } });
    const f = vi.fn().mockResolvedValueOnce(new Response(page(1000))).mockResolvedValueOnce(new Response(page(500)));
    const env = { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", SEOUL_API_KEY: "K" } as never;
    expect(await seoulYeyak.fetchList({ fetch: f, env, today: "2026-10-12" })).toHaveLength(1500);
    expect(f.mock.calls.map((c) => String(c[0]).split("/").slice(-3, -1).join("-"))).toEqual(["1-1000", "1001-2000"]);
    await expect(seoulYeyak.fetchList({ fetch: f, env: {} as never, today: "" })).rejects.toThrow("SEOUL_API_KEY");
  });

  test("이미지 링크: IMGURL 을 그대로, https 가 아니거나 비면 null", () => {
    const r = parse(body).rows.find((x) => x.SVCSTATNM === "접수중")!;
    expect(normalize(r)!.image_url).toBe(r.IMGURL);
    expect(normalize({ ...r, IMGURL: "" })!.image_url).toBe(null);
    expect(imageUrl("http://yeyak.seoul.go.kr/a.jpg")).toBe(null);
    expect(imageUrl("https://lms.kmooc.kr/course/thumb.php?id=1")).toBe("https://lms.kmooc.kr/course/thumb.php?id=1");
    expect(imageUrl(undefined)).toBe(null);
  });
});
