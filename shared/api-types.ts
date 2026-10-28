// 조회 API 응답 계약 (Worker ↔ 앱). 바꾸면 worker/src/api 와 app 클라이언트를 같이 고친다.

export type CourseType = "oneday" | "training";
export type CostType = "free" | "card" | "partial" | "paid";
/** 비용 필터는 확인된 분류만 선택한다. 생략하면 일부 지원·가격 미상을 포함한 전체 조회다. */
export type CostFilter = "paid" | "free" | "card";
export type Mode = "online" | "offline" | "blended";

/** course_public view 의 한 행. 날짜는 YYYY-MM-DD */
export interface CourseItem {
  id: number;
  source: string;
  /** 출처 표기 문구 (source.attribution) */
  attribution: string;
  title: string;
  course_type: CourseType;
  provider_name: string | null;
  category_main: string;
  category_sub: string | null;
  mode: Mode | null;
  sido_code: string | null;
  sigungu_code: string | null;
  address: string | null;
  cost_type: CostType | null;
  cost_amount: number | null;
  apply_start: string | null;
  apply_end: string | null;
  course_start: string | null;
  course_end: string | null;
  target: string | null;
  url: string;
  /** 원천 공식 API 의 이미지 링크(https). 없으면 앱이 분야 일러스트를 쓴다 */
  image_url: string | null;
  /** 정원(모집 인원). 원천이 주지 않으면 null */
  capacity: number | null;
}

/** 목록 정렬. 없으면 마감순 */
export type Sort = "price" | "new";

/** GET /courses — next 가 있으면 같은 조건에 cursor=next 로 다음 페이지.
 * cost=paid|free|card: cost_type 이 선택한 분류인 강좌만(생략하면 전체), sort=price|new, q=제목 검색어(띄어쓰기·기호 무시 2~30자) */
export interface CoursesResponse {
  items: CourseItem[];
  next: string | null;
}

/** 교과편성 한 줄. 세부내용·강사는 내보내지 않는다(FR-014) */
export interface CurriculumItem {
  /** 교과목 */
  subject: string;
  /** 단원 또는 NCS 능력단위명 */
  unit: string | null;
  hours: number | null;
}

/** GET /courses/:id/extra — 원천 상세에서 그때 받아 오는 값(저장 안 함). 지금은 고용24만, 그 밖은 빈 값.
 *  원천을 못 읽으면 200 + 빈 값(상세 화면이 막히지 않게) */
export interface CourseExtra {
  applicants: number | null;
  capacity: number | null;
  curriculum: CurriculumItem[];
}

/** GET /meta */
export interface MetaResponse {
  categories: { code: string; name: string; subs: { code: string; name: string }[] }[];
  sido: { code: string; name: string }[];
  sigungu: { code: string; sido: string; name: string }[];
}

/** 4xx·5xx 본문 */
export interface ApiError {
  error: string;
}
