// 조회 API 클라이언트. 계약: shared/api-types.ts (worker/src/api 와 짝)
import type { CourseExtra, CourseItem, CoursesResponse, MetaResponse } from "../../shared/api-types";

/** 운영: Worker 주소(VITE_API_BASE). 개발: vite dev 의 목업(/api) */
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** 조회 실패의 상태를 보존한다. 404와 일시 장애를 같은 안내로 처리하지 않는다. */
export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

/** 원천 이미지를 Worker 에서 줄인 WebP 로 (worker/src/api/image.ts). w 는 160(목록)·720(상세)만 */
export const imageSrc = (url: string, w: 160 | 720) => `${BASE}/img?src=${encodeURIComponent(url)}&w=${w}`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

export const getMeta = () => get<MetaResponse>("/meta");
export const getCourses = (query: string, cursor?: string) =>
  get<CoursesResponse>(`/courses?${[query, cursor ? `cursor=${cursor}` : ""].filter(Boolean).join("&")}`);
export const getCourse = (id: string) => get<CourseItem>(`/courses/${encodeURIComponent(id)}`);
/** 원천 상세 보강(신청 인원·교과편성). 지금은 고용24만 값이 있다 */
export const getCourseExtra = (id: number) => get<CourseExtra>(`/courses/${id}/extra`);

/** 세션이 없거나 끊김(토스 연결 끊기 포함) → 다시 로그인해야 한다 */
export class AuthError extends Error {}

/** 찜 API(/me/*). 세션 토큰은 Worker 가 서명해 준 것(토스 토큰 아님) */
async function me<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export const login = (authorizationCode: string, referrer: string) =>
  me<{ token: string }>("POST", "/me/login", null, { authorizationCode, referrer }).then((r) => r.token);
export const getBookmarks = (token: string) => me<{ items: CourseItem[] }>("GET", "/me/bookmarks", token).then((r) => r.items);
export const putBookmark = (token: string, id: number) => me<null>("PUT", `/me/bookmarks/${id}`, token);
export const deleteBookmark = (token: string, id: number) => me<null>("DELETE", `/me/bookmarks/${id}`, token);
