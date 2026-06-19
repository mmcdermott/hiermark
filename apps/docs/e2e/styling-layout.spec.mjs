// Layout checks for the Styling & slots demo:
//  - the demo stage fills its figure (no blank panel on the right)
//  - the active/root surface isn't panned off the left edge of the canvas
import { test, expect } from "@playwright/test";

test("the styling demo fills its figure and keeps the root surface visible", async ({ page }) => {
  await page.goto("#styling", { waitUntil: "networkidle" });
  await page.waitForSelector(".hiermark-canvas");
  // Let the mount auto-scroll effect (if any) settle before measuring.
  await expect(page.locator(".hiermark-surface").first()).toBeVisible();

  const m = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect() : null;
    };
    const figure = r(".demo");
    const stage = r(".demo-stage");
    const canvas = r(".hiermark-canvas");
    const firstSurface = r(".hiermark-surface"); // leftmost in DOM = root/active column
    return {
      blankRightPx: Math.round(figure.right - stage.right),
      canvasLeft: canvas.left,
      firstSurfaceLeft: firstSurface.left,
    };
  });

  // Stage fills the figure (tiny rounding slack only).
  expect(Math.abs(m.blankRightPx), "no blank panel on the right of the demo").toBeLessThanOrEqual(
    4,
  );
  // The root/active surface isn't clipped off the canvas's left edge.
  expect(m.firstSurfaceLeft, "root surface not panned off the left").toBeGreaterThanOrEqual(
    m.canvasLeft - 1,
  );
});
