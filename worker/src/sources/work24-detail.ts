// 고용24 훈련과정 상세 페이지 파서 — 조회 API 상세 보강(/courses/:id/extra)용. 수집에는 쓰지 않는다.
// 앱 타입체크가 이 파일을 거쳐 가므로 Workers 전용 타입(collect/types → env)을 import 하지 않는다
import { load } from "cheerio";
import type { CurriculumItem } from "../../../shared/api-types";

export const DETAIL_HOST = "www.work24.go.kr";
export const DETAIL_PATH = "/hr/a/a/3100/selectTracseDetl.do";

const text = (s: string) => s.replace(/\s+/g, " ").trim();

export const CURRICULUM_URL = `https://${DETAIL_HOST}/hr/a/a/3100/selectCurriculum.do`;
/** 교과편성 팝업(fn_PopOpen)이 보내는 값. 이 키만 옮긴다 */
const POPUP_KEYS = ["hpgYn", "tracseId", "tracseTme", "ncsYn", "pssrpYear", "pssrpTme", "spclizTracseKndCd", "crseTracseSe", "mainTracseSe"];

const persons = (s: string) => (/^[\d,]+\s*명$/.test(s.trim()) ? Number(s.replace(/[^\d]/g, "")) : null);

/** 훈련과정 상세(selectTracseDetl.do) → 신청·모집 인원과 교과편성 팝업 요청값. 인원 영역이 없으면(없는 과정·점검 페이지) null */
export function parseDetail(html: string): { applicants: number | null; capacity: number | null; popup: URLSearchParams | null } | null {
  const $ = load(html);
  const counts = new Map($(".count").toArray().map((el) => [text($(el).contents().first().text()), persons($(el).find("strong").text())] as const));
  if (!counts.has("모집인원")) return null;
  const fn = /function\s+fn_PopOpen\s*\(\s*\)\s*\{[\s\S]*?\}/.exec(html)?.[0] ?? "";
  const vals = new Map([...fn.matchAll(/"(\w+)":\s*(['"])([^'"]*)\2/g)].map((m) => [m[1]!, m[3]!])); // "hpgYn": "Y", "tracseId": '…' 둘 다
  const popup = vals.get("tracseId") ? new URLSearchParams(POPUP_KEYS.map((k) => [k, vals.get(k) ?? ""])) : null;
  return { applicants: counts.get("수강신청인원") ?? null, capacity: counts.get("모집인원") ?? null, popup };
}

/** 교과편성 팝업 → 교과목·단원(NCS 능력단위명)·시간. 열은 머리글 이름으로 고른다 — 세부내용(FR-014 설명문)·강사 열은 읽지 않는다.
 *  입학식·수료식 같은 재량교과는 뺀다. "교과목" 머리글 표가 하나도 없으면(점검·형식 변경) null */
export function parseCurriculum(html: string): CurriculumItem[] | null {
  const $ = load(html);
  const out: CurriculumItem[] = [];
  let found = false;
  $("table").each((_, table) => {
    // 머리글을 colspan 만큼 펼친다: NCS 표는 "NCS 능력단위(요소)" 가 코드·이름 두 칸
    const cols = $(table).find("thead th").toArray().flatMap((th) => Array<string>(Number($(th).attr("colspan") ?? 1)).fill(text($(th).text())));
    if (cols[0] !== "교과목") return;
    found = true;
    const ncs = cols.findIndex((c) => c.startsWith("NCS 능력단위"));
    // 능력단위 머리글이 두 칸(코드·이름)으로 펼쳐졌을 때만 뒤 칸, 한 칸이면 그 칸
    const unitAt = ncs >= 0 ? (cols[ncs + 1] === cols[ncs] ? ncs + 1 : ncs) : cols.findIndex((c) => c === "단원" || c === "단원명");
    const hourAt = cols.flatMap((c, i) => (c.endsWith("시간") ? [i] : []));
    $(table).find("tbody tr").each((_, tr) => {
      const cells = $(tr).find("td").toArray().map((td) => text($(td).text()));
      if (cells.length !== cols.length || !cells[0] || cells[0] === "재량교과") return; // "해당 데이터가 없습니다"(한 칸)·합계 줄도 여기서 빠진다
      const hours = hourAt.map((i) => /^(\d+)\s*시간$/.exec(cells[i]!)?.[1]).filter((h) => h !== undefined).map(Number);
      out.push({ subject: cells[0].slice(0, 60), unit: unitAt >= 0 ? cells[unitAt]!.slice(0, 60) || null : null, hours: hours.length ? hours.reduce((a, b) => a + b, 0) : null });
    });
  });
  return found ? out.slice(0, 50) : null;
}
