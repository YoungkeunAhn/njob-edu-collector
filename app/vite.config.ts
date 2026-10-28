import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { compareCourses, handle, inRegion, type Query, type ReadRepo } from "../worker/src/api/handle";
import { matchesSearch } from "../worker/src/core/search";
import { handleMe, isMePath, type MeRepo } from "../worker/src/me/handle";
import { COURSES } from "./mock/data";

// 개발 서버 목업 API: Worker 의 실제 handle()(파라미터 검증·페이지·응답 계약)에 메모리 저장소를 붙인다
export const memRepo: ReadRepo = {
  async list(q: Query, offset: number, limit: number) {
    return COURSES.filter((c) => inRegion(q, c) && (!q.cat || c.category_main === q.cat) && (!q.sub || c.category_sub === q.sub) && (!q.type || c.course_type === q.type) && (!q.mode || c.mode === q.mode) && (!q.cost || c.cost_type === q.cost) && (!q.search || matchesSearch(q.search, c.title)))
      .sort(compareCourses(q.sort))
      .slice(offset, offset + limit);
  },
  async get(id: number) {
    return COURSES.find((c) => c.id === id) ?? null;
  },
};

// 찜 목업: Worker 의 handleMe()(세션·연결 끊기·한도)에 메모리 저장소와 가짜 토스 로그인("mock-code" → 사용자 1)
const users = new Set<number>();
const marks = new Map<number, number[]>();
const memMe: MeRepo = {
  async upsertUser(u) { users.add(u.userKey); },
  async userExists(k) { return users.has(k); },
  async deleteUser(k) { users.delete(k); marks.delete(k); },
  async listBookmarks(k) { return (marks.get(k) ?? []).flatMap((id) => COURSES.find((c) => c.id === id) ?? []); },
  async countBookmarks(k) { return marks.get(k)?.length ?? 0; },
  async courseVisible(id) { return COURSES.some((c) => c.id === id); },
  async addBookmark(k, id) { const l = marks.get(k) ?? []; if (!l.includes(id)) marks.set(k, [id, ...l]); },
  async removeBookmark(k, id) { marks.set(k, (marks.get(k) ?? []).filter((x) => x !== id)); },
};
const mockToss = {
  async login(code: string) { if (code !== "mock-code") throw new Error("mock toss: bad code"); return { userKey: 1, gender: null, birthday: null, phone: null }; },
  async send() {},
};

// 원천 보강(/courses/:id/extra) 목업: 고용24 상세·교과편성 픽스처를 돌려준다(app/mock/data.ts 의 work24 강좌용). MOCK_EXTRA_DELAY=ms 로 늦출 수 있다
const fixture = (f: string) => readFileSync(fileURLToPath(new URL(`../worker/test/sources/fixtures/${f}`, import.meta.url)), "utf8");
const mockFetch = (async (input: RequestInfo | URL) => {
  await new Promise((r) => setTimeout(r, Number(process.env.MOCK_EXTRA_DELAY ?? 0)));
  return new Response(fixture(String(input).includes("selectCurriculum") ? "work24-curriculum.html" : "work24-detail.html"));
}) as typeof fetch;

const mockApi: Plugin = {
  name: "mock-api",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/api", async (req, res) => {
      // 리사이즈는 Images 바인딩이 있어야 한다. 개발에서는 원본으로 넘긴다
      if (req.url?.startsWith("/img?")) {
        res.statusCode = 302;
        res.setHeader("location", new URL(`http://x${req.url}`).searchParams.get("src") ?? "");
        return res.end();
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(`http://mock${req.url}`, {
        method: req.method, headers: req.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const limiter = { limit: async () => ({ success: true }) };
      const r = isMePath(new URL(request.url).pathname)
        ? await handleMe(request, { repo: memMe, toss: mockToss, sessionSecret: "dev", unlinkAuth: "Basic ZGV2OmRldg==", limiter, allowedOrigins: [] })
        : await handle(request, { repo: memRepo, cache: null, limiter, allowedOrigins: [], fetch: mockFetch });
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
    });
  },
};

export default defineConfig({
  plugins: [react(), mockApi],
  // MOCK_TOSS=1: 일반 브라우저에서 openURL·토스 로그인·알림 동의·Storage 를 가짜 SDK 로
  resolve: process.env.MOCK_TOSS === "1" ? { alias: { "@apps-in-toss/web-framework": fileURLToPath(new URL("./mock/toss-sdk.ts", import.meta.url)) } } : {},
  // 가짜 SDK 모드는 의존성 캐시를 따로 쓴다(두 dev 서버를 같이 띄우면 같은 캐시를 두고 충돌한다)
  cacheDir: process.env.MOCK_TOSS === "1" ? "node_modules/.vite-mock" : "node_modules/.vite",
  server: { host: true },
  build: { outDir: "dist" },
});
