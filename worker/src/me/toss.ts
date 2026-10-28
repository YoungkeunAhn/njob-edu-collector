// 토스 서버 API(mTLS). 정본: docs/05-아키텍처/찜-토스로그인-마감알림.md 1.2·1.4
// 응답은 { resultType: "SUCCESS" | "FAIL", success, error: { errorCode, reason } } (2026-10-13 실호출로 FAIL 모양 확인)
const BASE = "https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss";

/** login-me 결과. 개인정보는 토스가 암호화한 문자열 그대로(선택 동의라 없을 수 있다) */
export interface TossUser {
  userKey: number;
  gender: string | null;
  birthday: string | null;
  phone: string | null;
}

export interface TossApi {
  login(authorizationCode: string, referrer: string): Promise<TossUser>;
  send(userKey: number, templateSetCode: string, context: Record<string, string>): Promise<void>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(f: Fetch, path: string, init: RequestInit): Promise<T> {
  const res = await f(BASE + path, init);
  const text = await res.text();
  let body: { resultType?: string; success?: T; error?: { errorCode?: string; reason?: string } } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // 아래에서 실패로 던진다
  }
  if (!res.ok || body.resultType !== "SUCCESS" || body.success == null)
    throw new Error(`toss ${path} ${res.status} ${body.error?.errorCode ?? ""} ${body.error?.reason ?? text.slice(0, 100)}`.trim());
  return body.success;
}

const json = { "content-type": "application/json" };

/** f = mTLS 인증서 바인딩의 fetch (env.TOSS_MTLS.fetch) */
export function tossApi(f: Fetch): TossApi {
  return {
    async login(authorizationCode, referrer) {
      const t = await call<{ accessToken: string }>(f, "/user/oauth2/generate-token", {
        method: "POST", headers: json, body: JSON.stringify({ authorizationCode, referrer }),
      });
      // 토스 토큰은 userKey 를 얻는 데만 쓰고 저장하지 않는다
      const me = await call<{ userKey: number; gender?: string | null; birthday?: string | null; phone?: string | null }>(
        f, "/user/oauth2/login-me", { headers: { authorization: `Bearer ${t.accessToken}` } },
      );
      return { userKey: me.userKey, gender: me.gender ?? null, birthday: me.birthday ?? null, phone: me.phone ?? null };
    },
    async send(userKey, templateSetCode, context) {
      await call(f, "/messenger/send-message", {
        method: "POST", headers: { ...json, "x-toss-user-key": String(userKey) }, body: JSON.stringify({ templateSetCode, context }),
      });
    },
  };
}
