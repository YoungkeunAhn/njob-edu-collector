// 강좌 판정 규칙. 정본: docs/06-스펙/spec.md (FR-009, Edge Cases), plan "마감 강좌 처리", 수집-파이프라인-설계.md 4절

export type CourseType = "oneday" | "training";
export type CostType = "free" | "card" | "partial" | "paid";

const ONEDAY_WORDS = ["원데이", "특강", "세미나", "1일"];

/** 고용24 국비훈련 → 교육훈련. 시작=종료일 → 원데이. 날짜가 없으면 제목 키워드. */
export function courseType(source: string, start: string | null, end: string | null, title: string): CourseType {
  if (source === "work24") return "training";
  if (start && end) return start === end ? "oneday" : "training";
  return ONEDAY_WORDS.some((w) => title.includes(w)) ? "oneday" : "training";
}

/** KST 기준 오늘 (YYYY-MM-DD) */
export const kstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** 접수 마감일(없으면 교육 시작일)이 오늘보다 앞이면 마감. 둘 다 없으면 마감 아님. */
export function isExpired(applyEnd: string | null, courseStart: string | null, today: string): boolean {
  const d = applyEnd ?? courseStart;
  return d !== null && d < today;
}

/** 원천에서 사라진 행을 지워도 되나: 수집 성공 + 직전 성공 건수의 50% 이상 */
export function shouldPrune(run: { ok: boolean; fetched: number }, prevOkFetched: number | null): boolean {
  if (!run.ok) return false;
  return prevOkFetched === null || run.fetched * 2 >= prevOkFetched;
}

/** 중복 판정용 제목: [모집]·(수강생 모집) 같은 모집 안내 괄호 제거 → 소문자 → 공백·특수문자 제거 */
export function normTitle(title: string): string {
  return title
    .replace(/[[(【<][^\])】>]*(모집|접수|신청|선착순|마감)[^\])】>]*[\])】>]/g, "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
}

/** "2026-10-11", "2026.10.11", "2026/10/11", "20261011", "2026년 10월 11일", "26.10.11" → "2026-10-11" */
export function parseKDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m =
    s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/) ??
    s.match(/(\d{4})(\d{2})(\d{2})/) ??
    s.match(/(?<!\d)(\d{2})\.(\d{1,2})\.(\d{1,2})(?!\d)/);
  if (!m) return null;
  const y = m[1]!.length === 2 ? `20${m[1]}` : m[1]!;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // 2026-02-31 같은 없는 날짜는 Date 가 다음 달로 넘기므로 왕복 비교로 거른다
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

/** 가격 문구 → 비용 유형·금액(원). 모르면 둘 다 null. */
export function parseCost(s: string | null | undefined): { type: CostType | null; amount: number | null } {
  if (!s) return { type: null, amount: null };
  const won = s.match(/([\d,]+)\s*원/);
  const amount = won ? Number(won[1]!.replace(/,/g, "")) : null;
  if (/무료/.test(s) || amount === 0) return { type: "free", amount: 0 };
  if (/내일배움|국비|자부담|훈련비/.test(s)) return { type: "card", amount };
  if (amount !== null) return { type: "paid", amount };
  return { type: null, amount: null };
}
