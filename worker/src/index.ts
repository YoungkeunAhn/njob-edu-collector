import { handle } from "./api/handle";
import { handleImage } from "./api/image";
import { SupabaseReadRepo } from "./api/supabase-read";
import { telegram } from "./collect/notify";
import { onCron } from "./collect/run";
import { SupabaseRepo } from "./collect/supabase-repo";
import type { Env } from "./env";
import { handleMe, isMePath } from "./me/handle";
import { PUSH_CRON, sendDeadlinePush } from "./me/push";
import { SupabaseMeRepo } from "./me/supabase-me";
import { tossApi } from "./me/toss";
import { SCHEDULE } from "./sources";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(req.url).pathname === "/img")
      return handleImage(req, { images: env.IMAGES, fetch: fetch.bind(globalThis), cache: caches.default, waitUntil: (p) => ctx.waitUntil(p) });
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (isMePath(new URL(req.url).pathname))
      return handleMe(req, {
        repo: new SupabaseMeRepo(env),
        toss: toss(env),
        sessionSecret: env.SESSION_SECRET,
        unlinkAuth: env.TOSS_UNLINK_AUTH,
        limiter: env.RATE_LIMITER,
        allowedOrigins,
      });
    return handle(req, { repo: new SupabaseReadRepo(env), cache: caches.default, limiter: env.RATE_LIMITER, allowedOrigins, fetch: fetch.bind(globalThis) });
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const deps = {
      repo: new SupabaseRepo(env),
      fetch: fetch.bind(globalThis),
      env,
      now: () => new Date(),
      notify: telegram(env, fetch.bind(globalThis)),
    };
    if (event.cron === PUSH_CRON)
      ctx.waitUntil(sendDeadlinePush({ repo: new SupabaseMeRepo(env), toss: toss(env), templateCode: env.PUSH_TEMPLATE_CODE, now: deps.now, notify: deps.notify }));
    else ctx.waitUntil(onCron(event.cron, SCHEDULE, deps));
  },
} satisfies ExportedHandler<Env>;

function toss(env: Env) {
  const m = env.TOSS_MTLS;
  return m ? tossApi((url, init) => m.fetch(url, init)) : null;
}
