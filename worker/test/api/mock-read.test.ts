import { afterEach, describe, expect, test } from "vitest";
import { memRepo } from "../../../app/vite.config";
import { COURSES } from "../../../app/mock/data";
import { parseQuery, type Query } from "../../src/api/handle";

const original = [...COURSES];
afterEach(() => { COURSES.splice(0, COURSES.length, ...original); });

describe("개발 목업 비용 필터", () => {
  test.each([
    { cost: "free", expected: 1 },
    { cost: "card", expected: 2 },
    { cost: "paid", expected: 4 },
  ] as const)("cost=$cost 는 금액 0과 무관하게 정확한 분류만 반환한다", async ({ cost, expected }) => {
    const base = original[0]!;
    COURSES.splice(0, COURSES.length,
      { ...base, id: 1, cost_type: "free", cost_amount: null },
      { ...base, id: 2, cost_type: "card", cost_amount: 0 },
      { ...base, id: 3, cost_type: "partial", cost_amount: 0 },
      { ...base, id: 4, cost_type: "paid", cost_amount: 0 },
      { ...base, id: 5, cost_type: null, cost_amount: 0 },
    );
    expect((await memRepo.list({ cost, cursor: 0 }, 0, 21)).map((c) => c.id)).toEqual([expected]);
    expect(await memRepo.list({ cursor: 0 }, 0, 21)).toHaveLength(5);
  });

  const costs = ["paid", "free", "card"] as const;
  test.each(costs.flatMap((cost) => ["deadline", "price", "new"].map((sort) => ({ cost, sort }))))("cost=$cost 와 복합 조건에서 $sort 정렬 후 페이지를 나누므로 누락·중복이 없다", async ({ cost, sort }) => {
    const base = original[0]!;
    COURSES.splice(0, COURSES.length, ...Array.from({ length: 75 }, (_, i) => ({
      ...base, id: i + 1, title: "AI 영상", cost_type: costs[i % costs.length]!,
    })));
    const q = parseQuery(new URLSearchParams(`region=41110,11&cat=video&type=oneday&cost=${cost}&q=AI&sort=${sort}`)) as Query;
    const first = await memRepo.list(q, 0, 20);
    const second = await memRepo.list({ ...q, cursor: 20 }, 20, 20);
    const expected = Array.from({ length: 25 }, (_, i) => i * costs.length + costs.indexOf(cost) + 1);
    if (sort === "new") expected.reverse();
    expect(first).toHaveLength(20);
    expect(second).toHaveLength(5);
    expect([...first, ...second].map((c) => c.id)).toEqual(expected);
    expect((await memRepo.list({ ...q, mode: "online" }, 0, 20))).toEqual([]);
  });
});
