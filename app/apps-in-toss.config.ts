// 앱인토스 설정(SDK 3.x CLI 는 apps-in-toss.config.ts 를 읽는다). appName 은 콘솔 등록명과 같아야 한다(콘솔 등록명 njob-matching, 바뀌면 worker/wrangler.toml ALLOWED_ORIGINS 도)
import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "njob-matching",
  brand: { primaryColor: "#3182F6" },
  permissions: [],
  webBundleDir: "dist",
});
