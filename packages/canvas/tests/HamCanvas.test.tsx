import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { useState } from "react";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { HamCanvas } from "../src/HamCanvas";
import type { HamBranchEdge, HamCanvasHandlers, HamSurface, HamSurfaceId } from "../src/types";

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
