import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CourseItem } from "../../../shared/api-types";
import { COURSE_COLUMNS } from "../api/supabase-read";
import type { Env } from "../env";
import type { MeRepo } from "./handle";
import type { DueRepo } from "./push";
import type { TossUser } from "./toss";

export class SupabaseMeRepo implements MeRepo, DueRepo {
  private db: SupabaseClient;

  constructor(env: Env) {
    this.db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }

  private static ok<T>(r: { data: T; error: unknown }): T {
    if (r.error) throw r.error;
    return r.data;
  }

  async upsertUser(u: TossUser): Promise<void> {
    SupabaseMeRepo.ok(await this.db.from("app_user").upsert({
      user_key: u.userKey, gender_enc: u.gender, birthday_enc: u.birthday, phone_enc: u.phone, login_at: new Date().toISOString(),
    }));
  }

  async userExists(userKey: number): Promise<boolean> {
    return !!SupabaseMeRepo.ok(await this.db.from("app_user").select("user_key").eq("user_key", userKey).maybeSingle());
  }

  async deleteUser(userKey: number): Promise<void> {
    SupabaseMeRepo.ok(await this.db.from("app_user").delete().eq("user_key", userKey));
  }

  async listBookmarks(userKey: number): Promise<CourseItem[]> {
    const ids = (SupabaseMeRepo.ok(await this.db.from("bookmark").select("course_id").eq("user_key", userKey).order("created_at", { ascending: false })) ?? [])
      .map((r: { course_id: number }) => r.course_id);
    if (!ids.length) return [];
    const rows = SupabaseMeRepo.ok(await this.db.from("course_public").select(COURSE_COLUMNS).in("id", ids)) as unknown as CourseItem[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async countBookmarks(userKey: number): Promise<number> {
    const r = await this.db.from("bookmark").select("course_id", { count: "exact", head: true }).eq("user_key", userKey);
    if (r.error) throw r.error;
    return r.count ?? 0;
  }

  async courseVisible(courseId: number): Promise<boolean> {
    return !!SupabaseMeRepo.ok(await this.db.from("course_public").select("id").eq("id", courseId).maybeSingle());
  }

  async addBookmark(userKey: number, courseId: number): Promise<void> {
    SupabaseMeRepo.ok(await this.db.from("bookmark").upsert({ user_key: userKey, course_id: courseId }, { ignoreDuplicates: true }));
  }

  async removeBookmark(userKey: number, courseId: number): Promise<void> {
    SupabaseMeRepo.ok(await this.db.from("bookmark").delete().eq("user_key", userKey).eq("course_id", courseId));
  }

  async due(deadline: string) {
    return SupabaseMeRepo.ok(await this.db.from("bookmark_due").select("user_key, course_id, title").eq("deadline", deadline)) as {
      user_key: number; course_id: number; title: string;
    }[];
  }

  async markNotified(userKey: number, courseId: number): Promise<void> {
    SupabaseMeRepo.ok(await this.db.from("bookmark").update({ notified_at: new Date().toISOString() }).eq("user_key", userKey).eq("course_id", courseId));
  }
}
