// 화면 밖 판정 로직(순수함수). 정본: docs/06-스펙/spec.md US1·US2, FR-002·005
import type { CostFilter, CourseItem, CurriculumItem } from "../../shared/api-types";
import { parseSearch } from "../../worker/src/core/search";
export { Q_RAW_MAX } from "../../worker/src/core/search";

export interface Filters {
  /** 시도(2자리)·시군구(5자리) 코드를 쉼표로, 최대 3개. 없으면 전국 */
  region?: string;
  cat?: string;
  sub?: string;
  type?: string;
  /** "online" 이면 온라인 강좌만(지역과 같이 고르지 않는다) */
  mode?: string;
  /** paid | free | card. 생략하면 가격 미상·일부 지원을 포함한 전체 */
  cost?: string;
  /** "price" | "new". 없으면 마감순 */
  sort?: string;
  /** 제목 검색어(입력 그대로). 보낼 때만 정리한다 */
  q?: string;
}

const KEYS = ["region", "cat", "sub", "type", "mode", "cost", "sort", "q"] as const;

/** API가 지원하는 비용 분류만 허용한다. 금액 0으로 분류를 추정하지 않는다. */
export const isCostFilter = (value: unknown): value is CostFilter => value === "paid" || value === "free" || value === "card";

/** 정렬 칩. 첫 항목(마감순)이 기본값이라 쿼리에 싣지 않는다 */
export const SORTS = [{ code: "", name: "마감순" }, { code: "price", name: "가격순" }, { code: "new", name: "최신순" }];

/** 검색어를 보낼 수 있나: API 와 같은 해석(core/search parseSearch)을 통과할 때만(그래야 "!!" 같은 입력이 400 이 되지 않는다) */
export const searchable = (q: string | undefined) => parseSearch(q ?? "") !== null;

/** API 와 같은 한도(worker/src/api/handle.ts MAX_REGIONS) */
export const MAX_REGIONS = 3;

export const regionList = (f: Filters): string[] => (f.region ? f.region.split(",") : []);

/** 지역 하나 추가. 이미 있거나 한도가 차면 그대로 */
export function addRegion(f: Filters, code: string): Filters {
  const list = regionList(f);
  if (!code || list.includes(code) || list.length >= MAX_REGIONS) return f;
  return { ...f, region: [...list, code].join(","), mode: "" };
}

export function removeRegion(f: Filters, code: string): Filters {
  return { ...f, region: regionList(f).filter((c) => c !== code).join(",") };
}

/** 필터 → 쿼리 문자열. 고르지 않은 값은 보내지 않는다(빈 값을 보내면 API 가 400) */
export function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const k of KEYS) if (f[k] && (k !== "q" || searchable(f.q))) p.set(k, k === "q" ? f.q!.trim() : f[k]!);
  return p.toString();
}

export function readQuery(search: string): Filters {
  const p = new URLSearchParams(search);
  return Object.fromEntries(KEYS.filter((k) => p.get(k)).map((k) => [k, p.get(k)!]));
}

const won = (n: number) => (n % 10000 === 0 && n > 0 ? `${n / 10000}만원` : `${n.toLocaleString("ko-KR")}원`);

/** 가격 표시(FR-005). 모르면 "원문 확인" — 0원으로 보이지 않게 */
export function formatCost(c: Pick<CourseItem, "cost_type" | "cost_amount">): string {
  switch (c.cost_type) {
    case "free": return "무료";
    case "card": return c.cost_amount !== null ? `내일배움카드 자부담 ${won(c.cost_amount)}` : "내일배움카드(자부담 원문 확인)";
    case "partial": return c.cost_amount !== null ? `일부 지원 · ${won(c.cost_amount)}` : "일부 지원";
    case "paid": return c.cost_amount !== null ? `유료 ${won(c.cost_amount)}` : "유료(금액 원문 확인)";
    default: return "가격: 원문 확인";
  }
}

/** 가격 배지. 무료는 글자만, 유료는 원화 아이콘, 내일배움카드는 카드 아이콘. 가격 유형을 모르면 null */
export function priceBadge(c: Pick<CourseItem, "cost_type">): { icon: "won" | "card" | null; label: string } | null {
  switch (c.cost_type) {
    case "free": return { icon: null, label: "무료" };
    case "paid": return { icon: "won", label: "유료" };
    case "partial": return { icon: "won", label: "일부 지원" };
    case "card": return { icon: "card", label: "내일배움카드" };
    default: return null;
  }
}

const dot = (d: string) => d.replaceAll("-", ".");

/** 기간 표시. 하루짜리는 날짜 하나, 없으면 "원문 확인" */
export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "원문 확인";
  if (start && end) return start === end ? dot(start) : `${dot(start)} ~ ${dot(end)}`;
  return start ? `${dot(start)} ~` : `~ ${dot(end!)}`;
}

/** 접수 마감까지 남은 날(오늘 마감 = 0). 마감일을 모르면 null. today 는 YYYY-MM-DD(기기 날짜) */
export function daysLeft(end: string | null, today: string): number | null {
  if (!end) return null;
  return Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
}

/** 목록용 짧은 기간: 연도를 뺀다("11.02", "11.02~01.20"). 없으면 null(목록에서는 줄을 생략, 상세가 "원문 확인"을 보여준다) */
export function shortPeriod(start: string | null, end: string | null): string | null {
  const md = (d: string) => d.slice(5).replace("-", ".");
  if (!start && !end) return null;
  if (start && end) return start === end ? md(start) : `${md(start)}~${md(end)}`;
  return start ? `${md(start)}~` : `~${md(end!)}`;
}

export const TYPE_LABEL: Record<string, string> = { oneday: "원데이 클래스", training: "교육훈련" };

/** 뒤로 가기로 목록에 돌아왔을 때 다시 그릴 상태(스크롤 위치는 history 항목에). 메모리에만, 최근 조건 LIST_KEEP 개(plan D17) */
export interface ListSnapshot<T> {
  query: string;
  items: T[];
  next: string | null;
}
export const LIST_KEEP = 5;
const snapshots = new Map<string, ListSnapshot<unknown>>();

/** 목록이 바뀔 때마다 저장(상세·정렬·검색 어디로 떠나도 돌아오면 그대로) */
export function saveList<T>(s: ListSnapshot<T>): void {
  snapshots.delete(s.query);
  snapshots.set(s.query, s);
  if (snapshots.size > LIST_KEEP) snapshots.delete(snapshots.keys().next().value!);
}

/** 그 조건의 상태. 부작용 없음(StrictMode 가 초기화 함수를 두 번 불러도 같은 값) */
export function peekList<T>(query: string): ListSnapshot<T> | null {
  return (snapshots.get(query) as ListSnapshot<T> | undefined) ?? null;
}

/** 앞으로 이동해 그 조건의 목록을 새로 열 때 비운다 — 같은 조건이라도 새로 찾으면 처음부터 */
export function clearList(query: string): void {
  snapshots.delete(query);
}

/** 정원·신청 인원 한 줄. 둘 다 모르면 null(줄을 숨긴다). 0명도 보여준다 */
export function formatSeats(capacity: number | null, applicants: number | null): string | null {
  const parts = [applicants !== null && `신청 ${applicants.toLocaleString("ko-KR")}명`, capacity !== null && `정원 ${capacity.toLocaleString("ko-KR")}명`].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

/** 교과편성을 교과목별로 묶는다(같은 교과목의 단원이 이어서 온다) */
export function groupCurriculum(items: CurriculumItem[]): { subject: string; units: { name: string; hours: number | null }[] }[] {
  const out: { subject: string; units: { name: string; hours: number | null }[] }[] = [];
  for (const i of items) {
    const last = out.at(-1);
    const g = last && last.subject === i.subject ? last : (out.push({ subject: i.subject, units: [] }), out.at(-1)!);
    g.units.push({ name: i.unit ?? i.subject, hours: i.hours });
  }
  return out;
}
