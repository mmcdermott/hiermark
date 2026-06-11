import type { HiermarkBranchEdge, HiermarkSurfaceId } from "../types";

export interface HiermarkTopologyIndices<EdgeMeta = unknown> {
  /** Outgoing branch edges grouped by source surface. */
  childEdgesBySurface: Map<HiermarkSurfaceId, HiermarkBranchEdge<EdgeMeta>[]>;
  /** The (single) incoming edge per target surface — i.e. the surface's parent edge. */
  incomingEdgeByToSurface: Map<HiermarkSurfaceId, HiermarkBranchEdge<EdgeMeta>>;
}

/**
 * Recover adjacency from the flat edge list. O(E). The topology is tree-shaped
 * (each surface has at most one incoming edge); if the host supplies a DAG, the
 * first-seen incoming edge wins and the projection's `visited` set keeps things
 * acyclic.
 */
export function buildIndices<EdgeMeta = unknown>(
  branchEdges: HiermarkBranchEdge<EdgeMeta>[],
): HiermarkTopologyIndices<EdgeMeta> {
  const childEdgesBySurface = new Map<HiermarkSurfaceId, HiermarkBranchEdge<EdgeMeta>[]>();
  const incomingEdgeByToSurface = new Map<HiermarkSurfaceId, HiermarkBranchEdge<EdgeMeta>>();

  for (const edge of branchEdges) {
    const list = childEdgesBySurface.get(edge.fromSurfaceId);
    if (list) list.push(edge);
    else childEdgesBySurface.set(edge.fromSurfaceId, [edge]);

    if (!incomingEdgeByToSurface.has(edge.toSurfaceId)) {
      incomingEdgeByToSurface.set(edge.toSurfaceId, edge);
    }
  }

  return { childEdgesBySurface, incomingEdgeByToSurface };
}

/** All surfaces reachable from `start` via outgoing edges (excludes `start`). */
export function collectDescendants<EdgeMeta = unknown>(
  start: HiermarkSurfaceId,
  childEdgesBySurface: Map<HiermarkSurfaceId, HiermarkBranchEdge<EdgeMeta>[]>,
): Set<HiermarkSurfaceId> {
  const out = new Set<HiermarkSurfaceId>();
  const queue: HiermarkSurfaceId[] = [start];
  const seen = new Set<HiermarkSurfaceId>([start]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of childEdgesBySurface.get(current) ?? []) {
      if (!seen.has(edge.toSurfaceId)) {
        seen.add(edge.toSurfaceId);
        out.add(edge.toSurfaceId);
        queue.push(edge.toSurfaceId);
      }
    }
  }
  return out;
}
