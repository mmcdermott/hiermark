import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
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
