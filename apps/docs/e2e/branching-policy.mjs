// Smoke check for the Branching policy demo: the figure has no blank panel and
// the policies surface (different) sets of branch buttons.
// Run with the dev server up:  node apps/docs/e2e/branching-policy.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.DOCS_URL ?? "http://localhost:5173/hiermark/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto(`${BASE}#branching`, { waitUntil: "networkidle" });
await page.waitForSelector(".branch-policy-demo .hiermark-editor", { timeout: 10000 });
await page.waitForTimeout(700);

const blankRight = await page.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  return Math.round(r(".demo").right - r(".demo-stage").right);
});

const count = () =>
  page.evaluate(
    () => document.querySelectorAll(".branch-policy-demo .hiermark-branch-button").length,
  );
const perPolicy = { "bubble-up": await count() };
for (const name of ["Smart", "Headings only", "Leaves only", "Every block", "Off"]) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(450);
  perPolicy[name] = await count();
}
await page.screenshot({ path: "/tmp/branching-final.png" });
await browser.close();

const PASS_noBlank = Math.abs(blankRight) <= 4;
const PASS_buttons = perPolicy["Every block"] > 0; // the regression: content must surface buttons
const PASS_off = perPolicy["Off"] === 0;
console.log(
  JSON.stringify({ blankRightPx: blankRight, perPolicy, PASS_noBlank, PASS_buttons, PASS_off }),
);
process.exit(PASS_noBlank && PASS_buttons && PASS_off ? 0 : 1);
