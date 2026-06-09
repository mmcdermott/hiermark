import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamCanvas } from "../src/HamCanvas";
import type { HamBranchEdge, HamCanvasHandlers, HamSurface } from "../src/types";

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

describe("canvas A3 — slots + a11y", () => {
  it("renders an empty state when there are no surfaces", async () => {
    const { container } = render(
      <HamCanvas rootSurfaceId="missing" surfaces={{}} branchEdges={[]} handlers={handlers} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".ham-canvas-empty")).not.toBeNull();
    });
  });

  it("uses a custom EmptyCanvas slot when provided", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="missing"
        surfaces={{}}
        branchEdges={[]}
        handlers={handlers}
        slots={{
          EmptyCanvas: ({ rootSurfaceId }) => <div className="my-empty">{rootSurfaceId}</div>,
        }}
      />,
    );
    await waitFor(() => {
      const el = container.querySelector(".my-empty");
      expect(el?.textContent).toBe("missing");
    });
  });

  it("replaces an inactive surface body via the SurfaceBody slot", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{
          s_root: surface("s_root", "# Root\n\n## A", "Root"),
          s_a: surface("s_a", "# A branch\n\nbody", "A"),
        }}
        branchEdges={[
          {
            id: "e_a",
            fromSurfaceId: "s_root",
            fromBlockId: "blk_A",
            toSurfaceId: "s_a",
            order: 0,
          },
        ]}
        activeSurfaceId="s_root"
        layout={{ inactiveColumnMode: "card" }}
        handlers={handlers}
        slots={{
          SurfaceBody: ({ item }) => <div className="my-body">custom: {item.surface.title}</div>,
        }}
      />,
    );
    await waitFor(() => {
      const card = container.querySelector('[data-surface-id="s_a"]');
      expect(card?.querySelector(".my-body")?.textContent).toBe("custom: A");
    });
    // The active surface keeps its real editor (slot is inactive-only).
    expect(container.querySelector('[data-surface-id="s_root"] .ham-editor')).not.toBeNull();
  });

  it("sets aria-setsize / aria-posinset on sibling treeitems", async () => {
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
    await waitFor(() => {
      const a = container.querySelector('[data-surface-id="s_a"]');
      const b = container.querySelector('[data-surface-id="s_b"]');
      expect(a?.getAttribute("aria-setsize")).toBe("2");
      expect(a?.getAttribute("aria-posinset")).toBe("1");
      expect(b?.getAttribute("aria-posinset")).toBe("2");
    });
  });

  it("exposes a polite aria-live status region", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root", "Root") }}
        branchEdges={[]}
        handlers={handlers}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[aria-live="polite"][role="status"]')).not.toBeNull();
    });
  });
});
