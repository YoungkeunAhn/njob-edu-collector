// 강좌 이미지 리사이즈: GET /img?src=<원본 https 링크>&w=160|720 → WebP.
// 원본은 공식 API 이미지 서버만 받는다(열린 프록시 금지). 결과는 Workers 캐시에만 두고 따로 저장하지 않는다(spec FR-014).

/** course.image_url 을 주는 소스의 이미지 호스트 (kmooc course_image, seoul-yeyak IMGURL) */
export const IMAGE_HOSTS = ["lms.kmooc.kr", "yeyak.seoul.go.kr"];
/** 앱이 쓰는 너비만 받는다: 목록 썸네일 64px·상세 약 340px 의 2배수. 너비 조합이 곧 Images 과금 단위다 */
export const IMAGE_WIDTHS = [160, 720];
const MAX_AGE = 30 * 86400;

/** Cloudflare Images 바인딩 중 쓰는 부분 */
export interface ImagesBinding {
  input(stream: ReadableStream): {
    transform(t: { width: number }): { output(o: { format: "image/webp" }): Promise<{ response(): Response }> };
  };
}

export interface ImageDeps {
  images: ImagesBinding | undefined;
  fetch: typeof fetch;
  cache: Pick<Cache, "match" | "put"> | null;
  waitUntil: (p: Promise<unknown>) => void;
}

const fail = (status: number, msg: string) => new Response(msg, { status, headers: { "cache-control": "no-store" } });

/** src·w 를 검사해 원본 URL 과 너비를 돌려준다. 안 되면 null */
export function parseImageQuery(url: URL): { src: URL; w: number } | null {
  const w = Number(url.searchParams.get("w"));
  if (!IMAGE_WIDTHS.includes(w)) return null;
  let src: URL;
  try {
    src = new URL(url.searchParams.get("src") ?? "");
  } catch {
    return null;
  }
  if (src.protocol !== "https:" || !IMAGE_HOSTS.includes(src.hostname)) return null;
  return { src, w };
}

export async function handleImage(req: Request, deps: ImageDeps): Promise<Response> {
  if (req.method !== "GET") return fail(405, "GET only");
  const q = parseImageQuery(new URL(req.url));
  if (!q) return fail(400, "bad src or w");
  if (!deps.images) return fail(503, "IMAGES binding missing");
  const key = new Request(new URL(`/img?src=${encodeURIComponent(q.src.href)}&w=${q.w}`, req.url));
  const hit = await deps.cache?.match(key);
  if (hit) return hit;
  // K-MOOC 는 User-Agent 가 없으면 400 을 준다. 수집기와 같은 값을 쓴다
  const up = await deps.fetch(q.src.href, { headers: { "user-agent": "Mozilla/5.0 (compatible; njob-edu-bot)" } });
  if (!up.ok || !up.body || !(up.headers.get("content-type") ?? "").startsWith("image/")) return fail(502, `upstream ${up.status}`);
  const out = (await (await deps.images.input(up.body).transform({ width: q.w }).output({ format: "image/webp" })).response());
  const res = new Response(out.body, out);
  res.headers.set("cache-control", `public, max-age=${MAX_AGE}, immutable`);
  if (deps.cache) deps.waitUntil(deps.cache.put(key, res.clone()));
  return res;
}
