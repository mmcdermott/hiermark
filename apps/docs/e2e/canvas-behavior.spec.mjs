// Two canvas behaviors that only a real browser can verify:
//  - collapsing a surface (incl. one on the active path) actually compacts it
//  - column-scroll columns don't paint a phantom scrollbar when content fits
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("#styling", { waitUntil: "networkidle" });
  await page.waitForSelector(".hiermark-canvas");
  await expect(page.locator(".hiermark-column").first()).toBeVisible();
});

test("collapsing an active-path surface compacts it to a rail", async ({ page }) => {
  const surface = page.locator(".hiermark-column .hiermark-surface").first();
  const modeOf = () =>
    surface.evaluate(
      (s) => [...s.classList].find((c) => c.startsWith("hiermark-surface-mode-")) ?? "?",
    );

  const before = await modeOf();
  await page
    .locator(".hiermark-column")
    .first()
    .locator(".hiermark-surface-collapse")
    .first()
    .click();

  await expect.poll(modeOf).toBe("hiermark-surface-mode-rail");
  expect(before, "mode should change on collapse").not.toBe("hiermark-surface-mode-rail");
});

test("column-scroll columns paint no phantom scrollbar when content fits", async ({ page }) => {
  await page
    .locator('[role="group"]', { hasText: "Column scroll" })
    .getByRole("button", { name: "On", exact: true })
    .click();

  // No column should report vertical overflow once the layout settles.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll(".hiermark-column")]
          .map((c) => c.scrollHeight - c.clientHeight)
          .filter((d) => d > 0),
      ),
    )
    .toEqual([]);
});
