import { describe, expect, test } from "vitest";
import { handleImage, parseImageQuery, type ImageDeps, type ImagesBinding } from "../../src/api/image";

const K = "https://lms.kmooc.kr/course/thumb.php?id=1";
const req = (q: string) => new Request(`https://api.example/img?${q}`);
const qs = (src: string, w: number | string) => `src=${encodeURIComponent(src)}&w=${w}`;

/** 받은 너비를 본문에 적어 돌려주는 가짜 Images */
const images: ImagesBinding = {
  input: () => ({ transform: (t) => ({ output: async () => ({ response: () => new Response(`webp:${t.width}`, { headers: { "content-type": "image/webp" } }) }) }) }),
};
function deps(over: Partial<ImageDeps> = {}) {
  const calls: string[] = [];
  const store = new Map<string, Response>();
  const d: ImageDeps = {
    images,
    // K-MOOC 는 User-Agent 가 없으면 400 이다
    fetch: (async (u: string, init?: RequestInit) => {
      calls.push(u);
      if (!new Headers(init?.headers).get("user-agent")) return new Response("", { status: 400 });
      return new Response("jpg", { headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch,
    cache: { match: async (k) => store.get(String((k as Request).url))?.clone(), put: async (k, r) => { store.set(String((k as Request).url), r); } },
    waitUntil: (p) => void p,
    ...over,
  };
  return { d, calls };
}

describe("강좌 이미지 리사이즈 /img", () => {
  test("허용 호스트·https·정해진 너비만 받는다(열린 프록시 금지)", () => {
    expect(parseImageQuery(new URL(`https://a/img?${qs(K, 160)}`))?.w).toBe(160);
    expect(parseImageQuery(new URL(`https://a/img?${qs("https://yeyak.seoul.go.kr/web/common/file/FileDown.do?file_id=X", 720)}`))).not.toBeNull();
    expect(parseImageQuery(new URL(`https://a/img?${qs(K, 300)}`))).toBeNull();
    expect(parseImageQuery(new URL(`https://a/img?${qs("https://evil.example/a.jpg", 160)}`))).toBeNull();
    expect(parseImageQuery(new URL(`https://a/img?${qs("http://lms.kmooc.kr/x", 160)}`))).toBeNull();
    expect(parseImageQuery(new URL("https://a/img?src=nope&w=160"))).toBeNull();
  });

  test("WebP 로 줄여 30일 캐시하고, 두 번째는 원본을 다시 받지 않는다", async () => {
    const { d, calls } = deps();
    const r1 = await handleImage(req(qs(K, 160)), d);
    expect(r1.status).toBe(200);
    expect(await r1.text()).toBe("webp:160");
    expect(r1.headers.get("cache-control")).toContain("max-age=2592000");
    const r2 = await handleImage(req(qs(K, 160)), d);
    expect(await r2.text()).toBe("webp:160");
    expect(calls).toEqual([K]);
  });

  test("잘못된 요청 400, 원본 실패·이미지 아님 502, 바인딩 없음 503", async () => {
    expect((await handleImage(req(qs("https://evil.example/a.jpg", 160)), deps().d)).status).toBe(400);
    const notImg = deps({ fetch: (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch });
    expect((await handleImage(req(qs(K, 160)), notImg.d)).status).toBe(502);
    const down = deps({ fetch: (async () => new Response("", { status: 404 })) as typeof fetch });
    expect((await handleImage(req(qs(K, 160)), down.d)).status).toBe(502);
    expect((await handleImage(req(qs(K, 160)), deps({ images: undefined }).d)).status).toBe(503);
  });
});
