// 수집 실행. 정본: docs/06-스펙/plan.md "소스별 수집 스케줄"·"마감 강좌 처리", spec US3
import { classify } from "../core/classify";
import { toRegion } from "../core/region";
import { courseType, isExpired, kstToday, normTitle, shouldPrune } from "../core/rules";
import type { CourseDraft, CourseRow, Deps, Source } from "./types";

export function finalize(code: string, d: CourseDraft): CourseRow {
  const cls = classify(d.title, d.desc ?? "");
  const mode = d.mode ?? null;
  const region = mode === "online" ? null : (d.region ?? toRegion(d.address));
  return {
    source: code,
    source_id: d.source_id,
    title: d.title.trim(),
    title_norm: normTitle(d.title),
    course_type: courseType(code, d.course_start ?? null, d.course_end ?? null, d.title),
    provider_name: d.provider_name ?? null,
    category_main: cls?.main ?? null,
    category_sub: cls?.sub ?? null,
    mode,
    sido_code: region?.sido ?? null,
    sigungu_code: region?.sigungu ?? null,
    address: d.address ?? null,
    cost_type: d.cost_type ?? null,
    cost_amount: d.cost_amount ?? null,
    apply_start: d.apply_start ?? null,
    apply_end: d.apply_end ?? null,
    course_start: d.course_start ?? null,
    course_end: d.course_end ?? null,
    target: d.target ?? null,
    capacity: d.capacity ?? null,
    url: d.url,
    image_url: d.image_url ?? null,
  };
}

export interface RunResult {
  source: string;
  ok: boolean;
  /** 원천 건수 − normalize 가 null 로 버린 건수 (다음 실행의 급감 비교 기준) */
  fetched: number;
  upserted: number;
  /** normalize 에서 버린(예외) 건수 */
  badRows: number;
  /** 건수 급감 또는 정규화 실패 행이 있어 정리를 건너뜀 */
  pruneSkipped: boolean;
  /** 건수 급감 (ok=false 로 기록해 다음 비교 기준을 낮추지 않는다) */
  dropped: boolean;
  error: string | null;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** 소스 1개: fetch → normalize → 마감 제외 → upsert → (조건부) 미노출 정리 → 실행 기록. 예외를 밖으로 던지지 않는다. */
export async function runSource(source: Source, deps: Deps): Promise<RunResult> {
  const started = deps.now();
  const seenAt = started.toISOString();
  const today = kstToday(started);
  const base = { source: source.code, fetched: 0, upserted: 0, badRows: 0, pruneSkipped: false, dropped: false };
  let result: RunResult;
  try {
    const recs = await source.fetchList({ fetch: deps.fetch, env: deps.env, today });
    // 같은 source_id 가 두 번 오면 마지막 것만 (한 upsert 에 같은 키가 둘이면 Postgres 가 거부한다)
    const byId = new Map<string, CourseRow>();
    let badRows = 0;
    let skipped = 0;
    for (const rec of recs) {
      try {
        const d = source.normalize(rec);
        if (!d) { skipped++; continue; }
        const row = finalize(source.code, d);
        if (!isExpired(row.apply_end, row.course_start, today)) byId.set(row.source_id, row); // 마감된 건 저장하지 않는다 (D12)
      } catch {
        badRows++;
      }
    }
    const prev = await deps.repo.prevOkFetched(source.code);
    const upserted = await deps.repo.upsertCourses([...byId.values()], seenAt);
    // normalize 가 null 로 버린 행은 건수에서 뺀다. 어댑터가 전부 null 을 내도 급감으로 잡혀 정리하지 않는다
    const fetched = recs.length - skipped;
    const dropped = !shouldPrune({ ok: true, fetched }, prev);
    // 정규화에 실패한 행이 있으면 그 행의 기존 데이터까지 지울 수 있으므로 정리하지 않는다
    const prune = source.prune !== false && !dropped && badRows === 0;
    if (prune) await deps.repo.pruneUnseen(source.code, seenAt);
    result = {
      ...base, ok: !dropped, fetched, upserted, badRows, pruneSkipped: !prune, dropped,
      error: dropped ? `건수 급감: 직전 ${prev}건 → ${fetched}건, 정리 건너뜀` : null,
    };
  } catch (e) {
    result = { ...base, ok: false, error: msg(e) };
  }
  try {
    await deps.repo.recordRun({
      source: source.code, started_at: seenAt, finished_at: deps.now().toISOString(),
      ok: result.ok, fetched: result.fetched, upserted: result.upserted, error: result.error,
    });
  } catch (e) {
    console.error("recordRun 실패", source.code, msg(e));
  }
  return result;
}

/** 알릴 내용이 없으면 null */
export function formatAlert(results: RunResult[]): string | null {
  const lines = results.flatMap((r) => {
    if (r.dropped) return [`⚠️ ${r.source} 건수 급감(${r.fetched}건) — 정리 건너뜀`];
    if (!r.ok) return [`❌ ${r.source} 수집 실패: ${r.error}`];
    if (r.badRows > 0) return [`⚠️ ${r.source} 정규화 실패 ${r.badRows}건 — 정리 건너뜀`];
    return [];
  });
  return lines.length ? `[N잡러 수집]\n${lines.join("\n")}` : null;
}

/** 그룹 안 소스를 순차 실행하고, 문제가 있으면 한 번 알린다 */
export async function runGroup(sources: Source[], deps: Deps): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const s of sources) results.push(await runSource(s, deps));
  const alert = formatAlert(results);
  if (alert) await deps.notify(alert);
  return results;
}

/** 매일 후처리: 마감 지난 행 삭제 */
export async function postprocess(deps: Deps): Promise<number> {
  try {
    return await deps.repo.deleteExpired(kstToday(deps.now()));
  } catch (e) {
    await deps.notify(`[N잡러 수집]\n❌ 후처리 실패: ${msg(e)}`);
    return 0;
  }
}

export const POSTPROCESS_CRON = "0 19 * * *";

/** Cron 표현식으로 할 일을 고른다. 모르는 cron 이면 알리기만 한다. */
export async function onCron(cron: string, schedule: Record<string, Source[]>, deps: Deps): Promise<void> {
  if (cron === POSTPROCESS_CRON) {
    await postprocess(deps);
    return;
  }
  const group = schedule[cron];
  if (!group) {
    await deps.notify(`[N잡러 수집]\n❌ 등록되지 않은 cron: ${cron}`);
    return;
  }
  await runGroup(group, deps);
}
