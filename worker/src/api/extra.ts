// 상세 화면 보강: 원천 상세 페이지에서 신청 인원·교과편성을 그때 받아 온다(저장 안 함, FR-014). 정본: docs/06-스펙/plan.md D15
import type { CourseExtra, CourseItem } from "../../../shared/api-types";
import { fetchText } from "../sources/util";
import { CURRICULUM_URL, DETAIL_HOST, DETAIL_PATH, parseCurriculum, parseDetail } from "../sources/work24-detail";

const UA = { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" };
const TIMEOUT = 10_000;

export const emptyExtra = (c: Pick<CourseItem, "capacity">): CourseExtra => ({ applicants: null, capacity: c.capacity, curriculum: [] });

/** 고용24 강좌면 원천을 읽어 보강값, 그 밖은 빈 값. 원천을 못 읽으면 null(호출 쪽이 캐시하지 않는다) */
export async function courseExtra(c: CourseItem, f: typeof fetch): Promise<CourseExtra | null> {
  if (c.source !== "work24") return emptyExtra(c);
  // 우리가 수집 때 만든 링크만 부른다(임의 URL 을 대신 부르는 프록시가 되지 않게)
  const url = new URL(c.url);
  if (url.protocol !== "https:" || url.host !== DETAIL_HOST || url.pathname !== DETAIL_PATH) return emptyExtra(c);
  try {
    // redirect: manual — 3xx 는 실패로 본다(리다이렉트로 다른 호스트를 부르지 않게)
    const d = parseDetail(await fetchText(f, url.toString(), { headers: UA, redirect: "manual" }, TIMEOUT));
    if (!d?.popup) return null; // 인원 영역·교과편성 요청값을 못 찾음(없는 과정·형식 변경)
    const curriculum = parseCurriculum(await fetchText(f, CURRICULUM_URL, {
      method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" }, body: d.popup.toString(), redirect: "manual",
    }, TIMEOUT));
    if (!curriculum) return null; // 교과편성 표를 못 찾음(점검·형식 변경): 빈 값으로 6시간 굳히지 않는다
    return { applicants: d.applicants, capacity: d.capacity ?? c.capacity, curriculum };
  } catch (e) {
    console.error("extra", c.id, e instanceof Error ? e.message : e);
    return null;
  }
}
