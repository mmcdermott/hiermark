// Branching policy demo: the figure has no blank panel, and switching policy
// changes which blocks surface a branch button ("Every block" shows them, "Off"
// shows none) — the regression was branch buttons disappearing entirely.
import { test, expect } from "@playwright/test";

test("branching-policy demo: layout fills and policies gate branch buttons", async ({ page }) => {
  await page.goto("#branching", { waitUntil: "networkidle" });
  await page.waitForSelector(".branch-policy-demo .hiermark-editor");
  await expect(page.locator(".branch-policy-demo .hiermark-editor").first()).toBeVisible();

  const blankRight = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    return Math.round(r(".demo").right - r(".demo-stage").right);
  });
  expect(Math.abs(blankRight), "no blank panel on the right of the demo").toBeLessThanOrEqual(4);

  const buttonCount = () =>
    page.evaluate(
      () => document.querySelectorAll(".branch-policy-demo .hiermark-branch-button").length,
    );

  // "Every block" must surface branch buttons; this is the exact regression.
  await page.getByRole("button", { name: "Every block", exact: true }).click();
  await expect.poll(buttonCount).toBeGreaterThan(0);

  // "Off" must surface none.
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await expect.poll(buttonCount).toBe(0);
});
