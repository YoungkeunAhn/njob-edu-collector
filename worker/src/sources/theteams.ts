// 더팀스 활동 중 교육 — https://www.theteams.kr/activities/edu[/N] (SSR). 문서: docs/02-교육소스/04-민간-커뮤니티-모임/행사-이벤트-플랫폼.md "더팀스", plan 소스별 표 11행.
// robots.txt `Allow: /`. /activities 첫 화면은 대외활동·공모전·교육을 섞은 소개 화면이라 교육 탭 /activities/edu 를 받는다.
// 기본 정렬 "공고 마감순"은 마감 전 공고만 마감일 오름차순으로 준다(2026-10-12 1페이지 첫 카드 마감일 = 오늘, 51페이지 이후 0건).
// 총건수 표시가 없어 collectPages 대신 페이지 번호 줄에 "다음" 링크가 없는 페이지까지 받는다. 그 전에 빈 페이지면 throw, 전부 0건이면 throw.
// 제목에 "<AI로 칼퇴하는 법>" 같은 이스케이프 안 된 꺾쇠가 그대로 들어와 HTML 파서가 태그로 먹으므로 카드는 원문 문자열에서 정규식으로 자른다.
import { parseCost } from "../core/rules";
import type { CourseDraft, Source } from "../collect/types";
import { decodeEntities, fetchText, kdate, pause } from "./util";

export interface TheteamsRec {
  /** 상세 경로의 번호 */
  id: string;
  /** 상세 경로 끝 코드 (교육 탭: le, oe) */
  code: string;
  title: string;
  org: string;
  /** span.countdown 의 data-deadline "YYYY-MM-DD" (없으면 "") */
  deadline: string;
  /** 마감 표시 span 의 class */
  badge: string;
}

const BASE = "https://www.theteams.kr";
/** 교육 탭에서 본 상세 코드. 대외활동(la)·공모전(lc) 등이 섞이면 목록이 바뀐 것이므로 throw */
const EDU = new Set(["le", "oe"]);
const MAX_PAGES = 100;

export const listUrl = (page: number) => `${BASE}/activities/edu${page > 1 ? `/${page}` : ""}`;
const text = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

export function parse(html: string): { hasNext: boolean; recs: TheteamsRec[] } {
  if (!html.includes("content_box1") || !html.includes('<ul class="pagination">')) throw new Error("theteams 목록 영역 없음");
  const pager = /<ul class="pagination">([\s\S]*?)<\/ul>/.exec(html)![1]!;
  const recs = html.split('<div class="thumbnail card_recruit"').slice(1).map((card) => {
    const href = /<a href="\/activities\/page\/(\d+)\/([a-z]+)"/.exec(card);
    const badge = /<span class="([^"]*)"(?: data-deadline="([^"]*)")?>[^<]*<\/span>\s*<span class="dot">/.exec(card);
    return {
      id: href?.[1] ?? "",
      code: href?.[2] ?? "",
      title: text(/<h4 class="ellipsis-2 prime_section_title">([\s\S]*?)<\/h4>/.exec(card)?.[1] ?? ""),
      org: text(/<div class="t_activi_company">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ""),
      deadline: badge?.[2] ?? "",
      badge: badge?.[1] ?? "",
    };
  });
  return { hasNext: />\s*다음\s*<\/a>/.test(pager), recs };
}

export function normalize(r: TheteamsRec): CourseDraft | null {
  if (!/^\d+$/.test(r.id) || !r.code || !r.title) throw new Error("theteams 카드 형식");
  if (!EDU.has(r.code)) throw new Error(`theteams 모르는 종류 ${r.code}`);
  // 마감 전 카드는 모두 "countdown" 배지(마감일 카운트다운)다. 다른 배지는 아직 본 적이 없어 마감으로 오인하지 않고 멈춘다
  if (!r.badge.split(/\s+/).includes("countdown")) throw new Error(`theteams 모르는 상태 ${r.badge}`);
  const end = kdate(r.deadline);
  if (!end) throw new Error(`theteams 마감일 없음 ${r.id}`);
  const cost = parseCost(r.title);
  return {
    source_id: `${r.code}${r.id}`,
    title: r.title,
    provider_name: r.org || null,
    ...(cost.type ? { cost_type: cost.type, cost_amount: cost.amount } : {}),
    apply_end: end,
    url: `${BASE}/activities/page/${r.id}/${r.code}`,
  };
}

export const theteams: Source<TheteamsRec> = {
  code: "theteams",
  prune: false, // 총건수가 없어 일부 카드가 빠진 응답을 가려낼 수 없다. 행은 날짜 만료 삭제로만 지운다
  async fetchList({ fetch }) {
    const seen = new Map<string, TheteamsRec>();
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new Error(`theteams ${MAX_PAGES}페이지 초과`);
      if (page > 1) await pause(2000);
      const html = await fetchText(fetch, listUrl(page), { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } });
      const { hasNext, recs } = parse(html);
      // 빈 페이지·반복 페이지는 마지막 페이지라도 실패로 끝낸다(일부만 받고 성공하면 나머지가 정리돼 지워진다)
      if (recs.length === 0) throw new Error(`theteams 부분 응답 ${page}페이지 빈 목록`);
      const before = seen.size;
      for (const r of recs) if (!seen.has(`${r.code}${r.id}`)) seen.set(`${r.code}${r.id}`, r);
      if (seen.size === before) throw new Error(`theteams 반복 페이지 ${page}`);
      // "다음" 표기가 바뀌어도 다음 페이지 번호 링크가 있으면 계속 받는다
      if (!hasNext && !html.includes(`"${listUrl(page + 1).replace(BASE, "")}"`)) break;
    }
    if (seen.size === 0) throw new Error("theteams 0건");
    return [...seen.values()];
  },
  normalize,
};
