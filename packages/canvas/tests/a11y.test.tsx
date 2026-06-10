import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamCanvas } from "../src/HamCanvas";
import type { HamCanvasHandlers, HamSurface } from "../src/types";

expect.extend(axeMatchers);

declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}
afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string, title?: string): HamSurface => ({
  id,
  rootBlockId: `${id}_root`,
  ...(title ? { title } : {}),
  content: { kind: "markdown", markdown },
});
const handlers: HamCanvasHandlers = { createSurfaceFromBlock: vi.fn() };

// jsdom can't compute layout, so color-contrast is not assertable here.
const axeOpts = { rules: { "color-contrast": { enabled: false } } };

describe("canvas a11y (axe)", () => {
  it("a canvas with a branched tree has no axe violations", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{
          s_root: surface("s_root", "# Root\n\n## A\n\n## B", "Root"),
          s_a: surface("s_a", "# A", "A"),
          s_b: surface("s_b", "# B", "B"),
        }}
        branchEdges={[
          {
            id: "e_a",
            fromSurfaceId: "s_root",
            fromBlockId: "blk_A",
            toSurfaceId: "s_a",
            order: 0,
          },
          {
            id: "e_b",
            fromSurfaceId: "s_root",
            fromBlockId: "blk_B",
            toSurfaceId: "s_b",
            order: 1,
          },
        ]}
        activeSurfaceId="s_root"
        handlers={handlers}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-surface-id="s_a"]')).not.toBeNull());
    const results = await axe(container, axeOpts);
    expect(results).toHaveNoViolations();
  });

  it("the empty-canvas state has no axe violations", async () => {
    const { container } = render(
      <HamCanvas rootSurfaceId="missing" surfaces={{}} branchEdges={[]} handlers={handlers} />,
    );
    await waitFor(() => expect(container.querySelector(".ham-canvas-empty")).not.toBeNull());
    const results = await axe(container, axeOpts);
    expect(results).toHaveNoViolations();
  });
});
