// 찜·토스 로그인·연결 끊기 콜백·약관. 정본: docs/05-아키텍처/찜-토스로그인-마감알림.md 2.1·2.3
// 사용자별 응답이라 캐시하지 않는다(조회 API 의 caches.default 와 섞지 않는다)
import type { CourseItem } from "../../../shared/api-types";
import { corsHeaders } from "../api/handle";
import { PRIVACY, TERMS } from "./pages";
import { safeEqual, signSession, verifySession } from "./session";
import type { TossApi, TossUser } from "./toss";

/** 1인당 찜 한도 (2026-10-13 결정 Q6) */
export const MAX_BOOKMARKS = 50;

export interface MeRepo {
  upsertUser(u: TossUser): Promise<void>;
  userExists(userKey: number): Promise<boolean>;
  /** 연결 끊기: 사용자와 찜(cascade)을 지운다. 없으면 아무 일 없음 */
  deleteUser(userKey: number): Promise<void>;
  /** 찜한 강의 중 노출 중인 것, 최근 찜 순 */
  listBookmarks(userKey: number): Promise<CourseItem[]>;
  countBookmarks(userKey: number): Promise<number>;
  courseVisible(courseId: number): Promise<boolean>;
  addBookmark(userKey: number, courseId: number): Promise<void>;
  removeBookmark(userKey: number, courseId: number): Promise<void>;
}

export interface MeDeps {
  repo: MeRepo;
  toss: TossApi | null; // mTLS 바인딩이 없으면 null → 로그인 503
  sessionSecret: string | undefined;
  /** 연결 끊기 콜백이 보내는 Authorization 헤더 값 "Basic <base64(아이디:비밀번호)>". 콘솔 "Basic Auth 헤더" 칸에는 "아이디:비밀번호" 원문을 넣는다(2026-10-13 테스트로 확인) */
  unlinkAuth: string | undefined;
  limiter: { limit(o: { key: string }): Promise<{ success: boolean }> };
  allowedOrigins: string[];
}

const ME_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
/** 콘솔 "연결 끊기 콜백 → 테스트하기"는 콘솔 페이지(브라우저)에서 바로 부른다(2026-10-13 확인) */
const CONSOLE_ORIGIN = "https://apps-in-toss.toss.im";

export const isMePath = (path: string) => path.startsWith("/me/") || path === "/toss/unlink" || path === "/terms" || path === "/privacy";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (status: number, error: string) => json({ error }, status);
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });

async function unlink(req: Request, deps: MeDeps): Promise<Response> {
  if (!deps.unlinkAuth) return err(503, "콜백 인증 미설정");
  if (!safeEqual(req.headers.get("authorization") ?? "", deps.unlinkAuth)) return err(401, "인증 실패");
  let raw: unknown;
  if (req.method === "POST") raw = ((await req.json().catch(() => ({}))) as { userKey?: unknown }).userKey;
  else if (req.method === "GET") raw = new URL(req.url).searchParams.get("userKey");
  else return err(405, "GET·POST");
  const userKey = raw === "" || raw == null ? NaN : Number(raw);
  // 콘솔 "테스트하기"는 userKey 0 을 보낸다(2026-10-13 확인) — 지울 사용자가 없을 뿐 정상 응답
  if (!Number.isSafeInteger(userKey) || userKey < 0) return err(400, "userKey");
  await deps.repo.deleteUser(userKey); // 같은 콜백이 다시 와도 결과가 같다
  return json({ ok: true });
}

async function login(req: Request, deps: MeDeps): Promise<Response> {
  if (!deps.toss || !deps.sessionSecret) return err(503, "로그인 미설정");
  const b = (await req.json().catch(() => ({}))) as { authorizationCode?: unknown; referrer?: unknown };
  if (typeof b.authorizationCode !== "string" || !/^[\w.~-]{1,512}$/.test(b.authorizationCode)) return err(400, "authorizationCode");
  if (b.referrer !== "DEFAULT" && b.referrer !== "SANDBOX") return err(400, "referrer");
  let user: TossUser;
  try {
    user = await deps.toss.login(b.authorizationCode, b.referrer);
  } catch (e) {
    console.error("toss login", e instanceof Error ? e.message : e);
    return err(502, "토스 로그인 실패");
  }
  await deps.repo.upsertUser(user);
  return json({ token: await signSession(deps.sessionSecret, user.userKey) });
}

async function bookmarks(req: Request, path: string, userKey: number, deps: MeDeps): Promise<Response> {
  if (path === "/me/bookmarks") {
    if (req.method !== "GET") return err(405, "GET");
    return json({ items: await deps.repo.listBookmarks(userKey) });
  }
  const m = /^\/me\/bookmarks\/(\d{1,15})$/.exec(path);
  if (!m) return err(404, "없음");
  const courseId = Number(m[1]);
  if (req.method === "DELETE") {
    await deps.repo.removeBookmark(userKey, courseId);
    return new Response(null, { status: 204 });
  }
  if (req.method !== "PUT") return err(405, "PUT·DELETE");
  if (!(await deps.repo.courseVisible(courseId))) return err(404, "강의 없음");
  if ((await deps.repo.countBookmarks(userKey)) >= MAX_BOOKMARKS) return err(409, `찜은 ${MAX_BOOKMARKS}개까지`);
  await deps.repo.addBookmark(userKey, courseId);
  return new Response(null, { status: 204 });
}

async function route(req: Request, deps: MeDeps): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === "/terms" || path === "/privacy") return req.method === "GET" ? html(path === "/terms" ? TERMS : PRIVACY) : err(405, "GET");
  if (path === "/toss/unlink") return unlink(req, deps);

  const { success } = await deps.limiter.limit({ key: req.headers.get("cf-connecting-ip") ?? "unknown" });
  if (!success) return err(429, "요청이 너무 많습니다");
  if (path === "/me/login") return req.method === "POST" ? login(req, deps) : err(405, "POST");

  // 나머지 /me/* 는 세션 필요. 연결을 끊어 app_user 가 없으면 401 → 앱이 다시 로그인(약관 재노출)
  const token = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  const userKey = token && deps.sessionSecret ? await verifySession(deps.sessionSecret, token) : null;
  if (userKey == null || !(await deps.repo.userExists(userKey))) return err(401, "로그인 필요");
  return bookmarks(req, path, userKey, deps);
}

export async function handleMe(req: Request, deps: MeDeps): Promise<Response> {
  // CORS: 앱이 부르는 /me/*, 콘솔 테스트가 부르는 /toss/unlink. 약관 페이지는 교차 요청이 아니다
  const path = new URL(req.url).pathname;
  const origin = req.headers.get("origin");
  const headers = path.startsWith("/me/") ? corsHeaders(origin, deps.allowedOrigins, ME_METHODS)
    : path === "/toss/unlink" ? corsHeaders(origin, [CONSOLE_ORIGIN], "GET, POST, OPTIONS") : {};
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  let res: Response;
  try {
    res = await route(req, deps);
  } catch (e) {
    console.error("me", e instanceof Error ? e.message : e);
    res = err(500, "일시적인 오류");
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}
