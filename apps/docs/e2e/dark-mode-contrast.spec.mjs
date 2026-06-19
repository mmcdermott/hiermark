// Behavior: every docs page is legible in dark mode — no text falls below the
// WCAG AA contrast threshold against its actual background.
//
// Regression guard for the dark-mode readability bugs where docs chrome hardcoded
// light hex values that never re-themed:
//   - the `.lede` intro paragraph was near-black (#34343f) on the dark bg (1.5:1),
//   - the demo / live-example caption strips stayed near-white so their themed
//     light text and control chips became invisible (~1.2:1),
//   - the curated light "manuscript" gallery theme didn't pin its ink, so the
//     editor's dark-theme light text leaked onto its cream paper (1.2:1),
//   - sidebar section labels and the accent link sat just under AA.
// All are now tokenized and re-themed; this asserts they stay that way.
//
// Uses axe-core's color-contrast rule, which resolves the real composited
// foreground/background per node (transparent ancestors and all).
import { test, expect } from "@playwright/test";
import axe from "axe-core";

// colorScheme:"dark" makes prefers-color-scheme:dark match, so the docs app boots
// in dark mode (data-theme="dark") without toggling the UI.
test.use({ colorScheme: "dark" });

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
  test(`#${id} has no dark-mode contrast violations`, async ({ page }) => {
    await page.goto(`#${id}`, { waitUntil: "networkidle" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");

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
