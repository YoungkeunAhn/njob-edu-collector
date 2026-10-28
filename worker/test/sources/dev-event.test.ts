import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { devEvent, normalize, parse, README_URL } from "../../src/sources/dev-event";

const md = readFileSync(join(import.meta.dirname, "fixtures/dev-event.md"), "utf8");
const run = (body: string, today: string) =>
  devEvent.fetchList({ fetch: (async () => new Response(body)) as unknown as typeof fetch, env: {} as never, today });

describe("dev-event (README 실응답 2026-10-12 발췌)", () => {
  test("월별 절 3개 → 32건(10월 13·11월 17·12월 2), 모두 정규화되고 지난 행사 기록 표는 읽지 않는다", () => {
    const recs = parse(md);
    expect(recs).toHaveLength(32);
    expect(recs.filter((r) => r.ym === "2026-10")).toHaveLength(13);
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(32);
  });

  test("월 제목 형식이 바뀌면 그 절을 건너뛰지 않고 throw", () => {
    expect(() => parse(md.replace("## `26년 12월`", "## 26년 12월"))).toThrow("월 제목 형식");
  });

  test("첫 항목 필드 매핑: 온라인·무료, 접수기간(시각 붙은 끝)", () => {
    expect(normalize(parse(md)[0]!)).toEqual({
      source_id: "https://event-us.kr/itsman/event/136224",
      title: "AI 공격 대응 : 위협 인텔리전스 실전 활용 전략",
      desc: "세미나 AI",
      provider_name: "잇츠맨 / 다온기술 / CrowdStrike",
      mode: "online",
      address: null,
      cost_type: "free", cost_amount: 0,
      apply_start: "2026-09-28", apply_end: "2026-10-08",
      url: "https://event-us.kr/itsman/event/136224",
    });
  });

  test("오프라인 주소·유료, 일시 = 행사 기간, 하루짜리 일시, 온+오프 = blended", () => {
    const recs = parse(md);
    const by = (t: string) => normalize(recs.find((r) => r.title.startsWith(t))!)!;
    expect(by("AWSKRUG 서버리스")).toMatchObject({ mode: "offline", address: "서울 강남구", cost_type: "paid", cost_amount: null });
    expect(by("Korea Defense Tech")).toMatchObject({ course_start: "2026-10-09", course_end: "2026-10-11" });
    expect(by("FOSS for All")).toMatchObject({ course_start: "2026-11-28", course_end: "2026-11-28" });
    expect(by("2026 SNU X Croche")).toMatchObject({ mode: "blended", address: "서울 관악구" });
    expect(by("[웅진x에스원]").title).toBe("[웅진x에스원] 보안에서 재해복구까지, 멈추지 않는 비즈니스를 위한 클라우드 운영 전략");
  });

  test("source_id 안정·고유, URL 절대 경로", () => {
    const ids = parse(md).map((r) => normalize(r)!.source_id);
    expect(ids).toEqual(parse(md).map((r) => normalize(r)!.source_id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of parse(md)) expect(normalize(r)!.url).toMatch(/^https:\/\//);
  });

  test("월 경계 연도: 1월 절의 12월 접수는 전년도", () => {
    const r = { ...parse(md)[0]!, ym: "2027-01", when: "12. 20(일) ~ 01. 05(화)" };
    expect(normalize(r)).toMatchObject({ apply_start: "2026-12-20", apply_end: "2027-01-05" });
  });

  test("fetchList: 이번 달 이후 절만 남긴다, 남는 게 없으면 throw", async () => {
    expect(await run(md, "2026-10-12")).toHaveLength(32);
    const nov = await run(md, "2026-11-03");
    expect(nov).toHaveLength(19);
    expect(nov.every((r) => r.ym >= "2026-11")).toBe(true);
    await expect(run(md, "2027-01-02")).rejects.toThrow("0건");
    expect(README_URL).toMatch(/\/master\/README\.md$/);
  });

  test("못 읽는 값·모르는 필드·구조 없는 문서는 throw", () => {
    const r = parse(md)[0]!;
    expect(() => normalize({ ...r, when: "10월 중" })).toThrow("날짜 형식");
    expect(() => normalize({ ...r, when: "09. 31(목) ~ 10. 08(목)" })).toThrow("날짜 형식");
    expect(() => normalize({ ...r, kind: "" })).toThrow("항목 형식");
    expect(() => parse("## `26년 10월`\n- __[x](https://a.kr)__\n  - 장소: 서울")).toThrow("모르는 필드");
    expect(() => parse("## `26년 10월`\n- [x](https://a.kr)")).toThrow("항목 형식");
    expect(() => parse("# 점검 중")).toThrow("월별 목록 없음");
  });
});
