import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CourseItem } from "../../../shared/api-types";
import type { Env } from "../env";
import { regionOr, type Query, type ReadRepo } from "./handle";

/** 응답에 내보내는 컬럼 = CourseItem. 내부 컬럼(last_seen_at·category_by 등)은 view 에도 없다 */
export const COURSE_COLUMNS =
  "id,source,attribution,title,course_type,provider_name,category_main,category_sub,mode,sido_code,sigungu_code,address,cost_type,cost_amount,apply_start,apply_end,course_start,course_end,target,url,image_url,capacity";

export class SupabaseReadRepo implements ReadRepo {
  private db: SupabaseClient;

  constructor(env: Env) {
    this.db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }

  async list(q: Query, offset: number, limit: number): Promise<CourseItem[]> {
    let b = this.db.from("course_public").select(COURSE_COLUMNS);
    if (q.cat) b = b.eq("category_main", q.cat);
    if (q.sub) b = b.eq("category_sub", q.sub);
    if (q.type) b = b.eq("course_type", q.type);
    if (q.mode) b = b.eq("mode", q.mode);
    if (q.cost) b = b.eq("cost_type", q.cost);
    // 검색 키는 [가-힣0-9]·[ㄱ-ㅎ] 만(core/search) — 와일드카드·필터 문자가 없다. or 는 지역 or 와 AND 로 묶인다(PostgREST 반복 파라미터)
    if (q.search) {
      const col = q.search.cho ? "title_cho" : "search_key";
      const [first, ...more] = q.search.keys;
      b = more.length ? b.or(q.search.keys.map((k) => `${col}.like.*${k}*`).join(",")) : b.like(col, `*${first}*`);
    }
    const or = regionOr(q);
    if (or) b = b.or(or);
    if (q.sort === "new") b = b.order("id", { ascending: false }); // 새로 올라온 순: id 는 첫 수집 때 매겨지고 upsert 로 바뀌지 않는다
    if (q.sort === "price") b = b.order("price_sort", { ascending: true, nullsFirst: false });
    // 접수 마감일 순, 마감일이 없으면 뒤로 가서 시작일 순 (plan "API"). 가격순의 같은 가격 안에서도 이 순서
    const { data, error } = await b
      .order("apply_end", { ascending: true, nullsFirst: false })
      .order("course_start", { ascending: true, nullsFirst: false })
      .order("id")
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as unknown as CourseItem[];
  }

  async get(id: number): Promise<CourseItem | null> {
    const { data, error } = await this.db.from("course_public").select(COURSE_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data as unknown as CourseItem | null;
  }
}
