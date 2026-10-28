// 찜·토스 로그인·연결 끊기·마감 알림. 정본: docs/05-아키텍처/찜-토스로그인-마감알림.md
import { describe, expect, test } from "vitest";
import type { CourseItem } from "../../../shared/api-types";
import { handleMe, MAX_BOOKMARKS, type MeDeps, type MeRepo } from "../../src/me/handle";
import { sendDeadlinePush, type DueRepo } from "../../src/me/push";
import { signSession, verifySession } from "../../src/me/session";
import type { TossApi, TossUser } from "../../src/me/toss";
import { freshDb, kstDay } from "../pg";

const APP = "https://njob-matching.apps.tossmini.com";
const SECRET = "test-secret";
const UNLINK = "Basic dG9zczpwdw==";

class FakeRepo implements MeRepo {
  users = new Map<number, TossUser>();
  marks = new Map<number, number[]>();
  visible = new Set([1, 2, 3]);
  async upsertUser(u: TossUser) { this.users.set(u.userKey, u); }
  async userExists(k: number) { return this.users.has(k); }
  async deleteUser(k: number) { this.users.delete(k); this.marks.delete(k); }
  async listBookmarks(k: number) { return (this.marks.get(k) ?? []).map((id) => ({ id }) as CourseItem); }
  async countBookmarks(k: number) { return this.marks.get(k)?.length ?? 0; }
  async courseVisible(id: number) { return this.visible.has(id); }
  async addBookmark(k: number, id: number) { const l = this.marks.get(k) ?? []; if (!l.includes(id)) this.marks.set(k, [id, ...l]); }
  async removeBookmark(k: number, id: number) { this.marks.set(k, (this.marks.get(k) ?? []).filter((x) => x !== id)); }
}

const fakeToss = (): TossApi & { sent: unknown[][] } => ({
  sent: [],
  async login(code) {
    if (code !== "good") throw new Error("toss /user/oauth2/generate-token 400 invalid_grant");
    return { userKey: 443731103, gender: "enc-g", birthday: null, phone: "enc-p" };
  },
  async send(...a) { this.sent.push(a); },
});

function deps(over: Partial<MeDeps> = {}): MeDeps & { repo: FakeRepo } {
  return {
    repo: new FakeRepo(), toss: fakeToss(), sessionSecret: SECRET, unlinkAuth: UNLINK,
    limiter: { limit: async () => ({ success: true }) }, allowedOrigins: [APP], ...over,
  } as MeDeps & { repo: FakeRepo };
}
const call = (d: MeDeps, method: string, path: string, init: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) =>
  handleMe(new Request(`https://api.example${path}`, {
    method,
    headers: { origin: APP, ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }), d);

async function loggedIn(d: MeDeps) {
  const res = await call(d, "POST", "/me/login", { body: { authorizationCode: "good", referrer: "DEFAULT" } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

describe("세션 토큰", () => {
  test("서명·만료가 맞으면 userKey, 바꾸거나 지나면 null", async () => {
    const t = await signSession(SECRET, 42, 1_000);
    expect(await verifySession(SECRET, t, 2_000)).toBe(42);
    expect(await verifySession("other", t, 2_000)).toBeNull();
    expect(await verifySession(SECRET, t.replace(/^42/, "43"), 2_000)).toBeNull();
    expect(await verifySession(SECRET, t, 1_000 + 31 * 86400_000)).toBeNull();
    expect(await verifySession(SECRET, "garbage", 0)).toBeNull();
  });
});

describe("/me 로그인·찜", () => {
  test("로그인 → userKey·암호문 저장, 찜 추가·목록·삭제", async () => {
    const d = deps();
    const token = await loggedIn(d);
    expect(d.repo.users.get(443731103)).toEqual({ userKey: 443731103, gender: "enc-g", birthday: null, phone: "enc-p" });
    expect((await call(d, "PUT", "/me/bookmarks/2", { token })).status).toBe(204);
    expect((await call(d, "PUT", "/me/bookmarks/2", { token })).status).toBe(204); // 다시 찜해도 하나
    const list = await call(d, "GET", "/me/bookmarks", { token });
    expect(await list.json()).toEqual({ items: [{ id: 2 }] });
    expect(list.headers.get("access-control-allow-origin")).toBe(APP);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect((await call(d, "DELETE", "/me/bookmarks/2", { token })).status).toBe(204);
    expect(d.repo.marks.get(443731103)).toEqual([]);
  });

  test("잘못된 요청", async () => {
    const d = deps();
    expect((await call(d, "POST", "/me/login", { body: { authorizationCode: "bad", referrer: "DEFAULT" } })).status).toBe(502);
    expect((await call(d, "POST", "/me/login", { body: { authorizationCode: "good", referrer: "X" } })).status).toBe(400);
    expect((await call(d, "POST", "/me/login", { body: { referrer: "DEFAULT" } })).status).toBe(400);
    expect((await call(deps({ toss: null }), "POST", "/me/login", { body: { authorizationCode: "good", referrer: "DEFAULT" } })).status).toBe(503);
    expect((await call(d, "GET", "/me/bookmarks")).status).toBe(401);
    expect((await call(d, "GET", "/me/bookmarks", { token: "x.y.z" })).status).toBe(401);
    const token = await loggedIn(d);
    expect((await call(d, "PUT", "/me/bookmarks/99", { token })).status).toBe(404); // 노출 중이 아닌 강의
    expect((await call(d, "PUT", "/me/bookmarks/abc", { token })).status).toBe(404);
    expect((await call(d, "POST", "/me/bookmarks/1", { token })).status).toBe(405);
  });

  test(`찜은 ${MAX_BOOKMARKS}개까지`, async () => {
    const d = deps();
    const token = await loggedIn(d);
    d.repo.marks.set(443731103, Array.from({ length: MAX_BOOKMARKS }, (_, i) => 1000 + i));
    expect((await call(d, "PUT", "/me/bookmarks/1", { token })).status).toBe(409);
  });

  test("요청 제한", async () => {
    const d = deps({ limiter: { limit: async () => ({ success: false }) } });
    expect((await call(d, "GET", "/me/bookmarks")).status).toBe(429);
  });

  test("CORS: 허용 Origin 의 preflight 에 PUT·DELETE 와 authorization 헤더", async () => {
    const pre = await call(deps(), "OPTIONS", "/me/bookmarks/1");
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(pre.headers.get("access-control-allow-headers")).toContain("authorization");
    const other = await call(deps(), "OPTIONS", "/me/bookmarks/1", { headers: { origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("연결 끊기 콜백", () => {
  test("Basic Auth 가 맞으면 사용자와 찜을 지우고, 그 세션은 401 → 다시 로그인", async () => {
    const d = deps();
    const token = await loggedIn(d);
    await call(d, "PUT", "/me/bookmarks/1", { token });
    expect((await call(d, "POST", "/toss/unlink", { body: { userKey: 443731103, referrer: "UNLINK" }, headers: { authorization: "Basic wrong" } })).status).toBe(401);
    expect(d.repo.users.size).toBe(1);
    const ok = await call(d, "POST", "/toss/unlink", { body: { userKey: 443731103, referrer: "UNLINK" }, headers: { authorization: UNLINK } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBeNull(); // 앱 Origin 에는 안 연다
    // 콘솔 "테스트하기"는 콘솔 페이지에서 브라우저로 부른다 → 콘솔 Origin 의 preflight 만 허용
    const pre = await call(d, "OPTIONS", "/toss/unlink", { headers: { origin: "https://apps-in-toss.toss.im" } });
    expect([pre.status, pre.headers.get("access-control-allow-origin"), pre.headers.get("access-control-allow-headers")]).toEqual([204, "https://apps-in-toss.toss.im", "authorization, content-type"]);
    expect(d.repo.users.size).toBe(0);
    expect(d.repo.marks.has(443731103)).toBe(false);
    expect((await call(d, "GET", "/me/bookmarks", { token })).status).toBe(401);
    // 같은 콜백이 다시 와도 200, GET 쿼리 방식도 받는다
    expect((await call(d, "GET", "/toss/unlink?userKey=443731103&referrer=WITHDRAWAL_TOSS", { headers: { authorization: UNLINK } })).status).toBe(200);
    expect((await call(d, "POST", "/toss/unlink", { body: { userKey: "x" }, headers: { authorization: UNLINK } })).status).toBe(400);
    expect((await call(d, "POST", "/toss/unlink", { body: {}, headers: { authorization: UNLINK } })).status).toBe(400);
    // 콘솔 "테스트하기" 본문
    expect((await call(d, "POST", "/toss/unlink", { body: { userKey: 0, referrer: "UNLINK" }, headers: { authorization: UNLINK } })).status).toBe(200);
    expect((await call(deps({ unlinkAuth: undefined }), "POST", "/toss/unlink", { body: { userKey: 1 }, headers: { authorization: "" } })).status).toBe(503);
  });

  test("약관·처리방침 페이지", async () => {
    for (const p of ["/terms", "/privacy"]) {
      const r = await call(deps(), "GET", p);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/html");
      expect(await r.text()).toContain("N잡 배움터");
    }
  });
});

describe("마감 알림", () => {
  const due = (rows: { user_key: number; course_id: number; title: string }[]) => {
    const r: DueRepo & { asked: string[]; marked: string[] } = {
      asked: [], marked: [],
      async due(d) { this.asked.push(d); return rows; },
      async markNotified(k, c) { this.marked.push(`${k}:${c}`); },
    };
    return r;
  };

  test("KST 기준 내일 마감인 찜에 보내고, 보낸 것만 표시. 실패는 텔레그램", async () => {
    const repo = due([{ user_key: 1, course_id: 10, title: "AI 영상" }, { user_key: 2, course_id: 11, title: "블로그" }]);
    const toss = fakeToss();
    toss.send = async function (k, code, ctx) { if (k === 2) throw new Error("toss 5004"); this.sent.push([k, code, ctx]); };
    const notes: string[] = [];
    // 2026-10-13 01:00 UTC = KST 10:00 → 내일 = 2026-10-14
    await sendDeadlinePush({ repo, toss, templateCode: "njob-matching-deadline", now: () => new Date("2026-10-13T01:00:00Z"), notify: async (t) => { notes.push(t); } });
    expect(repo.asked).toEqual(["2026-10-14"]);
    expect(toss.sent).toEqual([[1, "njob-matching-deadline", { title: "AI 영상" }]]);
    expect(repo.marked).toEqual(["1:10"]);
    expect(notes[0]).toContain("성공 1 · 실패 1");
  });

  test("KST 자정 직전(UTC 14:59)에도 내일은 KST 기준", async () => {
    const repo = due([]);
    await sendDeadlinePush({ repo, toss: fakeToss(), templateCode: "c", now: () => new Date("2026-10-13T14:59:00Z"), notify: async () => {} });
    expect(repo.asked).toEqual(["2026-10-14"]);
  });

  test("템플릿 코드가 없으면 보내지 않고 알린다, 대상이 없으면 조용히", async () => {
    const notes: string[] = [];
    const repo = due([{ user_key: 1, course_id: 10, title: "x" }]);
    await sendDeadlinePush({ repo, toss: fakeToss(), templateCode: undefined, now: () => new Date(), notify: async (t) => { notes.push(t); } });
    expect(repo.marked).toEqual([]);
    expect(notes[0]).toContain("1건 못 보냄");
    await sendDeadlinePush({ repo: due([]), toss: null, templateCode: undefined, now: () => new Date(), notify: async (t) => { notes.push(t); } });
    expect(notes).toHaveLength(1);
  });
});

describe("DB: app_user·bookmark·bookmark_due", () => {
  test("마감일(없으면 시작일)로 조회, 보낸 건 빠지고, 사용자·강의 삭제 시 찜도 삭제", async () => {
    const db = await freshDb();
    const course = async (sid: string, apply_end: string | null, course_start: string | null) =>
      (await db.query<{ id: number }>(
        `insert into course (source, source_id, title, title_norm, course_type, category_main, url, apply_end, course_start)
         values ('seoul-yeyak', $1, $1, $1, 'oneday', 'video', 'https://x', $2, $3) returning id`, [sid, apply_end, course_start])).rows[0]!.id;
    const a = await course("a", kstDay(1), null);
    const b = await course("b", null, kstDay(1));
    const c = await course("c", kstDay(5), null);
    await db.query("insert into app_user (user_key, phone_enc) values (7, 'enc')");
    for (const id of [a, b, c]) await db.query("insert into bookmark (user_key, course_id) values (7, $1)", [id]);
    const dueIds = async () => (await db.query<{ course_id: number }>("select course_id from bookmark_due where deadline = $1 order by course_id", [kstDay(1)])).rows.map((r) => r.course_id);
    expect(await dueIds()).toEqual([a, b]);
    await db.query("update bookmark set notified_at = now() where course_id = $1", [a]);
    expect(await dueIds()).toEqual([b]);
    await db.query("delete from course where id = $1", [c]);
    expect((await db.query("select * from bookmark")).rows).toHaveLength(2);
    await db.query("delete from app_user where user_key = 7");
    expect((await db.query("select * from bookmark")).rows).toHaveLength(0);
  });

  test("anon 은 app_user·bookmark 를 못 읽는다", async () => {
    const db = await freshDb();
    await db.exec("set role anon");
    await expect(db.query("select * from app_user")).rejects.toThrow();
    await expect(db.query("select * from bookmark_due")).rejects.toThrow();
  });
});
