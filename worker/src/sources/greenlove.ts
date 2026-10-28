// 주변애(greenlove.kr) 행사 월간 캘린더 — https://www.greenlove.kr/03event/index.php?q_month=M&q_year=Y (SSR). 문서: docs/02-교육소스/04-민간-커뮤니티-모임/주변애-greenlove.md
// robots.txt 는 /03event/ 를 막지 않는다. 작은 사이트라 이번 달·다음 달 2페이지만 받는다(plan 소스별 표 8행).
// 캘린더에는 총건수·모집상태가 없다: 날짜 지난 행사는 deleteExpired 가 지우고, 두 달 합쳐 0건이면 구조 변경으로 보고 throw.
import { load } from "cheerio";
import { kstToday, parseCost } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { fetchText, kdate, kurl, pause } from "./util";

export interface GreenloveRec {
  uid: string;
  href: string;
  /** 행사 분류 번호 (e_gubun_N) */
  gubun: string;
  title: string;
  /** "기간 : 2026-10-02  14:30 ~  16:30" 또는 "기간 : 2026-10-16 ~ 2026-10-25" */
  period: string;
  place: string;
}

const BASE = "https://www.greenlove.kr";
/** 분류 번호 → 강좌 후보인가. 3 교육/소모임, 4 체험, 5 기타는 넘기고 1 마켓, 2 문화공연, 6 물품대여, 7 공간대여는 뺀다 */
const GUBUN: Record<string, boolean> = { "1": false, "2": false, "3": true, "4": true, "5": true, "6": false, "7": false };
const text = (s: string) => s.replace(/\s+/g, " ").trim();

export const calendarUrl = (year: number, month: number) => `${BASE}/03event/index.php?q_month=${month}&q_year=${year}`;

/** 같은 행사가 기간 내 날짜마다 반복되므로 sel_uid 로 한 번만 담는다 */
export function parse(html: string): GreenloveRec[] {
  const $ = load(html);
  if ($("li.cal_header").length === 0) throw new Error("greenlove 캘린더 없음");
  const out = new Map<string, GreenloveRec>();
  for (const el of $("a.e_titles").toArray()) {
    const a = $(el);
    const href = a.attr("href") ?? "";
    const uid = new URL(href, BASE).searchParams.get("sel_uid") ?? "";
    if (out.has(uid)) continue;
    const box = a.find(".text_box").first();
    out.set(uid, {
      uid,
      href,
      gubun: /e_gubun_(\d+)/.exec(box.children("span").first().attr("class") ?? "")?.[1] ?? "",
      title: text(box.clone().children("span").remove().end().text()),
      period: text(box.find("span.add").text()),
      place: text(box.find("span.end").text()).replace(/^장소\s*:\s*/, ""),
    });
  }
  return [...out.values()];
}

/** 끝이 시각만 있으면("~ 16:30") 같은 날 행사 */
function period(s: string): [string | null, string | null] {
  const v = s.replace(/^기간\s*:\s*/, "");
  if (v === "") return [null, null];
  const [a, b, ...rest] = v.split("~");
  const from = kdate(a);
  const to = b !== undefined && /^\s*\d{1,2}:\d{2}\s*$/.test(b) ? from : kdate(b);
  if (rest.length || !from || !to) throw new Error(`greenlove 기간 형식 ${s.slice(0, 40)}`);
  return [from, to];
}

export function normalize(r: GreenloveRec): CourseDraft | null {
  if (!/^[A-Z0-9]{10}$/.test(r.uid) || !r.title || !r.gubun) throw new Error("greenlove 행 형식");
  const keep = GUBUN[r.gubun];
  if (keep === undefined) throw new Error(`greenlove 모르는 분류 ${r.gubun}`);
  if (!keep) return null;
  const [start, end] = period(r.period);
  const cost = parseCost(r.title);
  return {
    source_id: r.uid,
    title: r.title,
    mode: /온라인|비대면|zoom|줌/i.test(r.place) ? "online" : null,
    address: r.place || null,
    ...(cost.type ? { cost_type: cost.type, cost_amount: cost.amount } : {}),
    course_start: start,
    course_end: end,
    url: kurl(r.href, BASE)!,
  };
}

export const greenlove: Source<GreenloveRec> = {
  code: "greenlove",
  prune: false, // 캘린더에 총건수가 없어 일부 행사가 빠진 응답을 가려낼 수 없다. 행은 날짜 만료 삭제로만 지운다
  async fetchList({ fetch, today }) {
    const [y, m] = (today || kstToday()).split("-").map(Number) as [number, number];
    const months: [number, number][] = [[y, m], m === 12 ? [y + 1, 1] : [y, m + 1]];
    const seen = new Map<string, GreenloveRec>();
    for (const [i, [yy, mm]] of months.entries()) {
      if (i > 0) await pause(2000);
      const html = await fetchText(fetch, calendarUrl(yy, mm), { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } });
      const want = `[${yy}.${String(mm).padStart(2, "0")}]`;
      if (!html.includes(`class="Ym">${want}<`) && !html.includes(`class='Ym'>${want}<`)) throw new Error(`greenlove 요청한 달이 아님 ${want}`);
      for (const r of parse(html)) {
        if (!seen.has(r.uid)) seen.set(r.uid, r);
      }
    }
    if (seen.size === 0) throw new Error("greenlove 두 달 모두 0건");
    return [...seen.values()];
  },
  normalize,
};
