import { afterEach, describe, expect, test, vi } from "vitest";
import { SupabaseReadRepo, COURSE_COLUMNS } from "../../src/api/supabase-read";
import { parseQuery, type Query } from "../../src/api/handle";
import type { Env } from "../../src/env";

afterEach(() => vi.unstubAllGlobals());

/** 실제 Supabase/PostgREST 클라이언트가 보내는 요청을 검사한다. DB 자격증명·네트워크는 사용하지 않는다. */
function transport() {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    requests.push(new URL(input instanceof Request ? input.url : String(input)));
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }));
  const repo = new SupabaseReadRepo({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-only" } as Env);
  return { repo, requests };
}

describe("SupabaseReadRepo 비용 조회 계약", () => {
  test.each(["paid", "free", "card"].flatMap((cost) => ["deadline", "price", "new"].map((sort) => ({ cost, sort }))))("cost=$cost 와 지역·분야·유형·검색을 AND 로 조회하고 $sort 정렬·페이지를 유지한다", async ({ cost, sort }) => {
    const { repo, requests } = transport();
    const query = parseQuery(new URLSearchParams(`cost=${cost}&region=11,41110&cat=video&sub=video_gen&type=oneday&q=AI&sort=${sort}&cursor=20`)) as Query;
    await repo.list(query, 20, 21);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.pathname).toBe("/rest/v1/course_public");
    const p = request.searchParams;
    expect(p.get("select")).toBe(COURSE_COLUMNS);
    expect(p.get("cost_type")).toBe(`eq.${cost}`);
    expect(p.has("cost_amount")).toBe(false); // 0원 카드·가격 미상으로 대체하지 않는다
    expect(p.get("category_main")).toBe("eq.video");
    expect(p.get("category_sub")).toBe("eq.video_gen");
    expect(p.get("course_type")).toBe("eq.oneday");
    expect(p.get("search_key")).toBe("like.*에이아이*");
    expect(p.getAll("or")).toEqual(["(sido_code.eq.11,sigungu_code.eq.41110,and(sido_code.eq.41,sigungu_code.is.null),mode.eq.online)"]);
    expect(p.get("offset")).toBe("20");
    expect(p.get("limit")).toBe("21");
    const baseOrder = "apply_end.asc.nullslast,course_start.asc.nullslast,id.asc";
    expect(p.get("order")).toBe(sort === "new" ? `id.desc,${baseOrder}` : sort === "price" ? `price_sort.asc.nullslast,${baseOrder}` : baseOrder);
  });

  test("기존 앱의 비용 없는 요청은 전체 조회, 온라인 무료는 두 조건을 함께 적용한다", async () => {
    const { repo, requests } = transport();
    await repo.list({ cursor: 0 }, 0, 21);
    await repo.list({ cursor: 0, mode: "online", cost: "free" }, 0, 21);
    expect(requests[0]!.searchParams.has("cost_type")).toBe(false);
    expect(requests[1]!.searchParams.get("cost_type")).toBe("eq.free");
    expect(requests[1]!.searchParams.get("mode")).toBe("eq.online");
  });
});
