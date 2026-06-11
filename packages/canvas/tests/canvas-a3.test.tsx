import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { HiermarkCanvas } from "../src/HiermarkCanvas";
import type { HiermarkBranchEdge, HiermarkCanvasHandlers, HiermarkSurface } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string, title?: string): HiermarkSurface => ({
  id,
  rootBlockId: `${id}_root`,
  ...(title ? { title } : {}),
  content: { kind: "markdown", markdown },
});

const handlers: HiermarkCanvasHandlers = { createSurfaceFromBlock: vi.fn() };

describe("canvas A3 — slots + a11y", () => {
  it("renders an empty state when there are no surfaces", async () => {
    const { container } = render(
      <HiermarkCanvas rootSurfaceId="missing" surfaces={{}} branchEdges={[]} handlers={handlers} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".hiermark-canvas-empty")).not.toBeNull();
    });
  });

  it("uses a custom EmptyCanvas slot when provided", async () => {
    const { container } = render(
      <HiermarkCanvas
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
      <HiermarkCanvas
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
    expect(container.querySelector('[data-surface-id="s_root"] .hiermark-editor')).not.toBeNull();
  });

  it("sets aria-setsize / aria-posinset on sibling treeitems", async () => {
    const { container } = render(
      <HiermarkCanvas
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
      <HiermarkCanvas
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

describe("canvas A3 — keyboard navigation", () => {
  const navSurfaces = {
    s_root: surface("s_root", "# Root\n\n## A\n\n## B", "Root"),
    s_a: surface("s_a", "# A", "A"),
    s_b: surface("s_b", "# B", "B"),
  };
  const navEdges: HiermarkBranchEdge[] = [
    { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
    { id: "e_b", fromSurfaceId: "s_root", fromBlockId: "blk_B", toSurfaceId: "s_b", order: 1 },
  ];
  const canvasEl = (c: HTMLElement) => c.querySelector<HTMLElement>(".hiermark-canvas")!;

  it("Alt+Right descends to the first child of the active surface", async () => {
    const onActiveChange = vi.fn();
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={navSurfaces}
        branchEdges={navEdges}
        handlers={handlers}
        onActiveChange={onActiveChange}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-surface-id="s_a"]')).not.toBeNull());
    fireEvent.keyDown(canvasEl(container), { key: "ArrowRight", altKey: true });
    expect(onActiveChange).toHaveBeenCalledWith({ surfaceId: "s_a", blockId: null });
  });

  it("Alt+Right follows the active block's edge, not the first sibling group", async () => {
    const onActiveChange = vi.fn();
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={navSurfaces}
        branchEdges={navEdges}
        activeBlockId="blk_B"
        handlers={handlers}
        onActiveChange={onActiveChange}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-surface-id="s_b"]')).not.toBeNull());
    fireEvent.keyDown(canvasEl(container), { key: "ArrowRight", altKey: true });
    expect(onActiveChange).toHaveBeenCalledWith({ surfaceId: "s_b", blockId: null });
  });

  it("marks a surface aria-busy + shows a spinner while an op is pending", async () => {
    // A delete handler that never resolves keeps the surface in the pending set.
    const deleteSurface = vi.fn(() => new Promise<void>(() => {}));
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={navSurfaces}
        branchEdges={navEdges}
        handlers={{ ...handlers, deleteSurface }}
      />,
    );
    const aEl = () => container.querySelector('[data-surface-id="s_a"]');
    await waitFor(() => expect(aEl()).not.toBeNull());
    const del = aEl()!.querySelector<HTMLButtonElement>(".hiermark-surface-delete")!;
    fireEvent.click(del);
    await waitFor(() => {
      expect(aEl()?.getAttribute("aria-busy")).toBe("true");
      expect(aEl()?.querySelector(".hiermark-surface-spinner")).not.toBeNull();
    });
  });

  it("renders unreachable surfaces in a detached column with a divider", async () => {
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{
          s_root: surface("s_root", "# Root", "Root"),
          s_a: surface("s_a", "# A", "A"),
          s_orphan: surface("s_orphan", "# Orphan", "Orphan"),
          s_orphan_child: surface("s_orphan_child", "# Child", "Child"),
        }}
        branchEdges={[
          {
            id: "e_a",
            fromSurfaceId: "s_root",
            fromBlockId: "blk_A",
            toSurfaceId: "s_a",
            order: 0,
          },
          // s_orphan has no path from root; s_orphan_child hangs off s_orphan.
          {
            id: "e_o",
            fromSurfaceId: "s_orphan",
            fromBlockId: "blk_X",
            toSurfaceId: "s_orphan_child",
            order: 0,
          },
        ]}
        handlers={handlers}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-surface-id="s_orphan"]')).not.toBeNull();
    });
    // The orphan + its child are present but flagged detached, behind a divider.
    expect(container.querySelector(".hiermark-detached-divider")).not.toBeNull();
    const detachedCols = container.querySelectorAll('.hiermark-column[data-detached="true"]');
    expect(detachedCols.length).toBe(2); // s_orphan, then s_orphan_child
    expect(detachedCols[0]!.querySelector('[data-surface-id="s_orphan"]')).not.toBeNull();
    expect(detachedCols[1]!.querySelector('[data-surface-id="s_orphan_child"]')).not.toBeNull();
    // The reachable surfaces are NOT in a detached column.
    expect(
      container.querySelector('[data-surface-id="s_root"]')!.closest("[data-detached]"),
    ).toBeNull();
  });

  it("Cmd+Z with no reorder history is a safe no-op", async () => {
    const reorderBranchSiblings = vi.fn(() => Promise.resolve([]));
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={navSurfaces}
        branchEdges={navEdges}
        handlers={{ ...handlers, reorderBranchSiblings }}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-surface-id="s_a"]')).not.toBeNull());
    fireEvent.keyDown(canvasEl(container), { key: "z", metaKey: true });
    // Nothing to undo → the reorder handler is never called, and nothing throws.
    expect(reorderBranchSiblings).not.toHaveBeenCalled();
  });

  it("Alt+C toggles collapse of the active surface", async () => {
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={navSurfaces}
        branchEdges={navEdges}
        handlers={handlers}
      />,
    );
    const rootEl = () => container.querySelector('[data-surface-id="s_root"]');
    await waitFor(() => expect(rootEl()?.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(canvasEl(container), { code: "KeyC", altKey: true });
    await waitFor(() => expect(rootEl()?.getAttribute("aria-expanded")).toBe("false"));
  });
});
