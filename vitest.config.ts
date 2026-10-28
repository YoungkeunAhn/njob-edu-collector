import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 60_000, include: ["worker/test/**/*.test.ts", "app/test/**/*.test.{ts,tsx}"] },
});
