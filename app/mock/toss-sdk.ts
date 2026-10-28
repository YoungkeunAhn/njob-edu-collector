// MOCK_TOSS=1 일 때 @apps-in-toss/web-framework 대신 쓰는 가짜 SDK. 일반 브라우저에서 토스 안 동작(openURL·로그인·찜·알림 동의)을 확인한다
// 나머지 함수(TDS 가 쓰는 getSafeAreaInsets 등)는 진짜 SDK 를 그대로 넘긴다(별칭이 패키지 이름만 가로채므로 파일 경로로 가져온다)
export * from "../../node_modules/@apps-in-toss/web-framework/dist/index.js";

(window as unknown as { ReactNativeWebView: object }).ReactNativeWebView = {}; // inToss() 를 참으로

export const Device = {
  openURL: async (url: string) => { (window as unknown as { __openedURL?: string }).__openedURL = url; },
};

export const Storage = {
  getItem: async (k: string) => localStorage.getItem(`mock:${k}`),
  setItem: async (k: string, v: string) => localStorage.setItem(`mock:${k}`, v),
  removeItem: async (k: string) => localStorage.removeItem(`mock:${k}`),
};

/** 목업 API(/api/me/login)는 코드 "mock-code" 를 사용자 1로 받는다 */
export const TossAuth = { login: async () => ({ authorizationCode: "mock-code", referrer: "SANDBOX" as const }) };

export const Notification = {
  requestAgreement: Object.assign(
    (o: { onEvent: (r: { type: string }) => void }) => {
      (window as unknown as { __agreementAsked?: number }).__agreementAsked = ((window as unknown as { __agreementAsked?: number }).__agreementAsked ?? 0) + 1;
      setTimeout(() => o.onEvent({ type: "newAgreement" }), 0);
      return () => {};
    },
    { isSupported: () => true },
  ),
};

/** aside·개발자 도구에서 이벤트와 공유 시도만 관찰한다. 실제 토스 분석/전송은 하지 않는다. */
type MockWindow = Window & {
  __analyticsEvents?: { log_name: string; log_type: string; params: Record<string, unknown> }[];
  __shareLinks?: { path: string; link: string }[];
  __shareMessages?: string[];
  __mockAnalyticsFailure?: "sync" | "async";
  __mockShareFailure?: "link" | "send";
};
const mockWindow = window as MockWindow;
export const Analytics = {
  log(event: { log_name: string; log_type: string; params: Record<string, unknown> }) {
    if (mockWindow.__mockAnalyticsFailure === "sync") throw new Error("mock analytics sync failure");
    if (mockWindow.__mockAnalyticsFailure === "async") return Promise.reject(new Error("mock analytics async failure"));
    (mockWindow.__analyticsEvents ??= []).push(event);
    return Promise.resolve();
  },
};
export const Share = {
  async createLink({ path }: { path: string }) {
    if (mockWindow.__mockShareFailure === "link") throw new Error("mock createLink failure");
    const link = `https://mock-share.invalid/?path=${encodeURIComponent(path)}`;
    (mockWindow.__shareLinks ??= []).push({ path, link });
    return link;
  },
  async sendMessage({ message }: { message: string }) {
    if (mockWindow.__mockShareFailure === "send") throw new Error("mock share dismissed");
    (mockWindow.__shareMessages ??= []).push(message);
  },
};
