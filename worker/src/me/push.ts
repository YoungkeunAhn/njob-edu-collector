// 찜한 강의 마감 하루 전 알림 (2026-10-13 결정: D-1, 10:00 KST, 1회). 정본: docs/05-아키텍처/찜-토스로그인-마감알림.md
import { kstToday } from "../core/rules";
import type { TossApi } from "./toss";

/** UTC 01:00 = KST 10:00 */
export const PUSH_CRON = "0 1 * * *";

export interface DueRepo {
  /** 아직 알림 안 보낸 찜 중 마감일(접수 마감, 없으면 교육 시작일)이 deadline 인 것 */
  due(deadline: string): Promise<{ user_key: number; course_id: number; title: string }[]>;
  markNotified(userKey: number, courseId: number): Promise<void>;
}

export interface PushDeps {
  repo: DueRepo;
  toss: TossApi | null;
  /** 콘솔 "직접 API로 발송하기" 캠페인의 발송 코드. 검수 승인 전에는 비워 둔다 */
  templateCode: string | undefined;
  now: () => Date;
  notify: (text: string) => Promise<void>;
}

export async function sendDeadlinePush(deps: PushDeps): Promise<void> {
  const tomorrow = kstToday(new Date(deps.now().getTime() + 86400_000));
  const due = await deps.repo.due(tomorrow);
  if (!due.length) return;
  if (!deps.toss || !deps.templateCode) {
    await deps.notify(`[N잡 배움터 알림]\n⚠️ 발송 설정 없음(mTLS·템플릿 코드) — 내일 마감 찜 ${due.length}건 못 보냄`);
    return;
  }
  let ok = 0;
  const fails: string[] = [];
  // ponytail: 1건씩 보낸다. 하루 50건을 넘기면 send-bulk-message(최대 2,500건)로 바꾼다
  for (const d of due) {
    try {
      await deps.toss.send(d.user_key, deps.templateCode, { title: d.title });
      await deps.repo.markNotified(d.user_key, d.course_id); // 실패한 건 표시하지 않는다 — 내일이면 마감이 지나 다시 보내지 않는다
      ok++;
    } catch (e) {
      fails.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (fails.length) await deps.notify(`[N잡 배움터 알림]\n마감 알림 성공 ${ok} · 실패 ${fails.length}\n${[...new Set(fails)].slice(0, 3).join("\n")}`);
}
