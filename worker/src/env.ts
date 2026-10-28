/** Worker 바인딩·시크릿. 값은 wrangler secret / .dev.vars 로 넣는다. */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** 소스 인증키. 없으면 그 소스만 실패로 기록된다 */
  SEOUL_API_KEY?: string;
  /** data.go.kr 일반 인증키(Decoding) — 대구·K-Startup·표준데이터·K-MOOC 공용 */
  DATA_GO_KR_KEY?: string;
  YOUTHCENTER_API_KEY?: string;
  /** Cloudflare Images 바인딩 (강좌 이미지 리사이즈, api/image.ts) */
  IMAGES?: import("./api/image").ImagesBinding;
  /** Browser Rendering 바인딩 (AI디지털배움터 헤드리스 수집) */
  BROWSER?: Fetcher;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** CORS 허용 Origin, 쉼표 구분 (https://<appName>.apps.tossmini.com,https://<appName>.private-apps.tossmini.com) */
  ALLOWED_ORIGINS?: string;
  /** Workers Rate Limiting 바인딩 (IP당 분당 60회, wrangler.toml) */
  RATE_LIMITER: RateLimit;
  /** 토스 서버 API mTLS 인증서 바인딩(콘솔 발급 njob-edu-worker, 2027-11-07 만료). 없으면 로그인·푸시 비활성 */
  TOSS_MTLS?: Fetcher;
  /** 앱 세션 토큰 서명 키 */
  SESSION_SECRET?: string;
  /** 토스 연결 끊기 콜백의 Authorization 헤더 값(콘솔 "Basic Auth 헤더"와 같게) */
  TOSS_UNLINK_AUTH?: string;
  /** 찜 마감 알림 캠페인 발송 코드(njob-matching-…). 검수 승인 전에는 비워 둔다 */
  PUSH_TEMPLATE_CODE?: string;
}
