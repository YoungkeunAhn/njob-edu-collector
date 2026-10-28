// 앱인토스 SDK 경계. 일반 브라우저(개발·테스트)에서는 원문을 새 창으로 열고, 찜(토스 로그인)은 숨긴다
import { Analytics, Device, Notification, Share, Storage, TossAuth } from "@apps-in-toss/web-framework";
import { cleanLastList } from "./acquisition";

/** 토스 앱 안인가. 찜·로그인·알림 동의는 토스 안에서만 보인다 */
export const inToss = () => "ReactNativeWebView" in window;

/** 계측은 사용자 동작을 지연시키거나 실패시키지 않는다. */
export function logEvent(name: string, params: Record<string, string | number | boolean>): void {
  if (!inToss()) return;
  try {
    void Promise.resolve(Analytics.log({ log_name: name, log_type: "event", params })).catch(() => {});
  } catch { /* 미지원 SDK·브리지 오류도 무시 */ }
}

export async function createShareLink(path: string): Promise<string> {
  if (!inToss()) throw new Error("토스 앱에서 공유할 수 있어요");
  return Share.createLink({ path });
}

export async function sendShareMessage(message: string): Promise<void> {
  if (!inToss()) throw new Error("토스 앱에서 공유할 수 있어요");
  await Share.sendMessage({ message });
}

/** 원문 열기: 토스 안에서는 SDK openURL(기기 브라우저), 밖에서는 새 창. location 이동·iframe 금지(앱인토스 정책) */
export function openOriginal(url: string): void {
  if (inToss()) void Device.openURL(url);
  else window.open(url, "_blank", "noopener");
}

/** 콘솔 푸시알림 캠페인 "찜한 강의 마감 하루 전 알림" 발송 코드(= 알림 동의문이 연결된 템플릿) */
const PUSH_TEMPLATE = "njob-matching-deadline";
const SESSION = "session";
const ASKED = "push-asked";

/** 기기 저장소(토스 앱 삭제 시 함께 지워진다). 실패하면 없는 것으로 본다 */
export const session = {
  get: () => Storage.getItem(SESSION).catch(() => null),
  set: (t: string) => Storage.setItem(SESSION, t).catch(() => {}),
  clear: () => Storage.removeItem(SESSION).catch(() => {}),
};

/** 마지막으로 연 목록 경로("/list?..."). 다음에 들어오면 홈(조건 고르기)을 건너뛰고 바로 연다. 토스 밖에서는 기억하지 않는다 */
const LAST_LIST = "last-list";
export const lastList = {
  get: () => (inToss() ? Storage.getItem(LAST_LIST).then(cleanLastList).catch(() => null) : Promise.resolve(null)),
  set: (to: string) => { const clean = cleanLastList(to); if (inToss() && clean) void Storage.setItem(LAST_LIST, clean).catch(() => {}); },
};

/** 토스 로그인: 처음이면 약관 동의 화면, 이미 동의했으면 바로 인가 코드 */
export const tossLogin = () => TossAuth.login();

/** 처음 찜할 때 한 번만 알림 동의를 묻는다. 거절해도 찜은 된다(2026-10-13 결정 Q5) */
export async function askPushOnce(): Promise<void> {
  if ((await Storage.getItem(ASKED).catch(() => null)) || !Notification.requestAgreement.isSupported()) return;
  await Storage.setItem(ASKED, "1").catch(() => {});
  await new Promise<void>((resolve) => {
    let cleanup: (() => void) | undefined;
    const done = () => { setTimeout(() => cleanup?.(), 0); resolve(); };
    try {
      cleanup = Notification.requestAgreement({ options: { templateCode: PUSH_TEMPLATE }, onEvent: done, onError: done });
    } catch {
      resolve();
    }
  });
}
