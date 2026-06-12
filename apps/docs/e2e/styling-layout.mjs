// Headless layout check for the Styling & slots demo. Run with the dev server
// up:  node apps/docs/e2e/styling-layout.mjs  [outPng]
import { chromium } from "@playwright/test";

const BASE = process.env.DOCS_URL ?? "http://localhost:5173/hiermark/";
const OUT = process.argv[2] ?? "/tmp/styling-after.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}#styling`, { waitUntil: "networkidle" });
await page.waitForSelector(".hiermark-canvas", { timeout: 10000 });
// Let the mount auto-scroll effect (if any) settle.
await page.waitForTimeout(600);

const m = await page.evaluate(() => {
  const figure = document.querySelector(".demo");
  const stage = document.querySelector(".demo-stage");
  const canvas = document.querySelector(".hiermark-canvas");
  const r = (el) => (el ? el.getBoundingClientRect() : null);
  const fr = r(figure),
    sr = r(stage),
    cr = r(canvas);
  // The leftmost surface card in DOM order = the root/active column.
  const firstSurface = document.querySelector(".hiermark-surface");
  const fsr = r(firstSurface);
  return {
    figure: fr && { left: fr.left, right: fr.right, width: fr.width },
    stage: sr && { left: sr.left, right: sr.right, width: sr.width },
    canvas: cr && { left: cr.left, right: cr.right, width: cr.width },
    canvasScrollLeft: canvas?.scrollLeft ?? null,
    firstSurfaceLeft: fsr?.left ?? null,
  };
});

await page.screenshot({ path: OUT, fullPage: false });
await browser.close();

// Assertions
const blankRight = m.figure.right - m.stage.right; // px of blank panel on the right
const rootClipped = m.firstSurfaceLeft != null && m.firstSurfaceLeft < m.canvas.left - 1;
const results = {
  ...m,
  blankRightPx: Math.round(blankRight),
  canvasScrollLeft: m.canvasScrollLeft, // informational; small (canvas padding) is fine
  PASS_noBlank: Math.abs(blankRight) <= 4, // stage fills the figure
  PASS_rootVisible: !rootClipped, // active/root surface not panned off the left
};
const ok = results.PASS_noBlank && results.PASS_rootVisible;
console.log(JSON.stringify(results, null, 2));
console.log(`screenshot: ${OUT}`);
process.exit(ok ? 0 : 1);
