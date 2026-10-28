import type { Env } from "../env";

/** 텔레그램 봇으로 알림 (plan D9). 토큰이 없으면 로그만 남긴다. */
export function telegram(env: Env, fetchFn: typeof fetch): (text: string) => Promise<void> {
  return async (text) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.log(text);
      return;
    }
    const res = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
    if (!res.ok) console.error("텔레그램 전송 실패", res.status);
  };
}
