import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { calendarUrl, greenlove, normalize, parse } from "../../src/sources/greenlove";

const html = readFileSync(join(import.meta.dirname, "fixtures/greenlove.html"), "utf8");

describe("greenlove (2026년 10월 캘린더 실응답 2026-10-12)", () => {
  test("캘린더 칸 25개 → 행사 13건, 강좌 후보(교육/소모임·체험) 8건", () => {
    const recs = parse(html);
    expect(recs).toHaveLength(13);
    expect(recs.map(normalize).filter(Boolean)).toHaveLength(8);
  });

  test("첫 행 필드 매핑: 같은 날 시각 기간, 제목의 무료", () => {
    expect(normalize(parse(html)[0]!)).toMatchObject({
      source_id: "EQJG7Y1HF5",
      title: "[무료특강]생성형 AI로 완성하는 나만의 디지털 스토리북",
      address: "더봄센터 강의실",
      cost_type: "free", cost_amount: 0,
      course_start: "2026-10-02", course_end: "2026-10-02",
      url: "https://www.greenlove.kr/03event/s_2.php?action=view&sel_uid=EQJG7Y1HF5",
    });
  });

  test("여러 날 행사 기간, source_id 안정, URL 절대 경로", () => {
    const r = parse(html).find((x) => x.uid === "E0FHZMYP1B")!;
    expect(normalize(r)).toMatchObject({ course_start: "2026-10-16", course_end: "2026-10-25", address: expect.stringMatching(/^경기도 고양시/) });
    expect(parse(html).map((x) => x.uid)).toEqual(parse(html).map((x) => x.uid));
    for (const d of parse(html).map(normalize).filter(Boolean)) expect(d!.url).toMatch(/^https:\/\/www\.greenlove\.kr\/03event\//);
  });

  test("마켓·공연은 버리고, 모르는 분류·못 읽는 기간은 throw", () => {
    const recs = parse(html);
    expect(normalize(recs.find((x) => x.uid === "E3JKJ2ZUYX")!)).toBeNull(); // [마켓]
    expect(normalize(recs.find((x) => x.uid === "EFLS2BOKV1")!)).toBeNull(); // [문화/공연]
    expect(() => normalize({ ...recs[0]!, gubun: "9" })).toThrow("모르는 분류");
    expect(() => normalize({ ...recs[0]!, period: "기간 : 매주 화요일" })).toThrow("형식");
  });

  test("구조 없는 페이지는 throw", () => {
    expect(() => parse("<html>점검</html>")).toThrow("캘린더 없음");
  });

  test("fetchList: 이번 달·다음 달 2번만 요청, 합쳐 0건이면 throw", async () => {
    vi.useFakeTimers();
    try {
      // 요청한 달의 캘린더인 것처럼 월 표시만 바꿔 돌려준다
      const f = vi.fn(async (u: string) => {
        const q = new URL(u).searchParams;
        return new Response(html.replaceAll("[2026.10]", `[${q.get("q_year")}.${q.get("q_month")!.padStart(2, "0")}]`));
      });
      const p = greenlove.fetchList({ fetch: f as unknown as typeof fetch, env: {} as never, today: "2026-12-05" });
      await vi.runAllTimersAsync();
      expect(await p).toHaveLength(13);
      expect(f.mock.calls.map((c) => String((c as unknown[])[0]))).toEqual([calendarUrl(2026, 12), calendarUrl(2027, 1)]);
      // 다음 달 요청에 이번 달 캘린더가 오면 throw
      const wrong = greenlove.fetchList({ fetch: (async () => new Response(html)) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      wrong.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(wrong).rejects.toThrow("요청한 달이 아님 [2026.11]");
      const emptyCal = (u: string) => { const q = new URL(u).searchParams; return `<span class="Ym">[${q.get("q_year")}.${q.get("q_month")!.padStart(2, "0")}]</span><ul><li class="cal_header"></li></ul>`; };
      const empty = greenlove.fetchList({ fetch: (async (u: string) => new Response(emptyCal(u))) as unknown as typeof fetch, env: {} as never, today: "2026-10-12" });
      empty.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(empty).rejects.toThrow("0건");
    } finally {
      vi.useRealTimers();
    }
  });
});
