// 소스 레지스트리. 정본: docs/06-스펙/plan.md "소스별 수집 스케줄" — 소스를 옮기거나 주기를 바꿀 때는 이 표 한 곳과 wrangler.toml crons 를 같이 고친다.
import type { Source } from "../collect/types";
import { daegu } from "./daegu";
import { devEvent } from "./dev-event";
import { digitalBaeum } from "./digital-baeum";
import { greenlove } from "./greenlove";
import { jobaba } from "./jobaba";
import { kmooc } from "./kmooc";
import { kstartup } from "./kstartup";
import { lifelongStd } from "./lifelong-std";
import { linkareer } from "./linkareer";
import { seoulLifelong } from "./seoul-lifelong";
import { seoulYeyak } from "./seoul-yeyak";
import { sesac } from "./sesac";
import { theteams } from "./theteams";
import { work24 } from "./work24";
import { youthcenter } from "./youthcenter";

/** Cron 표현식(UTC) → 그룹 소스. 후처리 cron(POSTPROCESS_CRON)은 collect/run.ts */
export const SCHEDULE: Record<string, Source[]> = {
  // A 를 둘로 나눴다: 고용24 공개 검색 HTML 수집이 약 10분(2026-10-12 드라이런 591초)이라 Cron 15분 한도를 혼자 쓴다
  "0 18 * * *": [work24], // A1 매일 03:00 KST
  "10 18 * * *": [seoulYeyak, daegu, kstartup], // A2 매일 03:10
  "20 18 * * *": [seoulLifelong, sesac, devEvent, linkareer], // B 매일 03:20
  "40 18 * * *": [digitalBaeum], // C 매일 03:40
  "30 19 * * SUN": [lifelongStd, kmooc, youthcenter], // D 매주 월 04:30
};

/** Cloudflare 에서 나가는 요청을 막는 소스(이슈 #2). Worker Cron 이 아니라 로컬 PC 작업 스케줄러가 scripts/collect-local.ts 로 돌린다 */
export const LOCAL: Source[] = [jobaba, greenlove, theteams];
