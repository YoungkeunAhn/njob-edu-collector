import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "../../supabase/migrations");

/** Supabase 처럼 anon·authenticated·service_role 역할과 기본 grant 를 만든 뒤 마이그레이션을 돈다. */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  return db;
}

/** KST 기준 오늘에서 n일 더한 날짜 (YYYY-MM-DD) */
export function kstDay(n: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 + n * 86400_000);
  return d.toISOString().slice(0, 10);
}
