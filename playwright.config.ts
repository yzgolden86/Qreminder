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
  globalSetup: "./e2e/global-setup.cjs",
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
