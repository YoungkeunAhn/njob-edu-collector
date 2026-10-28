// 제목 검색 규칙(조회 API·앱·개발 목업 공용). DB 쪽 같은 규칙: supabase/migrations/20261015000001_course_search.sql 의
// search_key()·hangul_cho() — 바꾸면 둘 다 고친다(worker/test/db.test.ts 가 두 쪽 결과를 비교한다)
import { convertQwertyToHangul, getChoseong } from "es-hangul";
import { normTitle } from "./rules";

/** 알파벳 한글 이름. "GPT"·"지피티", "AI"·"에이아이" 처럼 약어를 영어·한글 어느 쪽으로 써도 찾게 한다 */
const LETTER: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠",
  n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트",
};

/** 검색 키: normTitle(소문자·공백·기호 제거) 후 알파벳을 한글 이름으로. 제목과 검색어에 똑같이 적용한다 */
export const searchKey = (s: string) => normTitle(s).replace(/[a-z]/g, (c) => LETTER[c]!);

/** 초성 키: 검색 키의 한글 음절 초성만("챗GPT 활용" → "ㅊㅈㅍㅌㅎㅇ"). 숫자는 버린다 */
export const choseongKey = (s: string) => getChoseong(searchKey(s)).replace(/[^ㄱ-ㅎ]/g, "");

/** 검색어 길이(normTitle 기준)·원문 한도 */
export const Q_MIN = 2;
export const Q_MAX = 30;
export const Q_RAW_MAX = 100;

/** 해석한 검색어. cho 면 keys 는 초성 열(title_cho)과, 아니면 검색 키 열(search_key)과 부분 일치. keys 는 OR */
export interface Search {
  cho: boolean;
  keys: string[];
}

/**
 * 검색어 해석. 못 쓰는 검색어면 null(API 는 400, 앱은 보내지 않는다).
 * - 초성만("ㅈㅍㅌ") → 초성 검색
 * - 그 밖 → 검색 키. 영문 자판으로 친 한글("wlvlxl" → "지피티")일 수 있으면 그 키도 OR 로 더한다
 * keys 는 [가-힣0-9] 또는 [ㄱ-ㅎ] 만 — PostgREST 필터·like 와일드카드 문자가 들어갈 수 없다
 */
export function parseSearch(raw: string): Search | null {
  if (raw.length > Q_RAW_MAX) return null;
  const compact = raw.replace(/\s+/g, "");
  if (/^[ㄱ-ㅎ]+$/.test(compact)) return compact.length >= Q_MIN && compact.length <= Q_MAX ? { cho: true, keys: [compact] } : null;
  const base = normTitle(raw);
  if (base.length < Q_MIN || base.length > Q_MAX) return null;
  const keys = [searchKey(raw)];
  if (/^[a-zA-Z]+$/.test(compact)) {
    // 대소문자를 살린 원문으로 바꾼다(Shift: "Ekfk" → "따라"). 완성된 음절로만 바뀌는 경우만 오타로 본다
    // ("gpt" → "헷" 은 한 글자라 버림, "canva" → "ㅊ뭎ㅁ" 은 자모가 남아 버림)
    const typo = convertQwertyToHangul(compact);
    if (/^[가-힣]{2,}$/.test(typo) && !keys.includes(typo)) keys.push(typo);
  }
  return { cho: false, keys };
}

/** 행 하나에 검색 적용(개발 목업·테스트용. SQL 은 SupabaseReadRepo.list) */
export function matchesSearch(s: Search, title: string): boolean {
  const hay = s.cho ? choseongKey(title) : searchKey(title);
  return s.keys.some((k) => hay.includes(k));
}
