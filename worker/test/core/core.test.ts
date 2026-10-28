import { describe, expect, test } from "vitest";
import { classify } from "../../src/core/classify";
import { toRegion } from "../../src/core/region";
import { courseType, isExpired, kstToday, normTitle, parseCost, parseKDate, shouldPrune } from "../../src/core/rules";

describe("N3 classify", () => {
  test("T3-1 챗GPT로 블로그 수익화 → blog (우선순위)", () => {
    expect(classify("챗GPT로 블로그 수익화")).toEqual({ main: "content", sub: "blog" });
  });
  test("T3-2 생성형AI 기초와 업무활용 → genai_work", () => {
    expect(classify("생성형AI 기초와 업무활용")?.sub).toBe("genai_work");
    expect(classify("ChatGPT 입문")?.sub).toBe("genai_basic"); // 다른 소분류가 없으면 genai_basic
    // 다른 소분류가 설명에만 있으면 점수로 비교: genai_basic 8 > ai_dev 1
    expect(classify("ChatGPT 클로드 생성형 AI 입문", "코딩")?.sub).toBe("genai_basic");
  });
  test("T3-1b 동점이면 정본 3절 우선순위 (video_gen > image_gen, nocode_auto > office_auto)", () => {
    expect(classify("AI 쇼츠 썸네일")?.sub).toBe("video_gen");
    expect(classify("AI n8n 엑셀")?.sub).toBe("nocode_auto");
  });
  test("T3-3 게이트 실패 → null", () => {
    expect(classify("수채화 기초")).toBeNull();
  });
  test("T3-4 영문 ai 단어 경계", () => {
    expect(classify("Maintenance 영상제작 실무")).toBeNull();
    expect(classify("AI 영상제작 실무")?.sub).toBe("video_gen");
    expect(classify("AI를 활용한 숏폼")?.sub).toBe("video_gen");
    expect(classify("ai2 영상제작")).toBeNull();
    expect(classify("_ai 영상제작")).toBeNull();
  });
  test("T3-5 제외 키워드 → null", () => {
    expect(classify("초등 AI 코딩 교실")).toBeNull();
  });
  test("T3-6 게이트 예외 on(기본)·off", () => {
    expect(classify("블로그 상위노출 전략")?.sub).toBe("blog");
    expect(classify("블로그 상위노출 전략", "", { gateException: false })).toBeNull();
  });
  test("T3-7 제목 가중치 2 > 설명 1", () => {
    // 제목 blog 1개(2점) vs 설명 vibe 1개(1점) → blog. 가중치가 같으면 우선순위로 vibe 가 이긴다
    expect(classify("AI 블로그", "바이브코딩")?.sub).toBe("blog");
    // 설명에서만 blog 3개(3점) vs 제목 cursor 1개(2점) → blog
    expect(classify("AI cursor", "블로그 티스토리 애드센스")?.sub).toBe("blog");
  });
  test("게이트만 통과하고 소분류 0점 → null (D13 노출 안 함)", () => {
    expect(classify("AI 시대의 인문학")).toBeNull();
  });
  test("설명은 앞 300자만 본다", () => {
    expect(classify("AI 특강", `${"가".repeat(300)} 쇼츠`)).toBeNull();
  });
});

describe("N3 rules", () => {
  test.each([
    ["work24", "2026-11-01", "2026-11-01", "AI 특강", "training"],
    ["seoul-yeyak", "2026-11-01", "2026-11-01", "AI 영상", "oneday"],
    ["seoul-yeyak", "2026-11-01", "2026-11-20", "AI 영상", "training"],
    ["greenlove", null, null, "생성형 AI 무료특강", "oneday"],
    ["greenlove", null, null, "AI 영상 과정", "training"],
    ["greenlove", "2026-11-01", null, "AI 세미나", "oneday"],
  ] as const)("T3-8 courseType(%s, %s, %s, %s) → %s", (src, s, e, t, want) => {
    expect(courseType(src, s, e, t)).toBe(want);
  });

  test("T3-9 isExpired KST 경계", () => {
    const today = "2026-10-11";
    expect(isExpired("2026-10-10", null, today)).toBe(true);
    expect(isExpired("2026-10-11", null, today)).toBe(false);
    expect(isExpired(null, "2026-10-10", today)).toBe(true);
    expect(isExpired(null, null, today)).toBe(false);
    expect(isExpired("2026-10-12", "2026-10-01", today)).toBe(false); // 마감일 우선
  });
  test("kstToday 는 UTC 15시 이후를 다음 날로 본다", () => {
    expect(kstToday(new Date("2026-10-11T14:59:00Z"))).toBe("2026-10-11");
    expect(kstToday(new Date("2026-10-11T15:00:00Z"))).toBe("2026-10-12");
  });

  test("T3-10 shouldPrune 경계", () => {
    expect(shouldPrune({ ok: false, fetched: 100 }, 100)).toBe(false);
    expect(shouldPrune({ ok: true, fetched: 49 }, 100)).toBe(false);
    expect(shouldPrune({ ok: true, fetched: 50 }, 100)).toBe(true);
    expect(shouldPrune({ ok: true, fetched: 0 }, null)).toBe(true);
  });

  test("T3-12 parseCost", () => {
    expect(parseCost("무료")).toEqual({ type: "free", amount: 0 });
    expect(parseCost("30,000원")).toEqual({ type: "paid", amount: 30000 });
    expect(parseCost("자부담 10%")).toEqual({ type: "card", amount: null });
    expect(parseCost("국비지원 자부담 30,000원")).toEqual({ type: "card", amount: 30000 });
    expect(parseCost("문의")).toEqual({ type: null, amount: null });
    expect(parseCost(null)).toEqual({ type: null, amount: null });
  });

  test("T3-13 normTitle", () => {
    expect(normTitle("[모집] AI 영상 (수강생 모집)")).toBe(normTitle("AI영상"));
    expect(normTitle("AI 영상 (초급)")).not.toBe(normTitle("AI 영상"));
  });

  test.each([
    ["2026-10-11", "2026-10-11"],
    ["2026.10.1", "2026-10-01"],
    ["2026/10/11 10:00", "2026-10-11"],
    ["20261011", "2026-10-11"],
    ["2026년 10월 11일(토)", "2026-10-11"],
    ["26.10.11", "2026-10-11"],
    ["2026-13-01", null],
    ["2026-02-31", null],
    ["2028-02-29", "2028-02-29"],
    ["2026-02-29", null],
    ["미정", null],
  ])("parseKDate(%s) → %s", (s, want) => {
    expect(parseKDate(s)).toBe(want);
  });
});

describe("N3 region", () => {
  test.each([
    ["경기도 수원시 팔달구 효원로 1", "41", "41110"],
    ["경기 수원시 장안구", "41", "41110"],
    ["서울특별시 종로구 세종대로 209", "11", "11110"],
    ["서울 강남구 테헤란로", "11", "11680"],
    ["인천광역시 제물포구 어딘가", "28", "28125"],
    ["인천 영종구 공항로", "28", "28155"],
    ["인천광역시 검단구", "28", "28290"],
    ["광주광역시 북구 용봉로", "12", "12300"],
    ["강원도 춘천시", "51", "51110"],
    ["세종특별자치시 한누리대로 2130", "36", "36110"],
    ["경기도 광주시 오포읍", "41", "41610"],
  ])("T3-11 toRegion(%s) → %s/%s", (addr, sido, sigungu) => {
    expect(toRegion(addr)).toEqual({ sido, sigungu });
  });
  test("시도만 맞고 시군구 모호(옛 인천 중구) → sigungu null", () => {
    expect(toRegion("인천광역시 중구 항동")).toEqual({ sido: "28", sigungu: null });
  });
  test("온라인·빈 값·모르는 주소 → null", () => {
    expect(toRegion("온라인")).toBeNull();
    expect(toRegion("")).toBeNull();
    expect(toRegion(null)).toBeNull();
  });
});
