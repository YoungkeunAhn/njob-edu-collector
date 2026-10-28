import { describe, expect, test } from "vitest";
import { addRegion, buildQuery, clearList, daysLeft, formatSeats, groupCurriculum, LIST_KEEP, formatCost, formatPeriod, peekList, priceBadge, readQuery, saveList, searchable, shortPeriod, SORTS } from "../src/logic";

describe("N10 앱 로직", () => {
  test.each(["paid", "free", "card"])("비용 %s 조건은 검색·정렬·목록 복원용 쿼리에 유지된다", (cost) => {
    const filters = { region: "11", cat: "genai", cost, sort: "price", q: "AI 기초" };
    expect(readQuery(buildQuery(filters))).toEqual(filters);
    expect(buildQuery({ cost: "" })).toBe("");
  });
  test("T10-1 필터 → 쿼리: 고르지 않은 값은 빼고 정해진 순서로", () => {
    expect(buildQuery({ type: "oneday", cat: "video", region: "41110,11" })).toBe("region=41110%2C11&cat=video&type=oneday");
    expect(buildQuery({ region: "", cat: "video" })).toBe("cat=video");
    expect(buildQuery({})).toBe("");
    expect(readQuery("?region=41%2C11&cat=video&x=1")).toEqual({ region: "41,11", cat: "video" });
  });

  test("지역은 최대 3개, 중복·빈 값은 넣지 않는다", () => {
    let f = addRegion({}, "11");
    f = addRegion(f, "41110");
    expect(addRegion(f, "11")).toBe(f);
    expect(addRegion(f, "")).toBe(f);
    f = addRegion(f, "26");
    expect(f.region).toBe("11,41110,26");
    expect(addRegion(f, "27")).toBe(f);
  });

  test("T10-3 가격 표시", () => {
    expect(formatCost({ cost_type: "free", cost_amount: 0 })).toBe("무료");
    expect(formatCost({ cost_type: "card", cost_amount: 30000 })).toBe("내일배움카드 자부담 3만원");
    expect(formatCost({ cost_type: "card", cost_amount: 34310 })).toBe("내일배움카드 자부담 34,310원");
    expect(formatCost({ cost_type: "paid", cost_amount: null })).toBe("유료(금액 원문 확인)");
    expect(formatCost({ cost_type: null, cost_amount: null })).toBe("가격: 원문 확인");
  });

  test("기간 표시", () => {
    expect(formatPeriod("2026-10-20", "2026-10-20")).toBe("2026.10.20");
    expect(formatPeriod("2026-10-20", "2026-11-01")).toBe("2026.10.20 ~ 2026.11.01");
    expect(formatPeriod(null, null)).toBe("원문 확인");
    expect(formatPeriod(null, "2026-11-01")).toBe("~ 2026.11.01");
  });

  test("목록용 짧은 기간", () => {
    expect(shortPeriod("2026-11-02", "2026-11-02")).toBe("11.02");
    expect(shortPeriod("2026-11-02", "2027-01-20")).toBe("11.02~01.20");
    expect(shortPeriod(null, "2026-11-01")).toBe("~11.01");
    expect(shortPeriod(null, null)).toBe(null);
  });

  test("마감까지 남은 날", () => {
    expect(daysLeft("2026-10-13", "2026-10-13")).toBe(0);
    expect(daysLeft("2026-10-16", "2026-10-13")).toBe(3);
    expect(daysLeft("2026-11-01", "2026-10-31")).toBe(1);
    expect(daysLeft(null, "2026-10-13")).toBe(null);
  });

  test("가격 배지", () => {
    expect(priceBadge({ cost_type: "free" })).toEqual({ icon: null, label: "무료" });
    expect(priceBadge({ cost_type: "paid" })).toEqual({ icon: "won", label: "유료" });
    expect(priceBadge({ cost_type: "partial" })).toEqual({ icon: "won", label: "일부 지원" });
    expect(priceBadge({ cost_type: "card" })).toEqual({ icon: "card", label: "내일배움카드" });
    expect(priceBadge({ cost_type: null })).toBe(null);
  });

  test("T3-1 정렬·검색 쿼리 왕복, 마감순(기본)은 보내지 않는다", () => {
    const f = { cat: "video", sort: "price", q: "AI 영상" };
    expect(buildQuery(f)).toBe("cat=video&sort=price&q=AI+%EC%98%81%EC%83%81");
    expect(readQuery(`?${buildQuery(f)}`)).toEqual(f);
    expect(buildQuery({ sort: "" })).toBe("");
  });

  test("T3-2 검색어: 앞뒤 공백은 자르고, 띄어쓰기·기호를 뺀 길이가 2~30자일 때만 보낸다(API 400 방지)", () => {
    expect(buildQuery({ q: "  영상  " })).toBe("q=%EC%98%81%EC%83%81");
    for (const bad of ["a", " a ", "!!", "a!", "가".repeat(31), "", "영상" + "!".repeat(99)]) expect(buildQuery({ q: bad }), bad).toBe("");
    expect(searchable("챗 G")).toBe(true);
    expect(buildQuery({ q: "ㅈㅍㅌ" })).toBe("q=%E3%85%88%E3%85%8D%E3%85%8C"); // 초성 검색도 보낸다
    expect(searchable("가".repeat(30) + " !")).toBe(true);
  });

  test("T3-3 목록 상태: 조건별로 꺼내고, 여러 번 읽어도 같고, 그 조건만 비운다, 최근 LIST_KEEP 개", () => {
    const s = { query: "cat=video", items: [1, 2], next: "20" };
    const t = { query: "cat=genai", items: [3], next: null };
    saveList(s);
    saveList(t);
    expect(peekList("cat=video")).toBe(s);
    expect(peekList("cat=video")).toBe(s); // StrictMode 가 초기화 함수를 두 번 불러도 같은 값
    expect(peekList("cat=genai")).toBe(t);
    clearList("cat=video");
    expect([peekList("cat=video"), peekList("cat=genai")]).toEqual([null, t]);
    for (let i = 0; i < LIST_KEEP; i++) saveList({ query: `q${i}`, items: [], next: null });
    expect(peekList("cat=genai")).toBeNull(); // 가장 오래된 것부터 버린다
    expect(peekList(`q${LIST_KEEP - 1}`)).not.toBeNull();
  });

  test("T4-1 정원·신청 인원 줄: 0명도 보이고, 둘 다 모르면 줄 없음", () => {
    expect(formatSeats(20, null)).toBe("정원 20명");
    expect(formatSeats(20, 1)).toBe("신청 1명 / 정원 20명");
    expect(formatSeats(20, 0)).toBe("신청 0명 / 정원 20명");
    expect(formatSeats(null, 3)).toBe("신청 3명");
    expect(formatSeats(2500, null)).toBe("정원 2,500명");
    expect(formatSeats(null, null)).toBeNull();
  });

  test("T4-2 커리큘럼은 이어지는 같은 교과목끼리 묶고, 단원이 없으면 교과목 이름", () => {
    expect(groupCurriculum([
      { subject: "A", unit: "a1", hours: 6 }, { subject: "A", unit: "a2", hours: null }, { subject: "B", unit: null, hours: 30 },
    ])).toEqual([
      { subject: "A", units: [{ name: "a1", hours: 6 }, { name: "a2", hours: null }] },
      { subject: "B", units: [{ name: "B", hours: 30 }] },
    ]);
  });
});

test("003 T1 정렬 칩: 이름은 최신순, 코드값 new 는 그대로(API 계약)", () => {
  expect(SORTS).toEqual([{ code: "", name: "마감순" }, { code: "price", name: "가격순" }, { code: "new", name: "최신순" }]);
});
