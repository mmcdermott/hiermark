import type {
  HamBranchEdge,
  HamBranchEdgeId,
  HamReorderBranchSiblingsEvent,
  HamSurfaceId,
} from "../types";

/** The edges branching from one source block, in current order. */
export function siblingEdges<EdgeMeta>(
  branchEdges: HamBranchEdge<EdgeMeta>[],
  fromSurfaceId: HamSurfaceId,
  fromBlockId: string,
): HamBranchEdge<EdgeMeta>[] {
  return branchEdges
    .filter((e) => e.fromSurfaceId === fromSurfaceId && e.fromBlockId === fromBlockId)
    .sort((a, b) => a.order - b.order);
}

export interface SiblingInsert {
  /** The 0-based order the new sibling edge should take. */
  insertOrder: number;
  /** New orders for displaced existing siblings, keyed by edge id. */
  shiftedSiblingOrders: Record<HamBranchEdgeId, number>;
}

/**
 * Resolve a gap-insert into a dense sibling group (Option A — integer renumber,
 * preserving the dense `0..n` invariant `applyOrder` guarantees). The new edge
 * takes `insertOrder`; every existing sibling with `order >= insertOrder` shifts
 * up by one. Pure, so the position math is unit-testable.
 */
export function computeSiblingInsert<EdgeMeta>(
  group: HamBranchEdge<EdgeMeta>[],
  insertOrder: number,
): SiblingInsert {
  const shiftedSiblingOrders: Record<HamBranchEdgeId, number> = {};
  for (const e of group) if (e.order >= insertOrder) shiftedSiblingOrders[e.id] = e.order + 1;
  return { insertOrder, shiftedSiblingOrders };
}

/**
 * Whether every edge id refers to an edge sharing the same
 * `(fromSurfaceId, fromBlockId)` — the strict reorder eligibility rule (spec
 * §8.3). Cross-anchor drops must be rejected.
 */
export function areSameAnchorSiblings<EdgeMeta>(
  branchEdges: HamBranchEdge<EdgeMeta>[],
  orderedEdgeIds: HamBranchEdgeId[],
): boolean {
  const byId = new Map(branchEdges.map((e) => [e.id, e]));
  let anchor: { s: HamSurfaceId; b: string } | null = null;
  for (const id of orderedEdgeIds) {
    const edge = byId.get(id);
    if (!edge) return false;
    if (anchor == null) anchor = { s: edge.fromSurfaceId, b: edge.fromBlockId };
    else if (edge.fromSurfaceId !== anchor.s || edge.fromBlockId !== anchor.b) return false;
  }
  return anchor != null;
}

/**
 * Reorder same-anchor sibling edges by moving the sibling at `from` to `to`
 * (splice with `to` clamped into range). Returns the **same array reference**
 * when `from` is out of range (no-op contract preserved from the reference), and
 * otherwise a new array where the moved group's `order` is renormalized to a
 * dense 0..n-1 and all other edges are untouched.
 */
export function reorderSiblingEdgesByIndex<EdgeMeta>(
  branchEdges: HamBranchEdge<EdgeMeta>[],
  fromSurfaceId: HamSurfaceId,
  fromBlockId: string,
  from: number,
  to: number,
): HamBranchEdge<EdgeMeta>[] {
  const group = siblingEdges(branchEdges, fromSurfaceId, fromBlockId);
  if (from < 0 || from >= group.length) return branchEdges;
  const reordered = [...group];
  const [moved] = reordered.splice(from, 1);
  if (!moved) return branchEdges;
  reordered.splice(Math.max(0, Math.min(to, reordered.length)), 0, moved);
  return applyOrder(branchEdges, reordered);
}

/**
 * Apply an explicit sibling order (e.g. from a dnd-kit drop) identified by edge
 * ids. Validates same-anchor membership; returns the same reference (unchanged)
 * if the order is invalid or a no-op.
 */
export function reorderSiblingEdgesByIds<EdgeMeta>(
  branchEdges: HamBranchEdge<EdgeMeta>[],
  orderedEdgeIds: HamBranchEdgeId[],
): HamBranchEdge<EdgeMeta>[] {
  if (!areSameAnchorSiblings(branchEdges, orderedEdgeIds)) return branchEdges;
  // Must be an exact permutation of the full sibling group — a partial or
  // duplicated list would otherwise violate the dense-order invariant.
  if (new Set(orderedEdgeIds).size !== orderedEdgeIds.length) return branchEdges;
  const byId = new Map(branchEdges.map((e) => [e.id, e]));
  const first = byId.get(orderedEdgeIds[0]!)!;
  const group = siblingEdges(branchEdges, first.fromSurfaceId, first.fromBlockId);
  if (group.length !== orderedEdgeIds.length) return branchEdges;
  const reordered = orderedEdgeIds.map((id) => byId.get(id)!);
  return applyOrder(branchEdges, reordered);
}

/** Renormalize `order` across the reordered group and splice them back. */
function applyOrder<EdgeMeta>(
  branchEdges: HamBranchEdge<EdgeMeta>[],
  reorderedGroup: HamBranchEdge<EdgeMeta>[],
): HamBranchEdge<EdgeMeta>[] {
  const newOrderById = new Map<HamBranchEdgeId, number>();
  reorderedGroup.forEach((e, i) => newOrderById.set(e.id, i));
  let changed = false;
  const next = branchEdges.map((e) => {
    const order = newOrderById.get(e.id);
    if (order == null || order === e.order) return e;
    changed = true;
    return { ...e, order };
  });
  return changed ? next : branchEdges;
}

/** Build the host event for a confirmed sibling reorder. */
export function buildReorderEvent<EdgeMeta>(
  branchEdges: HamBranchEdge<EdgeMeta>[],
  fromSurfaceId: HamSurfaceId,
  fromBlockId: string,
): HamReorderBranchSiblingsEvent {
  const group = siblingEdges(branchEdges, fromSurfaceId, fromBlockId);
  return {
    fromSurfaceId,
    fromBlockId,
    orderedEdgeIds: group.map((e) => e.id),
    orderedSurfaceIds: group.map((e) => e.toSurfaceId),
  };
}
