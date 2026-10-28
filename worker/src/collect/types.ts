import type { Main, Sub } from "../core/classify";
import type { CostType, CourseType } from "../core/rules";
import type { Env } from "../env";

/** 어댑터가 원천 레코드 1건을 정규화한 결과. 날짜는 YYYY-MM-DD(parseKDate 로 변환해서 넣는다). */
export interface CourseDraft {
  source_id: string;
  title: string;
  /** 분류에만 쓰고 저장하지 않는다(설명문 전문 저장 금지, FR-014) */
  desc?: string;
  provider_name?: string | null;
  mode?: "online" | "offline" | "blended" | null;
  address?: string | null;
  /** 어댑터가 지역 코드를 직접 알면 넣는다. 없으면 address 로 매핑한다 */
  region?: { sido: string; sigungu: string | null } | null;
  cost_type?: CostType | null;
  cost_amount?: number | null;
  apply_start?: string | null;
  apply_end?: string | null;
  course_start?: string | null;
  course_end?: string | null;
  target?: string | null;
  capacity?: number | null;
  url: string;
  /** 공식 API 가 주는 이미지 https 링크만. 이미지 파일은 저장하지 않는다(FR-014) */
  image_url?: string | null;
}

/** course 테이블 1행 (supabase/migrations 의 컬럼과 같다. id·last_seen_at·category_by 는 DB 가 채운다).
 *  원천 원본(raw)·설명문·강사명·연락처는 넣지 않는다 (FR-014). */
export interface CourseRow {
  source: string;
  source_id: string;
  title: string;
  title_norm: string;
  course_type: CourseType;
  provider_name: string | null;
  category_main: Main | null;
  category_sub: Sub | null;
  mode: "online" | "offline" | "blended" | null;
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
  capacity: number | null;
  url: string;
  image_url: string | null;
}

export interface FetchCtx {
  fetch: typeof fetch;
  env: Env;
  today: string;
}

/** 소스 어댑터 = 파일 1개. fetchList 는 네트워크, normalize 는 순수함수(픽스처로 테스트).
 *  normalize: 읽을 수 없는 레코드는 throw(그 실행은 정리를 건너뛴다), 강좌가 아니라 일부러 빼는 레코드는 null
 *  (DB 에 있던 행이면 정리 대상이 맞다. 전부 null 이면 건수 급감으로 잡힌다). */
export interface Source<R = unknown> {
  code: string;
  /** false 면 "원천에서 사라진 행" 정리를 하지 않는다. 원천의 전체 목록을 확인할 수 없는 소스(첫 묶음만 받음·총건수 없음)용.
   *  이런 소스의 행은 마감일(없으면 시작일) 기준 만료 삭제로만 지워진다. */
  prune?: boolean;
  fetchList(ctx: FetchCtx): Promise<R[]>;
  normalize(rec: R): CourseDraft | null;
}

export interface RunRecord {
  source: string;
  started_at: string;
  finished_at: string;
  ok: boolean;
  fetched: number;
  upserted: number;
  error: string | null;
}

/** 수집 쪽 DB 연산. 실구현은 SupabaseRepo, 테스트는 가짜. */
export interface Repo {
  prevOkFetched(source: string): Promise<number | null>;
  /** last_seen_at = seenAt 으로 upsert, 반영 건수 반환 */
  upsertCourses(rows: CourseRow[], seenAt: string): Promise<number>;
  /** 이번 수집에서 안 보인 행(last_seen_at < seenAt) 삭제, 삭제 건수 반환 */
  pruneUnseen(source: string, seenAt: string): Promise<number>;
  /** 접수 마감일(없으면 교육 시작일) < today 인 행 삭제, 삭제 건수 반환 */
  deleteExpired(today: string): Promise<number>;
  recordRun(run: RunRecord): Promise<void>;
}

export interface Deps {
  repo: Repo;
  fetch: typeof fetch;
  env: Env;
  now: () => Date;
  notify: (text: string) => Promise<void>;
}
