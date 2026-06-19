import { defineConfig, devices } from "@playwright/test";

// These specs assert things jsdom cannot produce — real layout geometry
// (scrollWidth/getBoundingClientRect) and composited color contrast — so they
// run in a real browser via Playwright rather than the vitest (jsdom) suite.
const PORT = Number(process.env.DOCS_PORT ?? 4173);
const BASE = process.env.HIERMARK_DOCS_BASE ?? "/hiermark/";
const baseURL = `http://localhost:${PORT}${BASE}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  // A stray `test.only` should fail CI rather than silently skip the rest.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // 1440 is the width the demos were tuned for (the sidebar breakpoint and the
    // --demo-avail track math assume it); keep it fixed so layout asserts are
    // deterministic across machines.
    viewport: { width: 1440, height: 1200 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1200 } },
    },
  ],
  // `vite preview` serves the built site: no file watchers (avoids the dev
  // server's inotify limits) and it matches the production bundle. It needs a
  // prior build — the root `test:e2e` script and the CI job handle that.
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
