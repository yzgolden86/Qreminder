import { defineConfig, devices } from "@playwright/test";

for (const key of ["NO_PROXY", "no_proxy"]) {
  const values = new Set(
    (process.env[key] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  values.add("127.0.0.1");
  values.add("localhost");
  values.add("::1");
  process.env[key] = Array.from(values).join(",");
}

const proxyEnv = {
  NO_PROXY: process.env.NO_PROXY ?? "",
  no_proxy: process.env.no_proxy ?? "",
};

const e2eServerPort = 43190;
const e2eClientPort = 45173;
const e2eServerURL = `http://127.0.0.1:${e2eServerPort}`;
const e2eClientURL = `http://127.0.0.1:${e2eClientPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: e2eClientURL,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `pnpm --filter @qreminder/runtime-node exec tsx src/index.ts`,
      env: {
        ...proxyEnv,
        PORT: String(e2eServerPort),
        DATABASE_PATH: "../../e2e_data/qreminder.db",
        ASSETS_DIR: "../../e2e_data/assets",
        BETTER_AUTH_SECRET: "e2e-test-secret-do-not-use-in-prod",
        APP_URL: e2eServerURL,
        SIGNUP_ENABLED: "true",
        TRUSTED_ORIGINS: e2eClientURL,
      },
      url: `${e2eServerURL}/api/app/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --dir packages/client exec vite --host 127.0.0.1 --port ${e2eClientPort} --strictPort`,
      env: {
        ...proxyEnv,
        VITE_DEV_PROXY_TARGET: e2eServerURL,
      },
      url: e2eClientURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
