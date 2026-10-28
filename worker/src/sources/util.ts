// 어댑터 공용 도우미
import { parseKDate } from "../core/rules";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** JSON 응답에 섞여 오는 HTML 엔티티(&#39; &amp; …)를 푼다 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** HTML 조각 → 분류용 평문 (저장하지 않는다) */
export const stripTags = (s: string | null | undefined) => decodeEntities((s ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** 요청마다 30초 제한. opt-in 재시도는 GET/HEAD의 5xx·네트워크·시간 초과에만 적용한다. */
export async function fetchText(f: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = 30_000, retries = 0): Promise<string> {
  const canRetry = ["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());
  for (let attempt = 0; ; attempt++) {
    let serverError = false;
    try {
      const res = await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        serverError = res.status >= 500 && res.status <= 599;
        // 원 서버·CDN·방화벽 진단을 마지막 실패에도 남긴다.
        const body = await res.text().then((t) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120), () => "");
        throw new Error(`HTTP ${res.status} ${new URL(url).host} [server=${res.headers.get("server") ?? "-"}] ${body}`.trim());
      }
      return await res.text();
    } catch (e) {
      const transient = serverError || e instanceof TypeError || (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name));
      if (!canRetry || !transient || attempt >= retries) throw e;
      await pause(2000 * 2 ** attempt);
    }
  }
}

/** 같은 도메인 요청 간격 (plan "사이트 부담을 줄인다") */
export const pause = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

/**
 * 페이지를 총건수만큼 다 받는다. 일부만 받고 성공으로 끝나면 나머지가 "원천에서 사라진 행"으로 지워지므로
 * 아래는 모두 throw 한다: 총건수 없음, 페이지마다 총건수가 다름, 다 받기 전에 빈 페이지, 새 행이 없는 반복 페이지, 상한 초과.
 * 건수는 key 로 센 고유 행 기준. keep 은 받은 행 중 남길 것(메모리 절약용 사전 필터).
 */
export async function collectPages<T>(
  name: string,
  get: (page: number) => Promise<{ total: number | null; rows: T[] }>,
  opts: { key: (row: T) => string; maxPages: number; gapMs?: number; keep?: (row: T) => boolean },
): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  let first: number | null = null;
  for (let page = 1; ; page++) {
    if (page > opts.maxPages) throw new Error(`${name} ${opts.maxPages}페이지 초과`);
    if (page > 1) await pause(opts.gapMs);
    const { total, rows } = await get(page);
    if (total === null || !Number.isFinite(total)) throw new Error(`${name} 총건수 없음`);
    first ??= total;
    if (total !== first) throw new Error(`${name} 총건수 변경 ${first} → ${total}`);
    const before = seen.size;
    for (const r of rows) {
      const k = opts.key(r);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!opts.keep || opts.keep(r)) out.push(r);
    }
    if (seen.size > first) throw new Error(`${name} 총건수보다 많음 ${seen.size}/${first}`);
    if (seen.size === first) return out;
    if (rows.length === 0) throw new Error(`${name} 부분 응답 ${seen.size}/${first}`);
    if (seen.size === before) throw new Error(`${name} 반복 페이지 ${page}`);
  }
}

/** 0 이상 정수(number 또는 숫자 문자열) → number, 그 밖(빈 값·true·"1.5"·음수)은 null */
export const num = (v: unknown): number | null =>
  (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) || (typeof v === "string" && /^\d{1,15}$/.test(v.trim())) ? Number(v) : null;

/** "A ~ B" 기간 → [A, B]. 비어 있으면 [null, null], 양쪽 모두 날짜가 아니면 throw */
export function kperiod(s: unknown): [string | null, string | null] {
  if (s === undefined || s === null || s === "") return [null, null];
  if (typeof s !== "string") throw new Error(`기간 형식 ${String(s).slice(0, 40)}`);
  if (s.trim() === "") return [null, null];
  const [a, b, ...rest] = s.split("~");
  const from = kdate(a);
  const to = kdate(b);
  if (rest.length || !from || !to) throw new Error(`기간 형식 ${s.slice(0, 40)}`);
  return [from, to];
}

/** 날짜 필드: 비어 있으면 null, 값이 있는데 못 읽으면 throw (마감일을 잃으면 마감 판정이 바뀌어 정리에서 지워질 수 있다) */
export function kdate(s: unknown): string | null {
  if (s === undefined || s === null) return null;
  if (typeof s !== "string" || s.includes("~")) throw new Error(`날짜 형식 ${String(s).slice(0, 30)}`); // 기간이 들어오면 첫 날짜만 읽게 된다
  if (s.trim() === "") return null;
  const d = parseKDate(s);
  if (!d) throw new Error(`날짜 형식 ${s.slice(0, 30)}`);
  return d;
}

/**
 * 원문 링크: 비었거나 "-" 면 null(링크 없음), http(s) 면 그대로, "www.x.go.kr/..." 처럼 스킴 없는 도메인이면 https 를 붙이고,
 * "/path" 는 base 기준. 그 밖은 throw (못 읽는 링크를 '링크 없음'으로 빼면 기존 행이 정리에서 지워진다)
 */
/** 이미지 링크: https 만 받는다(토스 WebView 는 http 이미지를 막을 수 있다). 비었거나 형식이 다르면 null — 이미지는 없어도 되는 값이다 */
export function imageUrl(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!/^https:\/\//i.test(v)) return null;
  try {
    return new URL(v).toString();
  } catch {
    return null;
  }
}

export function kurl(s: string | null | undefined, base?: string): string | null {
  const v = decodeEntities((s ?? "").trim());
  if (v === "" || v === "-") return null;
  if (/^https?:\/\//i.test(v)) return new URL(v).toString();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/|\?|$)/i.test(v)) return new URL(`https://${v}`).toString();
  if (v.startsWith("/") && base) return new URL(v, base).toString();
  throw new Error(`URL 형식 ${v.slice(0, 40)}`);
}
