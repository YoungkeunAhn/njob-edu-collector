// 앱 세션 토큰: "<userKey>.<만료 ms>.<HMAC-SHA256>". 토스 토큰 대신 앱이 들고 다닌다(서버에 세션 저장 없음).
// 연결 끊기는 토큰이 아니라 app_user 행 삭제로 막는다(handle.ts 의 userExists)
const enc = new TextEncoder();
export const SESSION_DAYS = 30;

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** 길이가 같을 때 끝까지 비교(타이밍으로 서명을 맞혀 보지 못하게) */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signSession(secret: string, userKey: number, now = Date.now()): Promise<string> {
  const payload = `${userKey}.${now + SESSION_DAYS * 86400_000}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/** 서명·만료가 맞으면 userKey, 아니면 null */
export async function verifySession(secret: string, token: string, now = Date.now()): Promise<number | null> {
  const m = /^(\d{1,15})\.(\d{1,15})\.([\w-]{43})$/.exec(token);
  if (!m || Number(m[2]) < now) return null;
  return safeEqual(await hmac(secret, `${m[1]}.${m[2]}`), m[3]!) ? Number(m[1]) : null;
}
