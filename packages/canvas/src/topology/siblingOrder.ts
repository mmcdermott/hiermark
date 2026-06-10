import type { HamBranchEdge, HamSurfaceId } from "../types";

/**
 * The edge ids of one sibling group — branches sharing a `(fromSurfaceId,
 * fromBlockId)` anchor — in their current `order`. This is the unit the canvas
 * captures for reorder undo/redo (re-applying a stored order reverts a drag).
 */
export function siblingEdgeOrder<EdgeMeta = unknown>(
  edges: HamBranchEdge<EdgeMeta>[],
  fromSurfaceId: HamSurfaceId,
  fromBlockId: string,
): string[] {
  return edges
    .filter((e) => e.fromSurfaceId === fromSurfaceId && e.fromBlockId === fromBlockId)
    .sort((a, b) => a.order - b.order)
    .map((e) => e.id);
}
