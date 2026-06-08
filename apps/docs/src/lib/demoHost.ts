import { useRef, useState } from "react";
import type { HamBranchEdge, HamCanvasHandlers, HamSurface, HamSurfaceId } from "@ham/canvas";

let counter = 0;
const uid = (prefix: string) => `${prefix}_${(counter++).toString(36)}`;

export interface DemoCanvasState {
  surfaces: Record<HamSurfaceId, HamSurface>;
  branchEdges: HamBranchEdge[];
}

export interface DemoCanvas extends DemoCanvasState {
  handlers: HamCanvasHandlers;
  reset: () => void;
}

/**
 * A tiny in-memory host for the live canvas demos: it owns surfaces + edges in
 * React state and implements the HAM canvas handlers (create / sibling /
 * reorder / delete / save). This is exactly the shape a real app provides — the
 * packages call these handlers; the host persists or rejects.
 */
export function useDemoCanvas(initial: DemoCanvasState): DemoCanvas {
  const [surfaces, setSurfaces] = useState<Record<HamSurfaceId, HamSurface>>(initial.surfaces);
  const [branchEdges, setEdges] = useState<HamBranchEdge[]>(initial.branchEdges);
  const edgesRef = useRef(branchEdges);
  edgesRef.current = branchEdges;

  const makeChild = (
    fromSurfaceId: string,
    fromBlockId: string,
    title: string,
    opts?: { order?: number; shiftedSiblingOrders?: Record<string, number> },
  ) => {
    const id = uid("s");
    const surface: HamSurface = {
      id,
      rootBlockId: uid("blk"),
      title,
      content: { kind: "markdown", markdown: `# ${title}\n\nElaborate this branch…` },
    };
    // Trust the canvas-computed order when provided (positioned insert); else
    // append at the end of the sibling group.
    const order =
      opts?.order ??
      edgesRef.current.filter(
        (e) => e.fromSurfaceId === fromSurfaceId && e.fromBlockId === fromBlockId,
      ).length;
    const edge: HamBranchEdge = {
      id: uid("e"),
      fromSurfaceId,
      fromBlockId,
      toSurfaceId: id,
      order,
    };
    setSurfaces((s) => ({ ...s, [id]: surface }));
    setEdges((e) => {
      // Apply the canvas-computed renumber for displaced siblings, then append
      // the new edge — so an "insert between 2 and 3" actually lands there.
      const shift = opts?.shiftedSiblingOrders;
      const shifted = shift
        ? e.map((x) => (shift[x.id] != null ? { ...x, order: shift[x.id]! } : x))
        : e;
      return [...shifted, edge];
    });
    return { surface, edge, activate: true as const };
  };

  const handlers: HamCanvasHandlers = {
    createSurfaceFromBlock: async (event) =>
      makeChild(event.sourceSurfaceId, event.sourceBlockId, event.suggestedTitle || "New branch"),
    createSiblingSurface: async (event) =>
      makeChild(event.fromSurfaceId, event.fromBlockId, event.suggestedTitle || "New sibling", {
        ...(event.order != null ? { order: event.order } : {}),
        ...(event.shiftedSiblingOrders ? { shiftedSiblingOrders: event.shiftedSiblingOrders } : {}),
      }),
    reorderBranchSiblings: async ({ orderedEdgeIds }) => {
      const orderById = new Map(orderedEdgeIds.map((eid, i) => [eid, i]));
      // Compute the reordered array up front so the handler resolves with the
      // confirmed order (the state updater runs later, asynchronously).
      const next = edgesRef.current.map((x) =>
        orderById.has(x.id) ? { ...x, order: orderById.get(x.id)! } : x,
      );
      setEdges(next);
      return next;
    },
    deleteSurface: async ({ surfaceId, descendantSurfaceIds }) => {
      const remove = new Set([surfaceId, ...descendantSurfaceIds]);
      setSurfaces((s) => Object.fromEntries(Object.entries(s).filter(([id]) => !remove.has(id))));
      setEdges((e) => e.filter((x) => !remove.has(x.fromSurfaceId) && !remove.has(x.toSurfaceId)));
    },
    saveSurface: async (payload) => {
      setSurfaces((s) =>
        s[payload.surfaceId]
          ? {
              ...s,
              [payload.surfaceId]: {
                ...s[payload.surfaceId]!,
                content: { kind: "tiptap-json", json: payload.content.tiptapJson },
              },
            }
          : s,
      );
    },
  };

  const reset = () => {
    setSurfaces(initial.surfaces);
    setEdges(initial.branchEdges);
  };

  return { surfaces, branchEdges, handlers, reset };
}
