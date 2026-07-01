// Behavior: no page has horizontal overflow at mobile width — the layout fits
// the viewport and wide content (code blocks, tables, demos) scrolls internally
// rather than pushing the whole page sideways.
//
// Regression guard for the `.content` grid track: without `min-width: 0` it keeps
// `min-width: auto`, so a wide code block/table forces the `1fr` track past the
// viewport and the page scrolls horizontally on phones.
import { test, expect } from "@playwright/test";

// A representative spread: prose+table (markdown), a demo (canvas), the wide
// gallery, and the API page.
const PAGES = ["overview", "markdown", "canvas", "gallery", "api"];

test.use({ viewport: { width: 390, height: 844 } });

for (const id of PAGES) {
  test(`#${id} has no horizontal overflow at 390px`, async ({ page }) => {
    await page.goto(`#${id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, `page scrolls horizontally by ${overflow}px at 390px`).toBeLessThanOrEqual(1);
  });
}
