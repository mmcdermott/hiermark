import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { useState } from "react";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { HamCanvas } from "../src/HamCanvas";
import type {
  HamBranchEdge,
  HamCanvasHandlers,
  HamCreateSiblingSurfaceEvent,
  HamSurface,
  HamSurfaceId,
} from "../src/types";

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

function makeHandlers(over: Partial<HamCanvasHandlers> = {}): HamCanvasHandlers {
  return {
    createSurfaceFromBlock: vi.fn(async (event) => {
      const newSurface = surface("s_new", "# New branch", "New branch");
      const edge: HamBranchEdge = {
        id: "e_new",
        fromSurfaceId: event.sourceSurfaceId,
        fromBlockId: event.sourceBlockId,
        toSurfaceId: "s_new",
        order: 0,
      };
      return { surface: newSurface, edge, activate: true };
    }),
    ...over,
  };
}

describe("HamCanvas", () => {
  it("mounts the active surface as an editor and renders one column at root", async () => {
    const handlers = makeHandlers();
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nBody text.", "Root") }}
        branchEdges={[]}
        handlers={handlers}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector(".ham-editor")).not.toBeNull();
    });
    expect(container.querySelectorAll(".ham-column")).toHaveLength(1);
    expect(container.querySelector('[data-surface-id="s_root"]')).not.toBeNull();
  });

  it("places branches from two blocks as two items in the next column", async () => {
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A\n\n## B", "Root"),
      s_a: surface("s_a", "# A branch", "A branch"),
      s_b: surface("s_b", "# B branch", "B branch"),
    };
    const edges: HamBranchEdge[] = [
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
      { id: "e_b", fromSurfaceId: "s_root", fromBlockId: "blk_B", toSurfaceId: "s_b", order: 0 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        activeSurfaceId="s_root"
        handlers={makeHandlers()}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll(".ham-column")).toHaveLength(2));
    const col2 = container.querySelectorAll(".ham-column")[1]!;
    const ids = [...col2.querySelectorAll("[data-surface-id]")].map((el) =>
      el.getAttribute("data-surface-id"),
    );
    expect(ids).toEqual(["s_a", "s_b"]);
  });

  it("calls createSurfaceFromBlock when a branch button is clicked", async () => {
    const handlers = makeHandlers();
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nBranch me.", "Root") }}
        branchEdges={[]}
        activeSurfaceId="s_root"
        handlers={handlers}
      />,
    );
    let button: HTMLElement | null = null;
    await waitFor(() => {
      button = container.querySelector<HTMLElement>(".ham-branch-button");
      expect(button).not.toBeNull();
    });
    fireEvent.click(button!);
    await waitFor(() => {
      expect(handlers.createSurfaceFromBlock).toHaveBeenCalled();
    });
    const call = (handlers.createSurfaceFromBlock as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.sourceSurfaceId).toBe("s_root");
    expect(call.sourceBlockId).toMatch(/^blk_/);
    expect(call.sourceSurfaceSnapshot.blocks[call.sourceBlockId]).toBeDefined();
  });

  it("re-activates the parent when an ancestor of the active surface is deleted", async () => {
    // Stateful host: root -> A -> B. Deleting A (an ancestor of the active
    // surface) must not leave B as an unreachable orphan.
    const onActiveChange = vi.fn();
    function Host() {
      const [surfaces, setSurfaces] = useState<Record<HamSurfaceId, HamSurface>>({
        s_root: surface("s_root", "# Root\n\n## A", "Root"),
        s_a: surface("s_a", "# A\n\n## inner", "A"),
        s_b: surface("s_b", "# B branch", "B"),
      });
      const [edges, setEdges] = useState<HamBranchEdge[]>([
        { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
        { id: "e_b", fromSurfaceId: "s_a", fromBlockId: "blk_inner", toSurfaceId: "s_b", order: 0 },
      ]);
      const handlers = makeHandlers({
        deleteSurface: async ({ surfaceId, descendantSurfaceIds }) => {
          const remove = new Set([surfaceId, ...descendantSurfaceIds]);
          setSurfaces((s) =>
            Object.fromEntries(Object.entries(s).filter(([id]) => !remove.has(id))),
          );
          setEdges((e) =>
            e.filter((x) => !remove.has(x.fromSurfaceId) && !remove.has(x.toSurfaceId)),
          );
        },
      });
      return (
        <HamCanvas
          rootSurfaceId="s_root"
          surfaces={surfaces}
          branchEdges={edges}
          handlers={handlers}
          onActiveChange={onActiveChange}
        />
      );
    }
    const { container } = render(<Host />);

    // Navigate to B (root -> open A -> open B) so B is the active surface.
    await waitFor(() => {
      const a = container.querySelector('[data-surface-id="s_a"] .ham-surface-open');
      expect(a).not.toBeNull();
    });
    fireEvent.click(
      container.querySelector<HTMLElement>('[data-surface-id="s_a"] .ham-surface-open')!,
    );
    await waitFor(() => {
      const b = container.querySelector('[data-surface-id="s_b"] .ham-surface-open');
      expect(b).not.toBeNull();
    });
    fireEvent.click(
      container.querySelector<HTMLElement>('[data-surface-id="s_b"] .ham-surface-open')!,
    );
    await waitFor(() =>
      expect(onActiveChange).toHaveBeenLastCalledWith({ surfaceId: "s_b", blockId: null }),
    );

    // Delete A (ancestor of active B).
    const del = container.querySelector<HTMLElement>('[data-surface-id="s_a"] .ham-surface-delete');
    expect(del).not.toBeNull();
    fireEvent.click(del!);

    // Active must fall back to A's parent (root), not stay on the orphaned B.
    await waitFor(() =>
      expect(onActiveChange).toHaveBeenLastCalledWith({ surfaceId: "s_root", blockId: null }),
    );
  });

  it("navigates surfaces with Alt+Arrow keys", async () => {
    const onActiveChange = vi.fn();
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A", "Root"),
      s_a: surface("s_a", "# A branch", "A"),
    };
    const edges: HamBranchEdge[] = [
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        handlers={makeHandlers()}
        onActiveChange={onActiveChange}
      />,
    );
    await waitFor(() => expect(container.querySelector(".ham-editor")).not.toBeNull());
    const canvasEl = container.querySelector<HTMLElement>(".ham-canvas")!;

    fireEvent.keyDown(canvasEl, { key: "ArrowRight", altKey: true });
    expect(onActiveChange).toHaveBeenLastCalledWith({ surfaceId: "s_a", blockId: null });

    fireEvent.keyDown(canvasEl, { key: "ArrowLeft", altKey: true });
    expect(onActiveChange).toHaveBeenLastCalledWith({ surfaceId: "s_root", blockId: null });
  });

  it("collapses a surface via its header toggle", async () => {
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A", "Root"),
      s_a: surface("s_a", "# A branch", "A"),
    };
    const edges: HamBranchEdge[] = [
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        activeSurfaceId="s_root"
        handlers={makeHandlers()}
      />,
    );
    let collapseBtn: HTMLElement | null = null;
    await waitFor(() => {
      collapseBtn = container.querySelector<HTMLElement>(
        '[data-surface-id="s_a"] .ham-surface-collapse',
      );
      expect(collapseBtn).not.toBeNull();
    });
    expect(collapseBtn!.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(collapseBtn!);
    await waitFor(() => {
      const btn = container.querySelector('[data-surface-id="s_a"] .ham-surface-collapse')!;
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("does not navigate on Alt+Arrow originating from inside the editor", async () => {
    const onActiveChange = vi.fn();
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A", "Root"),
      s_a: surface("s_a", "# A branch", "A"),
    };
    const edges: HamBranchEdge[] = [
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        handlers={makeHandlers()}
        onActiveChange={onActiveChange}
      />,
    );
    let editorEl: Element | null = null;
    await waitFor(() => {
      editorEl = container.querySelector(".ham-editor .ProseMirror");
      expect(editorEl).not.toBeNull();
    });
    // Alt+ArrowRight from inside the editor must not jump surfaces (word nav).
    fireEvent.keyDown(editorEl!, { key: "ArrowRight", altKey: true, bubbles: true });
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it("activates an inactive expanded surface when you click into its body", async () => {
    const onActiveChange = vi.fn();
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A", "Root"),
      s_a: surface("s_a", "# A branch", "A"),
    };
    const edges: HamBranchEdge[] = [
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        handlers={makeHandlers()}
        onActiveChange={onActiveChange}
        layout={{ inactiveColumnMode: "expanded" }}
      />,
    );
    // In expanded mode, both surfaces mount full editors.
    await waitFor(() => expect(container.querySelectorAll(".ham-editor").length).toBe(2));
    const body = container.querySelector<HTMLElement>('[data-surface-id="s_a"] .ham-surface-body')!;
    fireEvent.mouseDown(body);
    expect(onActiveChange).toHaveBeenLastCalledWith({ surfaceId: "s_a", blockId: null });
  });

  it("applies the appearance class on the canvas root", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root", "Root") }}
        branchEdges={[]}
        handlers={makeHandlers()}
        layout={{ appearance: "flat" }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".ham-canvas")).not.toBeNull());
    expect(container.querySelector(".ham-canvas.ham-appearance-flat")).not.toBeNull();
  });

  it("renders a positioned add-sibling rail and inserts at the clicked gap", async () => {
    const createSiblingSurface = vi.fn(async (_event: HamCreateSiblingSurfaceEvent) => ({
      surface: surface("s_new", "# New", "New"),
      edge: {
        id: "e_new",
        fromSurfaceId: "s_root",
        fromBlockId: "blk_A",
        toSurfaceId: "s_new",
        order: 1,
      } as HamBranchEdge,
      activate: true as const,
    }));
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A", "Root"),
      s_a1: surface("s_a1", "# A1", "A1"),
      s_a2: surface("s_a2", "# A2", "A2"),
    };
    // Two children of the SAME block → a sibling group with insert gaps.
    const edges: HamBranchEdge[] = [
      { id: "e_a1", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a1", order: 0 },
      { id: "e_a2", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a2", order: 1 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        activeSurfaceId="s_root"
        handlers={makeHandlers({ createSiblingSurface })}
      />,
    );
    let rails: HTMLElement[] = [];
    await waitFor(() => {
      rails = [
        ...container
          .querySelectorAll<HTMLElement>(".ham-column")[1]!
          .querySelectorAll<HTMLElement>(".ham-add-sibling"),
      ];
      expect(rails).toHaveLength(3); // top, between, append
    });
    // Click the "between a1 and a2" inserter (index 1) → insertOrder 1, a2 shifts to 2.
    fireEvent.click(rails[1]!);
    await waitFor(() => expect(createSiblingSurface).toHaveBeenCalled());
    const event = createSiblingSurface.mock.calls[0]![0];
    expect(event.fromBlockId).toBe("blk_A");
    expect(event.order).toBe(1);
    expect(event.insertAfterEdgeId).toBe("e_a1");
    expect(event.shiftedSiblingOrders).toEqual({ e_a2: 2 });
  });

  it("routes the gutter add-sibling affordance to createSiblingSurface", async () => {
    // After a block has one branch child, its gutter "+" becomes an add-sibling
    // "⊕" — clicking it must hit createSiblingSurface, not createSurfaceFromBlock.
    const createSiblingSurface = vi.fn(async (event: HamCreateSiblingSurfaceEvent) => ({
      surface: surface("s_sib", "# Sibling", "Sibling"),
      edge: {
        id: "e_sib",
        fromSurfaceId: event.fromSurfaceId,
        fromBlockId: event.fromBlockId,
        toSurfaceId: "s_sib",
        order: event.order ?? 1,
      } as HamBranchEdge,
      activate: false as const,
    }));
    let n = 0;
    function Host() {
      const [surfaces, setSurfaces] = useState<Record<HamSurfaceId, HamSurface>>({
        s_root: surface("s_root", "# Root\n\nBranch me.", "Root"),
      });
      const [edges, setEdges] = useState<HamBranchEdge[]>([]);
      const handlers = makeHandlers({
        // Branch the first time → first child; keep root active so its gutter stays mounted.
        createSurfaceFromBlock: async (event) => {
          const id = `s_c${n++}`;
          const newSurface = surface(id, "# Child", "Child");
          const edge: HamBranchEdge = {
            id: `e_${id}`,
            fromSurfaceId: event.sourceSurfaceId,
            fromBlockId: event.sourceBlockId,
            toSurfaceId: id,
            order: 0,
          };
          setSurfaces((s) => ({ ...s, [id]: newSurface }));
          setEdges((e) => [...e, edge]);
          return { surface: newSurface, edge, activate: false as const };
        },
        createSiblingSurface,
      });
      return (
        <HamCanvas
          rootSurfaceId="s_root"
          surfaces={surfaces}
          branchEdges={edges}
          activeSurfaceId="s_root"
          handlers={handlers}
        />
      );
    }
    const { container } = render(<Host />);

    // 1) Branch a block (mode "branch") → it gains a child.
    let branchBtn: HTMLElement | null = null;
    await waitFor(() => {
      branchBtn = container.querySelector<HTMLElement>(
        '.ham-branch-button[data-ham-branch-mode="branch"]',
      );
      expect(branchBtn).not.toBeNull();
    });
    fireEvent.click(branchBtn!);

    // 2) That same block now presents an add-sibling affordance.
    let sibBtn: HTMLElement | null = null;
    await waitFor(() => {
      sibBtn = container.querySelector<HTMLElement>(
        '.ham-branch-button[data-ham-branch-mode="add-sibling"]',
      );
      expect(sibBtn).not.toBeNull();
    });

    // 3) Clicking it routes to createSiblingSurface (not another createSurfaceFromBlock).
    fireEvent.click(sibBtn!);
    await waitFor(() => expect(createSiblingSurface).toHaveBeenCalled());
    expect(createSiblingSurface.mock.calls[0]![0].fromSurfaceId).toBe("s_root");
  });

  it("renders custom SurfaceFrame and ColumnHeader slots", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root", "Root") }}
        branchEdges={[]}
        handlers={makeHandlers()}
        slots={{
          SurfaceFrame: ({ children }) => <div className="custom-frame">{children}</div>,
          ColumnHeader: ({ count }) => <div className="custom-col-header">cols:{count}</div>,
        }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".ham-editor")).not.toBeNull());
    expect(container.querySelector(".custom-frame")).not.toBeNull();
    expect(container.querySelector(".custom-col-header")?.textContent).toBe("cols:1");
  });

  it("activates a surface when its preview is opened", async () => {
    const onActiveChange = vi.fn();
    const surfaces = {
      s_root: surface("s_root", "# Root\n\n## A", "Root"),
      s_a: surface("s_a", "# A branch", "A branch"),
    };
    const edges: HamBranchEdge[] = [
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
    ];
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        handlers={makeHandlers()}
        onActiveChange={onActiveChange}
      />,
    );
    let open: HTMLElement | null = null;
    await waitFor(() => {
      const item = container.querySelector('[data-surface-id="s_a"]');
      open = item?.querySelector<HTMLElement>(".ham-surface-open") ?? null;
      expect(open).not.toBeNull();
    });
    fireEvent.click(open!);
    expect(onActiveChange).toHaveBeenCalledWith({ surfaceId: "s_a", blockId: null });
  });
});
