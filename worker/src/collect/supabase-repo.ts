import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import type { CourseRow, Repo, RunRecord } from "./types";

const CHUNK = 500;

export class SupabaseRepo implements Repo {
  private db: SupabaseClient;

  constructor(env: Env) {
    this.db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }

  async prevOkFetched(source: string): Promise<number | null> {
    const { data, error } = await this.db
      .from("collect_run").select("fetched").eq("source", source).eq("ok", true)
      .order("started_at", { ascending: false }).limit(1);
    if (error) throw error;
    return data[0]?.fetched ?? null;
  }

  async upsertCourses(rows: CourseRow[], seenAt: string): Promise<number> {
    let n = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, last_seen_at: seenAt }));
      const { error, count } = await this.db
        .from("course").upsert(chunk, { onConflict: "source,source_id", count: "exact" });
      if (error) throw error;
      n += count ?? chunk.length;
    }
    return n;
  }

  async pruneUnseen(source: string, seenAt: string): Promise<number> {
    const { error, count } = await this.db
      .from("course").delete({ count: "exact" }).eq("source", source).lt("last_seen_at", seenAt);
    if (error) throw error;
    return count ?? 0;
  }

  async deleteExpired(today: string): Promise<number> {
    const { error, count } = await this.db
      .from("course").delete({ count: "exact" })
      .or(`apply_end.lt.${today},and(apply_end.is.null,course_start.lt.${today})`);
    if (error) throw error;
    return count ?? 0;
  }

  async recordRun(run: RunRecord): Promise<void> {
    const { error } = await this.db.from("collect_run").insert(run);
    if (error) throw error;
  }
}
