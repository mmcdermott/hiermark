import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import { HiermarkCanvas } from "../src/HiermarkCanvas";
import { useHiermarkCanvas, type HiermarkCanvasActions } from "../src/useHiermarkCanvas";
import type {
  HiermarkBranchEdge,
  HiermarkCanvasBehaviorConfig,
  HiermarkCanvasHandlers,
  HiermarkCanvasOperationError,
  HiermarkCanvasProps,
  HiermarkSurface,
} from "../src/types";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string, title?: string): HiermarkSurface => ({
  id,
  rootBlockId: `${id}_root`,
  ...(title ? { title } : {}),
  content: { kind: "markdown", markdown },
});

const dummyResult = () => ({
  surface: surface("s_new", "# New"),
  edge: {
    id: "e_new",
    fromSurfaceId: "s_root",
    fromBlockId: "blk_1",
    toSurfaceId: "s_new",
    order: 0,
  },
  activate: false as const,
});

function makeHandlers(over: Partial<HiermarkCanvasHandlers> = {}): HiermarkCanvasHandlers {
  return {
    createSurfaceFromBlock: vi.fn(async () => dummyResult()),
    ...over,
  };
}

/** Simulate a real edit: PM handles synthetic keydown through its keymap. */
function typeEnter(container: HTMLElement) {
  const pm = container.querySelector<HTMLElement>(".tiptap")!;
  fireEvent.keyDown(pm, { key: "Enter" });
}

const TWO_SURFACES = {
  surfaces: {
    s_root: surface("s_root", "# Root\n\nRoot body.", "Root"),
    s_child: surface("s_child", "# Child\n\nChild body.", "Child"),
  },
  edges: [
    {
      id: "e1",
      fromSurfaceId: "s_root",
      fromBlockId: "blk_x",
      toSurfaceId: "s_child",
      order: 0,
    },
  ] as HiermarkBranchEdge[],
};

describe("canvas autosave", () => {
  it("debounces an edit into one saveSurface call with the edited content", async () => {
    const saveSurface = vi.fn(async (_payload: { surfaceId: string }) => {});
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nBody.", "Root") }}
        branchEdges={[]}
        handlers={makeHandlers({ saveSurface })}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    vi.useFakeTimers();
    typeEnter(container);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    vi.useRealTimers();
    await waitFor(() => expect(saveSurface).toHaveBeenCalledTimes(1));
    expect(saveSurface.mock.calls[0]![0]).toMatchObject({ surfaceId: "s_root" });
  });

  it("does NOT fire a spurious save on unmount when nothing was edited", async () => {
    const saveSurface = vi.fn(async () => {});
    const { container, unmount } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nBody.", "Root") }}
        branchEdges={[]}
        handlers={makeHandlers({ saveSurface })}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(saveSurface).not.toHaveBeenCalled();
  });

  it("flushes a pending edit when the surface de-expands (activate another surface)", async () => {
    const saveSurface = vi.fn(async (_payload: { surfaceId: string }) => {});
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={TWO_SURFACES.surfaces}
        branchEdges={TWO_SURFACES.edges}
        handlers={makeHandlers({ saveSurface })}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    // Edit the root, then immediately activate the child (within the 800ms
    // debounce). The root's editor unmounts (expanded → card) — the pending
    // edit must flush, not die with the timer.
    typeEnter(container);
    const open = [...container.querySelectorAll<HTMLElement>(".hiermark-surface-open")].find((b) =>
      b.closest('[data-surface-id="s_child"]'),
    );
    expect(open).toBeTruthy();
    fireEvent.click(open!);

    await waitFor(() => expect(saveSurface).toHaveBeenCalled());
    expect(saveSurface.mock.calls.some((c) => c[0].surfaceId === "s_root")).toBe(true);
  });

  it("persists the FINAL edit when a save is in flight at unmount (trailing payload)", async () => {
    const resolvers: (() => void)[] = [];
    const saveSurface = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { container, unmount } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nBody.", "Root") }}
        branchEdges={[]}
        handlers={makeHandlers({ saveSurface })}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    vi.useFakeTimers();
    // Edit A → debounce fires → save A starts and stays in flight.
    typeEnter(container);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(saveSurface).toHaveBeenCalledTimes(1);

    // Edit B while save A is in flight; unmount before B's debounce fires.
    typeEnter(container);
    unmount();
    vi.useRealTimers();

    // Resolve save A — the trailing payload (captured at teardown) must now be
    // sent as exactly one final write. This was the data-loss race: edit B
    // used to be silently dropped.
    resolvers[0]!();
    await waitFor(() => expect(saveSurface).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------------------
// Action-layer guards (useHiermarkCanvas), exercised through a thin harness.
// ---------------------------------------------------------------------------

function Harness({
  actionsRef,
  handlers,
  behavior,
  onOperationError,
  branchEdges = [],
}: {
  actionsRef: { current: HiermarkCanvasActions | null };
  handlers: HiermarkCanvasHandlers;
  behavior?: Partial<HiermarkCanvasBehaviorConfig>;
  onOperationError?: (e: HiermarkCanvasOperationError) => void;
  branchEdges?: HiermarkBranchEdge[];
}) {
  const props = {
    rootSurfaceId: "s_root",
    surfaces: { s_root: surface("s_root", "# Root", "Root") },
    branchEdges,
    handlers,
    ...(behavior ? { behavior } : {}),
    ...(onOperationError ? { onOperationError } : {}),
  } as HiermarkCanvasProps;
  const canvas = useHiermarkCanvas(props);
  const ref = useRef(canvas.actions);
  ref.current = canvas.actions;
  useEffect(() => {
    actionsRef.current = ref.current;
  });
  return null;
}

describe("action-layer behavior guards", () => {
  it("enableSiblingBranchCreation=false blocks the gutter add-sibling path even with a handler present", async () => {
    const createSiblingSurface = vi.fn(async () => dummyResult());
    const errors: HiermarkCanvasOperationError[] = [];
    const actionsRef = { current: null as HiermarkCanvasActions | null };
    render(
      <Harness
        actionsRef={actionsRef}
        handlers={makeHandlers({ createSiblingSurface })}
        behavior={{ enableSiblingBranchCreation: false }}
        onOperationError={(e) => errors.push(e)}
      />,
    );
    await waitFor(() => expect(actionsRef.current).not.toBeNull());

    // The editor-gutter event path (mode add-sibling) — previously bypassed the flag.
    await actionsRef.current!.branchFromBlock({
      surfaceId: "s_root",
      blockId: "blk_1",
      blockSnapshot: {
        id: "blk_1",
        type: "paragraph",
        parentId: null,
        childIds: [],
        order: 0,
        depth: 1,
        textPreview: "x",
        isEmpty: false,
      },
      surfaceSnapshot: {
        surfaceId: "s_root",
        rootBlockId: "s_root_root",
        blocks: {},
        blockOrder: [],
      },
      textPreview: "x",
      mode: "add-sibling",
      save: async () => ({
        surfaceId: "s_root",
        content: { tiptapJson: {}, markdown: "" },
        snapshot: { surfaceId: "s_root", rootBlockId: "s_root_root", blocks: {}, blockOrder: [] },
      }),
    });
    // And the direct action path.
    await actionsRef.current!.addSibling("s_root", "blk_1");

    expect(createSiblingSurface).not.toHaveBeenCalled();
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((e) => e.type === "create-sibling" && e.blocked)).toBe(true);
  });

  it("routes updateSurfaceSnapshot rejections to onOperationError (no unhandled rejection)", async () => {
    const errors: HiermarkCanvasOperationError[] = [];
    const actionsRef = { current: null as HiermarkCanvasActions | null };
    render(
      <Harness
        actionsRef={actionsRef}
        handlers={makeHandlers({
          updateSurfaceSnapshot: vi.fn(async () => {
            throw new Error("db down");
          }),
        })}
        onOperationError={(e) => errors.push(e)}
      />,
    );
    await waitFor(() => expect(actionsRef.current).not.toBeNull());
    act(() => {
      actionsRef.current!.updateSnapshot("s_root", {
        surfaceId: "s_root",
        rootBlockId: "s_root_root",
        blocks: {},
        blockOrder: [],
      });
    });
    await waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toMatchObject({ type: "update-snapshot", surfaceId: "s_root" });
  });

  it("addSibling append clears the MAX sibling order, not the group length (sparse orders)", async () => {
    const createSiblingSurface = vi.fn(async (_e: { order?: number }) => dummyResult());
    const actionsRef = { current: null as HiermarkCanvasActions | null };
    // Orders [0, 2] — sparse after a delete. Appending with group.length (2)
    // would land mid-group; the correct append order is 3.
    const edges: HiermarkBranchEdge[] = [
      { id: "e0", fromSurfaceId: "s_root", fromBlockId: "blk_1", toSurfaceId: "sa", order: 0 },
      { id: "e2", fromSurfaceId: "s_root", fromBlockId: "blk_1", toSurfaceId: "sb", order: 2 },
    ];
    render(
      <Harness
        actionsRef={actionsRef}
        handlers={makeHandlers({ createSiblingSurface })}
        branchEdges={edges}
      />,
    );
    await waitFor(() => expect(actionsRef.current).not.toBeNull());
    await actionsRef.current!.addSibling("s_root", "blk_1");
    expect(createSiblingSurface).toHaveBeenCalledTimes(1);
    expect(createSiblingSurface.mock.calls[0]![0].order).toBe(3);
  });

  it("reorderSiblings resolves true on success and false on handler rejection", async () => {
    const actionsRef = { current: null as HiermarkCanvasActions | null };
    const edges: HiermarkBranchEdge[] = [
      { id: "e0", fromSurfaceId: "s_root", fromBlockId: "blk_1", toSurfaceId: "sa", order: 0 },
      { id: "e1", fromSurfaceId: "s_root", fromBlockId: "blk_1", toSurfaceId: "sb", order: 1 },
    ];
    const reorderBranchSiblings = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("nope"));
    render(
      <Harness
        actionsRef={actionsRef}
        handlers={makeHandlers({ reorderBranchSiblings })}
        branchEdges={edges}
        onOperationError={() => {}}
      />,
    );
    await waitFor(() => expect(actionsRef.current).not.toBeNull());
    await expect(
      actionsRef.current!.reorderSiblings("s_root", "blk_1", ["e1", "e0"]),
    ).resolves.toBe(true);
    await expect(
      actionsRef.current!.reorderSiblings("s_root", "blk_1", ["e0", "e1"]),
    ).resolves.toBe(false);
  });
});

describe("active block scoping across expanded surfaces", () => {
  it("a colliding block id in another expanded surface does not light up as active", async () => {
    // Both surfaces carry a block with the SAME id (allowed — ids are
    // surface-scoped). Everything stays expanded so both editors are mounted.
    const block = (text: string) => ({
      type: "paragraph",
      attrs: { dataBlockId: "blk_dup" },
      content: [{ type: "text", text }],
    });
    const surfaces = {
      s_root: {
        id: "s_root",
        rootBlockId: "blk_root_a",
        title: "A",
        content: { kind: "tiptap-json" as const, json: { type: "doc", content: [block("In A")] } },
      },
      s_child: {
        id: "s_child",
        rootBlockId: "blk_root_b",
        title: "B",
        content: { kind: "tiptap-json" as const, json: { type: "doc", content: [block("In B")] } },
      },
    };
    const edges: HiermarkBranchEdge[] = [
      {
        id: "e1",
        fromSurfaceId: "s_root",
        fromBlockId: "blk_dup",
        toSurfaceId: "s_child",
        order: 0,
      },
    ];
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        activeSurfaceId="s_root"
        activeBlockId="blk_dup"
        layout={{ inactiveColumnMode: "expanded" }}
        handlers={makeHandlers()}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll(".tiptap").length).toBe(2));

    await waitFor(() => {
      const active = [...container.querySelectorAll(".hiermark-block-active")];
      expect(active.length).toBeGreaterThanOrEqual(1);
      // Every active-block decoration must live inside the ACTIVE surface.
      for (const el of active) {
        expect(el.closest("[data-surface-id]")?.getAttribute("data-surface-id")).toBe("s_root");
      }
    });
  });
});
