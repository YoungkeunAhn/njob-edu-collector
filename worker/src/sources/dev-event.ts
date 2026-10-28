// 데브이벤트(Dev-Event) — GitHub README 1개 파일. https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md (기본 브랜치 master)
// 문서: docs/02-교육소스/04-민간-커뮤니티-모임/행사-이벤트-플랫폼.md "데브이벤트", plan 소스별 표 9행.
// raw.githubusercontent.com 은 robots.txt 가 없다(404). 요청 1번.
// README 의 "## `26년 10월`" 같은 월별 절만 읽고, 이번 달 이후 절만 남긴다(fetchList). 항목에 모집 상태는 없다:
// 기간 지난 항목은 deleteExpired 가 지우고, 남길 절이 0건이면 구조 변경으로 보고 throw.
// 항목에 사이트 번호가 없어 행사 원문 링크를 source_id 로 쓴다(README 안에서 고유함을 확인, 2026-10-12).
import { kstToday } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { fetchText, kdate, kurl } from "./util";

export interface DevEventRec {
  /** 월별 절 "YYYY-MM" */
  ym: string;
  title: string;
  href: string;
  /** 분류 태그: "온라인", "오프라인(서울 강남구)", "무료", "세미나", "AI" … */
  tags: string[];
  host: string;
  /** "접수" = 신청 기간, "일시" = 행사 기간 */
  kind: string;
  /** "09. 28(월) ~ 10. 08(목) 14:00" 또는 "11. 28(토)" */
  when: string;
}

export const README_URL = "https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md";

const ITEM = /^- __\[(.+)\]\((\S+)\)__\s*$/;
const FIELD = /^ {2}- ([^:]+):\s*(.*)$/;

export function parse(md: string): DevEventRec[] {
  const out: DevEventRec[] = [];
  let ym: string | null = null;
  let sections = 0;
  let cur: DevEventRec | null = null;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const m = /^## `(\d{2})년 (\d{1,2})월`/.exec(line);
      // 월 제목처럼 보이는데 못 읽으면 그 절 전체를 조용히 건너뛰지 않고 throw
      if (!m && /\d+\s*년|\d+\s*월/.test(line)) throw new Error(`dev-event 월 제목 형식 ${line.slice(0, 40)}`);
      ym = m ? `20${m[1]}-${m[2]!.padStart(2, "0")}` : null;
      if (m) sections++;
      cur = null;
      continue;
    }
    if (!ym) continue;
    const it = ITEM.exec(line);
    if (it) {
      cur = { ym, title: it[1]!.trim(), href: it[2]!, tags: [], host: "", kind: "", when: "" };
      out.push(cur);
      continue;
    }
    if (line.startsWith("- ")) throw new Error(`dev-event 항목 형식 ${line.slice(0, 40)}`);
    const f = FIELD.exec(line);
    if (!f) continue;
    if (!cur) throw new Error(`dev-event 항목 밖 필드 ${line.slice(0, 40)}`);
    const [, key, val] = f as unknown as [string, string, string];
    if (key === "분류") cur.tags = [...val.matchAll(/`([^`]+)`/g)].map((x) => x[1]!.trim());
    else if (key === "주최") cur.host = val.trim();
    else if (key === "접수" || key === "일시") [cur.kind, cur.when] = [key, val.trim()];
    else throw new Error(`dev-event 모르는 필드 ${key}`);
  }
  if (sections === 0) throw new Error("dev-event 월별 목록 없음");
  return out;
}

/** "10. 08(목) 14:00" → YYYY-MM-DD. 연도는 절의 연도에서 6개월 넘게 떨어지면 앞뒤 해로 본다 */
function day(s: string, ym: string): string | null {
  const m = /^\s*(\d{1,2})\.\s*(\d{1,2})\([월화수목금토일]\)(\s+\d{1,2}:\d{2})?\s*$/.exec(s);
  if (!m) throw new Error(`dev-event 날짜 형식 ${s.slice(0, 30)}`);
  const [y, sm] = ym.split("-").map(Number) as [number, number];
  const mo = Number(m[1]);
  const year = mo - sm > 6 ? y - 1 : sm - mo > 6 ? y + 1 : y;
  return kdate(`${year}-${mo}-${m[2]}`);
}

export function normalize(r: DevEventRec): CourseDraft | null {
  if (!r.title || !r.href || !/^\d{4}-\d{2}$/.test(r.ym) || r.tags.length === 0 || !r.kind || !r.when) throw new Error("dev-event 항목 형식");
  const [a, b, ...rest] = r.when.split("~");
  if (rest.length) throw new Error(`dev-event 기간 형식 ${r.when.slice(0, 40)}`);
  const from = day(a!, r.ym);
  const to = b === undefined ? from : day(b, r.ym);
  const online = r.tags.includes("온라인");
  const offline = r.tags.filter((t) => t.startsWith("오프라인"));
  const place = /^오프라인\((.+)\)$/.exec(offline[0] ?? "")?.[1]?.trim() ?? null;
  const cost = r.tags.includes("무료") ? { cost_type: "free" as const, cost_amount: 0 } : r.tags.includes("유료") ? { cost_type: "paid" as const, cost_amount: null } : {};
  const url = kurl(r.href);
  if (!url) throw new Error("dev-event 링크 없음");
  return {
    source_id: url,
    title: r.title,
    desc: r.tags.filter((t) => !/^(온라인|오프라인|무료|유료)/.test(t)).join(" "),
    provider_name: r.host || null,
    mode: online && offline.length ? "blended" : online ? "online" : offline.length ? "offline" : null,
    address: place,
    ...cost,
    ...(r.kind === "접수" ? { apply_start: from, apply_end: to } : { course_start: from, course_end: to }),
    url,
  };
}

export const devEvent: Source<DevEventRec> = {
  code: "dev-event",
  prune: false, // README 에 총건수가 없어 일부 항목이 빠진 응답을 가려낼 수 없다. 행은 날짜 만료 삭제로만 지운다
  async fetchList({ fetch, today }) {
    const month = (today || kstToday()).slice(0, 7);
    const recs = parse(await fetchText(fetch, README_URL, { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } })).filter((r) => r.ym >= month);
    if (recs.length === 0) throw new Error("dev-event 이번 달 이후 0건");
    return recs;
  },
  normalize,
};
