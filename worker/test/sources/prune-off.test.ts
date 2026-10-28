// 원천 전체 목록을 확인할 수 없는 소스(총건수 없음·첫 묶음만)는 '사라진 행' 정리를 하지 않는다 (Source.prune)
import { expect, test } from "vitest";
import { devEvent } from "../../src/sources/dev-event";
import { greenlove } from "../../src/sources/greenlove";
import { jobaba } from "../../src/sources/jobaba";
import { linkareer } from "../../src/sources/linkareer";
import { seoulLifelong } from "../../src/sources/seoul-lifelong";
import { sesac } from "../../src/sources/sesac";
import { theteams } from "../../src/sources/theteams";

test("총건수를 확인할 수 없는 소스만 prune=false", () => {
  expect([devEvent, greenlove, seoulLifelong, theteams].map((s) => s.prune)).toEqual([false, false, false, false]);
  expect([jobaba, linkareer, sesac].map((s) => s.prune)).toEqual([undefined, undefined, undefined]);
});
