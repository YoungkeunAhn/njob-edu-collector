// 제목 검색(2026-10-15, plan.md API q): 약어 한글 이름·초성·영타 검색
import { describe, expect, test } from "vitest";
import { choseongKey, matchesSearch, parseSearch, searchKey } from "../../src/core/search";

describe("F7 제목 검색 규칙", () => {
  test("T7-1 알파벳은 한글 이름으로: GPT 와 지피티가 같은 키", () => {
    expect(searchKey("챗GPT 활용")).toBe("챗지피티활용");
    expect(searchKey("챗 지피티 활용")).toBe("챗지피티활용");
    expect(searchKey("AI 영상")).toBe(searchKey("에이아이 영상"));
    expect(searchKey("Z세대")).not.toBe(searchKey("G세대")); // z·g 이름이 겹치지 않는다
  });

  test.each([
    ["지피티", "ChatGPT로 블로그 쓰기"],
    ["GPT", "챗지피티 업무 자동화"],
    ["gpt", "챗GPT 실무"],
    ["ㅈㅍㅌ", "챗GPT 실무"], // 초성
    ["ㅂㄹㄱ", "블로그 글쓰기"],
    ["wlvlxl", "챗GPT 실무"], // 영문 자판으로 친 "지피티"
    ["dudtkd", "AI 영상 만들기"], // "영상"
    ["Ekfkgkrl", "따라하기 AI"], // Shift 로 친 쌍자음(ㄸ)
  ])("T7-2 '%s' 로 '%s' 를 찾는다", (q, title) => {
    expect(matchesSearch(parseSearch(q)!, title)).toBe(true);
  });

  test.each([
    ["지피티", "블로그 글쓰기"],
    ["ㅈㅍㅌ", "블로그 글쓰기"],
    ["영상", "블로그 글쓰기"],
  ])("T7-3 '%s' 로 '%s' 는 안 찾는다", (q, title) => {
    expect(matchesSearch(parseSearch(q)!, title)).toBe(false);
  });

  test("T7-4 해석: 초성·영타 후보·못 쓰는 검색어", () => {
    expect(parseSearch("ㅈ ㅍ ㅌ")).toEqual({ cho: true, keys: ["ㅈㅍㅌ"] });
    expect(parseSearch("wlvlxl")).toEqual({ cho: false, keys: ["더블유엘브이엘엑스엘", "지피티"] });
    expect(parseSearch("gpt")).toEqual({ cho: false, keys: ["지피티"] }); // "헷"(한 글자)은 오타 후보로 안 본다
    expect(parseSearch("canva")!.keys).toHaveLength(1); // "ㅊ뭎ㅁ" 처럼 자모가 남으면 오타가 아니다
    for (const bad of ["a", "ㅈ", "!!", "가".repeat(31), "ㅈ".repeat(31), "영상" + "!".repeat(99)]) expect(parseSearch(bad), bad).toBeNull();
  });

  test("T7-5 키에는 PostgREST 필터·like 와일드카드 문자가 없다", () => {
    for (const q of ["a_b*c,d)(e.f", "100% 무료", "ㄱㄴ", "wlvlxl"]) for (const k of parseSearch(q)!.keys) expect(k).toMatch(/^([가-힣0-9]+|[ㄱ-ㅎ]+)$/);
  });

  test("T7-6 초성 키는 한글 음절 초성만", () => {
    expect(choseongKey("챗GPT 2기 활용")).toBe("ㅊㅈㅍㅌㄱㅎㅇ");
  });
});
