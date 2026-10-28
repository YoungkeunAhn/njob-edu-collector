// 서울시 공공서비스예약 교육 (ListPublicReservationEducation). 문서: docs/03-데이터수집/공공-OpenAPI-목록.md 3절
import type { CourseDraft, Source } from "../collect/types";
import { collectPages, decodeEntities, fetchText, imageUrl, kdate, num, stripTags } from "./util";

export interface SeoulRow {
  SVCID: string;
  SVCNM: string;
  SVCSTATNM: string;
  MINCLASSNM?: string;
  PAYATNM?: string;
  PLACENM?: string;
  USETGTINFO?: string;
  SVCURL: string;
  SVCOPNBGNDT?: string;
  SVCOPNENDDT?: string;
  RCPTBGNDT?: string;
  RCPTENDDT?: string;
  AREANM?: string;
  DTLCONT?: string;
  IMGURL?: string;
}

const SVC = "ListPublicReservationEducation";
const STEP = 1000;

/** 응답 본문 → 행. INFO-200(데이터 없음)은 빈 배열, 그 밖의 오류 코드는 throw */
export function parse(body: string): { total: number | null; rows: SeoulRow[] } {
  // 키·범위 오류는 JSON 이 아니라 XML(<RESULT><CODE>…)로 온다
  if (body.trimStart().startsWith("<")) throw new Error(`seoul ${/<CODE>([^<]*)/.exec(body)?.[1] ?? "XML 응답"}`);
  const j = JSON.parse(body) as Record<string, { list_total_count: number; RESULT: { CODE: string; MESSAGE: string }; row: SeoulRow[] } | undefined> & { RESULT?: { CODE: string; MESSAGE: string } };
  const svc = j[SVC];
  if (!svc) {
    if (j.RESULT?.CODE === "INFO-200") return { total: 0, rows: [] };
    throw new Error(`seoul ${j.RESULT?.CODE ?? "응답 형식"} ${j.RESULT?.MESSAGE ?? ""}`.trim());
  }
  if (svc.RESULT.CODE !== "INFO-000") throw new Error(`seoul ${svc.RESULT.CODE} ${svc.RESULT.MESSAGE}`);
  return { total: num(svc.list_total_count), rows: svc.row ?? [] };
}

export function normalize(r: SeoulRow): CourseDraft | null {
  if (!r.SVCID || !r.SVCNM || !r.SVCSTATNM) throw new Error("seoul 행 형식"); // 빠진 상태값을 '마감'으로 오인하지 않는다
  if (r.SVCSTATNM === "접수중") return draft(r); // 모집 중 필터 (plan 소스별 표 2행)
  if (CLOSED.has(r.SVCSTATNM)) return null;
  // 처음 보는 상태값을 마감으로 오인하면 정리에서 지워진다. 실패로 남겨 알림을 받고 목록에 추가한다
  throw new Error(`seoul 모르는 상태 ${r.SVCSTATNM}`);
}

/** 접수중이 아닌 것으로 알려진 상태값 */
const CLOSED = new Set(["접수종료", "예약마감", "마감", "안내중", "접수대기", "예약일시중지", "일시중지"]);

function draft(r: SeoulRow): CourseDraft {
  return {
    source_id: r.SVCID,
    title: decodeEntities(r.SVCNM).trim(),
    desc: `${r.MINCLASSNM ?? ""} ${stripTags(r.DTLCONT)}`,
    provider_name: r.PLACENM?.split(">")[0]?.trim() || null,
    mode: "offline",
    address: r.AREANM ? `서울특별시 ${r.AREANM}` : "서울특별시",
    cost_type: r.PAYATNM === "무료" ? "free" : r.PAYATNM === "유료" ? "paid" : null,
    cost_amount: r.PAYATNM === "무료" ? 0 : null,
    apply_start: kdate(r.RCPTBGNDT),
    apply_end: kdate(r.RCPTENDDT),
    course_start: kdate(r.SVCOPNBGNDT),
    course_end: kdate(r.SVCOPNENDDT),
    target: r.USETGTINFO?.trim() || null,
    url: new URL(r.SVCURL).toString(),
    image_url: imageUrl(r.IMGURL),
  };
}

export const seoulYeyak: Source<SeoulRow> = {
  code: "seoul-yeyak",
  async fetchList({ fetch, env }) {
    if (!env.SEOUL_API_KEY) throw new Error("SEOUL_API_KEY 없음");
    const key = env.SEOUL_API_KEY;
    return collectPages("seoul", async (page) => {
      const start = (page - 1) * STEP + 1;
      return parse(await fetchText(fetch, `http://openapi.seoul.go.kr:8088/${key}/json/${SVC}/${start}/${start + STEP - 1}/`));
    }, { key: (r) => r.SVCID, maxPages: 20, gapMs: 1000 });
  },
  normalize,
};
