import { defineConfig, devices } from "@playwright/test";

// Three servers, each with its own freshly seeded local database and clock:
//   morning  Thu 29 Oct 2026 07:42 IST, seven weeks of simulated logs
//   evening  Thu 29 Oct 2026 18:45 IST, same logs
//   fresh    Thu 17 Sep 2026 20:00 IST, only what LOG.md holds (the real starting point)
const SERVERS = {
  morning: { port: 3201, now: "2026-10-29T02:12:00.000Z", extra: "" },
  evening: { port: 3202, now: "2026-10-29T13:15:00.000Z", extra: "" },
  fresh: { port: 3203, now: "2026-09-17T14:30:00.000Z", extra: "--empty" },
} as const;

const phone = { ...devices["iPhone 13"], browserName: "chromium" as const, channel: process.env.PW_CHANNEL || "chrome", deviceScaleFactor: 1 };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure", locale: "en-IN", timezoneId: "Asia/Kolkata" },
  projects: Object.entries(SERVERS).map(([name, s]) => ({
    name,
    testMatch: new RegExp(`${name}\\..*spec\\.ts$`),
    use: { ...phone, baseURL: `http://localhost:${s.port}` },
  })),
  webServer: Object.entries(SERVERS).map(([name, s]) => ({
    command: `npx tsx scripts/e2e-server.ts --port ${s.port} --now ${s.now} --data .data/e2e-${name} ${s.extra}`.trim(),
    url: `http://localhost:${s.port}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  })),
});
