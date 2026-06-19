// Behavior: a surface card whose content fully fits must NOT paint a scrollbar.
//
// Regression guard for the phantom horizontal scrollbar bug: the right-gutter
// branch affordance is offset by `2em` (var(--hiermark-gutter-right)). That `em`
// must resolve against the editor base font, the same as the gutter reservation
// (ProseMirror's `padding-right: 2em`). Before the fix it resolved against the
// *block's* font, so a large-font heading block (h1 = 1.6em) pushed its affordance
// ~48px out — past the reserved 30px gutter and through the host card's right
// padding — tripping the body's `overflow:auto` into a horizontal scrollbar even
// though the text fit. The card looked clipped/scrollable when it wasn't.
import { test, expect } from "@playwright/test";

test("a surface card whose content fits paints no scrollbar", async ({ page }) => {
  await page.goto("#styling", { waitUntil: "networkidle" });
  await page.waitForSelector(".hiermark-canvas");
  // The styling demo seeds cards (incl. heading cards) that all fit their box.
  // Waiting on a heading affordance both settles the mount and guarantees the
  // case that regressed is actually present.
  await expect(page.locator(".hiermark-canvas h2").first()).toBeVisible();

  const probe = await page.evaluate(() => {
    const bodies = [...document.querySelectorAll(".hiermark-surface-body")];
    // (a) No body whose content fits should report a scrollable overflow gap.
    const overflowingBodies = bodies
      .map((b, i) => ({ i, h: b.scrollWidth - b.clientWidth, v: b.scrollHeight - b.clientHeight }))
      .filter((g) => g.h > 0 || g.v > 0);

    // (b) Targeted: every right-gutter affordance must stay within its host card's
    //     client box (no escaping into / past the right padding). This pins the
    //     exact geometry that regressed rather than just the symptom.
    const escapes = [];
    for (const body of bodies) {
      const bodyRight = body.getBoundingClientRect().left + body.clientWidth;
      for (const aff of body.querySelectorAll(".hiermark-block-gutter-affordances")) {
        const over = aff.getBoundingClientRect().right - bodyRight;
        if (over > 0.5) escapes.push(Math.round(over * 100) / 100);
      }
    }

    const headingAffordances = [
      ...document.querySelectorAll(".hiermark-canvas h1, .hiermark-canvas h2"),
    ].filter((h) =>
      h.closest(".hiermark-block")?.querySelector(".hiermark-block-gutter-affordances"),
    ).length;

    return { overflowingBodies, escapes, headingAffordances };
  });

  expect(probe.headingAffordances, "demo should include the heading-block case").toBeGreaterThan(0);
  expect(probe.overflowingBodies, "no surface body should scroll when content fits").toEqual([]);
  expect(probe.escapes, "no gutter affordance should escape its host card").toEqual([]);
});
