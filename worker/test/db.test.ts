import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, test } from "vitest";
import type { CourseItem } from "../../shared/api-types";
import { compareCourses } from "../src/api/handle";
import { choseongKey, matchesSearch, parseSearch, searchKey } from "../src/core/search";
import { normTitle } from "../src/core/rules";
import { COURSE_COLUMNS } from "../src/api/supabase-read";
import { finalize } from "../src/collect/run";
import { freshDb, kstDay } from "./pg";

let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
});

type Row = Record<string, unknown>;
const base: Row = {
  source: "seoul-yeyak", source_id: "1", title: "AI 영상 만들기", title_norm: "ai영상만들기",
  course_type: "oneday", category_main: "video", url: "https://example.com/1",
};
async function insert(r: Row) {
  const row = { ...base, ...r };
  const cols = Object.keys(row);
  await db.query(
    `insert into course (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})
     on conflict (source, source_id) do update set title = excluded.title`,
    Object.values(row),
  );
}
const pub = async () => (await db.query<Row>("select * from course_public order by id")).rows;

describe("N2 DB", () => {
  test("T2-1 마이그레이션이 돌고 테이블 3개 + view 가 생긴다", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('source','course','collect_run','course_public')",
    );
    expect(r.rows[0]!.n).toBe(4);
  });

  test("T2-2 같은 (source, source_id) 두 번 upsert → 1행, 값은 갱신", async () => {
    await insert({ title: "처음" });
    await insert({ title: "두번째" });
    const r = await db.query<Row>("select title from course");
    expect(r.rows).toEqual([{ title: "두번째" }]);
  });

  test.each(["Pacific/Kiritimati", "Pacific/Pago_Pago"])("T2-3 마감일(없으면 시작일)이 KST 오늘보다 앞이면 숨긴다 (세션 tz=%s)", async (tz) => {
    await db.exec(`set timezone = '${tz}'`); // UTC+14·UTC-11 두 극단: KST 고정이 아니면 둘 중 하나에서 반드시 어긋난다
    await insert({ source_id: "y", title_norm: "a", apply_end: kstDay(-1) });
    await insert({ source_id: "t", title_norm: "b", apply_end: kstDay(0) });
    await insert({ source_id: "s", title_norm: "c", apply_end: null, course_start: kstDay(-1) });
    await insert({ source_id: "n", title_norm: "d", apply_end: null, course_start: null });
    expect(await pub()).toHaveLength(2);
    const ids = (await db.query<Row>("select c.source_id from course_public p join course c on c.id=p.id order by 1")).rows;
    expect(ids).toEqual([{ source_id: "n" }, { source_id: "t" }]);
  });

  test("T2-4 category_main 이 null 이면 숨긴다", async () => {
    await insert({ category_main: null });
    expect(await pub()).toHaveLength(0);
  });

  test("T2-5 같은 정규화 제목+기관+시작일 3건 → 1건, api 소스가 남는다", async () => {
    const d = kstDay(5);
    await insert({ source: "linkareer", source_id: "g", provider_name: "기관", course_start: d });
    await insert({ source: "seoul-yeyak", source_id: "s", provider_name: "기관", course_start: d });
    await insert({ source: "digital-baeum", source_id: "d", provider_name: "기관", course_start: d });
    await insert({ source: "linkareer", source_id: "p", provider_name: "다른기관", course_start: d }); // 대조군: 기관 다름
    await insert({ source: "linkareer", source_id: "q", provider_name: "기관", course_start: kstDay(6) }); // 대조군: 시작일 다름
    const rows = await pub();
    expect(rows.map((r) => r.source).sort()).toEqual(["linkareer", "linkareer", "seoul-yeyak"]);
  });

  test.each(["anon", "authenticated"])("T2-6 %s 는 테이블·view·시퀀스 모두 읽기·쓰기 불가", async (role) => {
    await db.exec(`set role ${role}`);
    await expect(db.query("select setval('course_id_seq', 100)")).rejects.toThrow(/permission denied/);
    await expect(db.query("truncate course")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from course_public")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from course")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into source (code,name,kind,grp,attribution) values ('x','x','api','A','x')")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });

  test("T2-7 source 시드 16행, 그룹 A4·B8·C1·D3", async () => {
    const r = await db.query<{ grp: string; n: number }>("select grp, count(*)::int n from source group by grp order by grp");
    expect(r.rows).toEqual([{ grp: "A", n: 4 }, { grp: "B", n: 8 }, { grp: "C", n: 1 }, { grp: "D", n: 3 }]);
  });

  test("view 에 내부 컬럼(raw, last_seen_at, category_by)이 없다. 검색·정렬용 title_norm·price_sort 는 view 에만 있고 응답(COURSE_COLUMNS)에는 없다", async () => {
    await insert({});
    expect(Object.keys((await pub())[0]!)).not.toEqual(expect.arrayContaining(["raw"]));
    const cols = (await db.query<{ c: string }>("select column_name c from information_schema.columns where table_name='course_public'")).rows.map((r) => r.c);
    for (const c of ["raw", "last_seen_at", "category_by", "source_id"]) expect(cols).not.toContain(c);
    for (const c of ["title_norm", "price_sort"]) expect([cols.includes(c), COURSE_COLUMNS.split(",").includes(c)]).toEqual([true, false]);
  });

  test("T4-10 finalize() 가 만든 행이 스키마에 그대로 들어간다 (N2·N4 짝)", async () => {
    const row = finalize("linkareer", {
      source_id: "g1", title: "[모집] AI 영상 원데이", url: "https://ex.com/g1", address: "경기도 고양시 일산동구",
      cost_type: "free", cost_amount: 0, course_start: kstDay(3), course_end: kstDay(3), target: "누구나",
    });
    const cols = Object.keys(row);
    await db.query(
      `insert into course (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
      Object.values(row).map((v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v)),
    );
    const r = (await pub())[0]!;
    expect(r).toMatchObject({ title: "[모집] AI 영상 원데이", course_type: "oneday", category_main: "video", sido_code: "41" });
  });

  const collectorUpsert = (seen: string) => db.query(`insert into course (source, source_id, title, title_norm, course_type, category_main, category_sub, url, last_seen_at)
      values ('seoul-yeyak','1','x','x','oneday','coding','vibe','u', $1)
      on conflict (source, source_id) do update set category_main=excluded.category_main, category_sub=excluded.category_sub,
        title=excluded.title, last_seen_at=excluded.last_seen_at`, [seen]);

  test("수집기(service_role)는 manual 분류를 덮어쓰지 못하고, 관리자(postgres)는 고칠 수 있다", async () => {
    await insert({ category_main: "video", category_sub: "video_gen" });
    await db.exec("update course set category_main='genai', category_sub='genai_basic', category_by='manual'");
    await db.exec("set role service_role");
    await collectorUpsert("2026-10-12T00:00:00Z");
    await db.exec("reset role");
    const sel = async () => (await db.query<Row>("select title, category_main, category_sub, category_by from course")).rows[0];
    expect(await sel()).toEqual({ title: "x", category_main: "genai", category_sub: "genai_basic", category_by: "manual" });
    await db.exec("update course set category_main='content', category_sub='blog'"); // 관리자 수정
    expect(await sel()).toMatchObject({ category_main: "content", category_sub: "blog" });
    await db.exec("update course set category_by='rule'"); // 관리자가 자동 분류로 되돌림
    expect(await sel()).toMatchObject({ category_by: "rule" });
  });

  test("last_seen_at 은 뒤로 가지 않는다 (겹친 실행 보호)", async () => {
    await insert({ last_seen_at: "2026-10-12T03:00:00Z" });
    await db.exec("set role service_role");
    await collectorUpsert("2026-10-11T03:00:00Z"); // 늦게 끝난 이전 실행
    await db.exec("reset role");
    const r = (await db.query<{ t: string }>("select to_char(last_seen_at at time zone 'UTC','YYYY-MM-DD HH24') t from course")).rows[0];
    expect(r!.t).toBe("2026-10-12 03");
  });

  test("T5-10 조회 API 컬럼(COURSE_COLUMNS)이 course_public 에 다 있고 service_role 로 읽힌다", async () => {
    await insert({});
    await db.exec("set role service_role");
    const r = await db.query<Row>(`select ${COURSE_COLUMNS} from course_public`);
    await db.exec("reset role");
    expect(Object.keys(r.rows[0]!).join(",")).toBe(COURSE_COLUMNS);
  });

  // SupabaseReadRepo.list 의 order 를 SQL 로 옮긴 것. 저기를 바꾸면 여기도 바꾼다
  const ORDER = {
    deadline: "apply_end asc nulls last, course_start asc nulls last, id",
    price: "price_sort asc nulls last, apply_end asc nulls last, course_start asc nulls last, id",
    new: "id desc",
  } as const;

  test("T1-2·T1-8·T1-9 정렬 3종: view 의 price_sort 와 목업 비교 함수(compareCourses)가 같은 순서", async () => {
    const d = kstDay;
    await insert({ source_id: "a", title_norm: "a", cost_type: "free", cost_amount: null, apply_end: d(5) }); // 무료+금액 없음 → 0
    await insert({ source_id: "b", title_norm: "b", cost_type: "card", cost_amount: 300000, apply_end: d(1) });
    await insert({ source_id: "c", title_norm: "c", cost_type: "paid", cost_amount: null, apply_end: d(2) }); // 금액 모름 → 맨 뒤
    await insert({ source_id: "e", title_norm: "e", cost_type: "paid", cost_amount: 30000, apply_end: null, course_start: d(3) });
    await insert({ source_id: "f", title_norm: "f", cost_type: "free", cost_amount: 0, apply_end: d(4), capacity: 20 });
    const ps = (await db.query<Row>("select title_norm, price_sort from course_public order by title_norm")).rows;
    expect(ps.map((r) => r.price_sort)).toEqual([0, 300000, null, 30000, 0]);
    const ids = (await db.query<Row>("select c.source_id, p.id from course_public p join course c using (id)")).rows;
    const sid = new Map(ids.map((r) => [r.id, r.source_id]));
    for (const [sort, order] of Object.entries(ORDER)) {
      const rows = (await db.query<CourseItem>(`select ${COURSE_COLUMNS} from course_public order by ${order}`)).rows;
      const sql = rows.map((r) => sid.get(r.id));
      const mock = [...rows].sort(compareCourses(sort === "deadline" ? undefined : (sort as "price" | "new"))).map((r) => sid.get(r.id));
      expect(mock, sort).toEqual(sql);
      if (sort === "price") expect(sql).toEqual(["f", "a", "e", "b", "c"]);
      if (sort === "deadline") expect(sql).toEqual(["b", "c", "f", "a", "e"]);
      if (sort === "new") expect(sql).toEqual(["f", "e", "c", "b", "a"]);
    }
    expect(rowsCapacity(await db.query<Row>("select capacity from course_public where title_norm='f'"))).toBe(20);
  });

  test("T1-4 검색: title_norm 부분 일치(SupabaseReadRepo 의 like *q* 와 같은 SQL)", async () => {
    await insert({ source_id: "1", title: "챗GPT 블로그", title_norm: "챗gpt블로그" });
    await insert({ source_id: "2", title: "AI 영상", title_norm: "ai영상" });
    const r = await db.query<Row>("select title from course_public where title_norm like $1", ["%gpt블%"]);
    expect(r.rows).toEqual([{ title: "챗GPT 블로그" }]);
  });

  test("T7-7 SQL search_key·hangul_cho 가 TS searchKey·choseongKey 와 같다", async () => {
    const titles = ["챗GPT 실무 2기", "AI 영상 만들기 [모집]", "Z세대 마케팅", "블로그 글쓰기 with 챗GPT", "Excel 데이터 분석", "100% 무료 특강"];
    for (const t of titles) {
      const r = (await db.query<{ k: string; c: string }>("select search_key($1) k, hangul_cho(search_key($1)) c", [normTitle(t)])).rows[0]!;
      expect([r.k, r.c], t).toEqual([searchKey(t), choseongKey(t)]);
    }
  });

  test("T7-8 view 검색: SupabaseReadRepo 와 같은 like 로 지피티·GPT·초성이 같은 행을 찾고, 목업(matchesSearch)과 같다", async () => {
    const titles = ["ChatGPT로 블로그 쓰기", "챗지피티 업무 자동화", "AI 영상 만들기", "블로그 글쓰기"];
    for (const [i, t] of titles.entries()) await insert({ source_id: String(i), title: t, title_norm: normTitle(t) });
    for (const q of ["지피티", "GPT", "ㅈㅍㅌ", "wlvlxl", "블로그"]) {
      const s = parseSearch(q)!;
      const col = s.cho ? "title_cho" : "search_key";
      const sql = (await db.query<{ title: string }>(`select title from course_public where ${s.keys.map((_, j) => `${col} like $${j + 1}`).join(" or ")} order by title`, s.keys.map((k) => `%${k}%`))).rows.map((r) => r.title);
      expect(sql, q).toEqual(titles.filter((t) => matchesSearch(s, t)).sort());
      if (q !== "블로그") expect(sql, q).toEqual(["ChatGPT로 블로그 쓰기", "챗지피티 업무 자동화"].sort());
    }
  });

  test("T7-9 anon·authenticated 는 검색 함수를 못 부른다(/rpc 노출 방지)", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("select search_key('a')")).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
});

const rowsCapacity = (r: { rows: Row[] }) => r.rows[0]!.capacity;
