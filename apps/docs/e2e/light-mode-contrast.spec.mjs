// Behavior: every docs page passes WCAG AA contrast in LIGHT mode too — the
// symmetric guard to dark-mode-contrast.spec.mjs for this dual-theme site.
//
// (Note: axe catches hard AA failures, not "technically-passing but washed-out"
// muted text — that legibility tuning lives in the --doc-muted token value.)
import { test, expect } from "@playwright/test";
import axe from "axe-core";

test.use({ colorScheme: "light" });

const PAGES = [
  "overview",
  "getting-started",
  "markdown",
  "rich-content",
  "annotations",
  "editor",
  "branching",
  "canvas",
  "styling",
  "gallery",
  "paper",
  "collaboration",
  "production",
  "api",
];

for (const id of PAGES) {
  test(`#${id} has no light-mode contrast violations`, async ({ page }) => {
    await page.goto(`#${id}`, { waitUntil: "networkidle" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const res = await window.axe.run(document, {
        runOnly: { type: "rule", values: ["color-contrast"] },
      });
      return res.violations.flatMap((v) =>
        v.nodes.map((n) => {
          const d = n.any?.[0]?.data || {};
          return {
            target: n.target?.[0],
            ratio: d.contrastRatio,
            need: d.expectedContrastRatio,
            fg: d.fgColor,
            bg: d.bgColor,
          };
        }),
      );
    });

    expect(
      violations,
      `contrast violations on #${id}:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
}
