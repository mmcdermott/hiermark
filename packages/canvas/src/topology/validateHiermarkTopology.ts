import type { HiermarkBranchEdge, HiermarkBranchEdgeId, HiermarkSurface, HiermarkSurfaceId } from "../types";

export type HiermarkTopologyIssueKind =
  | "missing-root"
  | "missing-surface"
  | "duplicate-incoming"
  | "duplicate-sibling-order"
  | "cycle"
  | "unreachable";

export interface HiermarkTopologyIssue {
  kind: HiermarkTopologyIssueKind;
  /** The surface the issue is about, when applicable. */
  surfaceId?: HiermarkSurfaceId;
  /** The edge(s) involved, when applicable. */
  edgeIds?: HiermarkBranchEdgeId[];
  message: string;
}

export interface ValidateTopologyInput<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HiermarkSurfaceId;
  surfaces: Record<HiermarkSurfaceId, HiermarkSurface<SurfaceMeta>>;
  branchEdges: HiermarkBranchEdge<EdgeMeta>[];
}

/**
 * Validate a Hiermark topology against the tree invariant (spec §2). Pure and
 * synchronous, so a host can call it on save / in dev to surface problems the
 * tolerant projection would otherwise hide:
 *
 * - `missing-root` — the root surface id isn't in `surfaces`.
 * - `missing-surface` — an edge references a surface not in `surfaces`.
 * - `duplicate-incoming` — a surface has more than one incoming edge (the
 *   projection keeps only the first; the rest are silently dropped).
 * - `duplicate-sibling-order` — two same-anchor sibling edges share an
 *   `order` (display order and insert positions become ambiguous; sparse but
 *   UNIQUE orders are fine and not reported).
 * - `cycle` — the edges form a loop.
 * - `unreachable` — a non-root surface no edge path reaches from the root.
 *
 * @example A clean tree reports nothing.
 * ```ts
 * validateHiermarkTopology({
 *   rootSurfaceId: "r",
 *   surfaces: { r: { id: "r", rootBlockId: "rb", content: { kind: "markdown", markdown: "" } } },
 *   branchEdges: [],
 * }); // => []
 * ```
 */
export function validateHiermarkTopology<SurfaceMeta = unknown, EdgeMeta = unknown>(
  input: ValidateTopologyInput<SurfaceMeta, EdgeMeta>,
): HiermarkTopologyIssue[] {
  const { rootSurfaceId, surfaces, branchEdges } = input;
  const issues: HiermarkTopologyIssue[] = [];
  const has = (id: HiermarkSurfaceId) => Object.prototype.hasOwnProperty.call(surfaces, id);

  if (!has(rootSurfaceId)) {
    issues.push({
      kind: "missing-root",
      surfaceId: rootSurfaceId,
      message: `Root surface "${rootSurfaceId}" is not in surfaces.`,
    });
  }

  // Missing endpoints.
  for (const e of branchEdges) {
    if (!has(e.fromSurfaceId))
      issues.push({
        kind: "missing-surface",
        surfaceId: e.fromSurfaceId,
        edgeIds: [e.id],
        message: `Edge "${e.id}" starts at unknown surface "${e.fromSurfaceId}".`,
      });
    if (!has(e.toSurfaceId))
      issues.push({
        kind: "missing-surface",
        surfaceId: e.toSurfaceId,
        edgeIds: [e.id],
        message: `Edge "${e.id}" points to unknown surface "${e.toSurfaceId}".`,
      });
  }

  // Duplicate incoming edges (the tree invariant: one parent per surface).
  const incomingBySurface = new Map<HiermarkSurfaceId, HiermarkBranchEdgeId[]>();
  for (const e of branchEdges) {
    const list = incomingBySurface.get(e.toSurfaceId) ?? [];
    list.push(e.id);
    incomingBySurface.set(e.toSurfaceId, list);
  }
  for (const [surfaceId, edgeIds] of incomingBySurface) {
    if (edgeIds.length > 1)
      issues.push({
        kind: "duplicate-incoming",
        surfaceId,
        edgeIds,
        message: `Surface "${surfaceId}" has ${edgeIds.length} incoming edges; only the first is shown.`,
      });
  }

  // Duplicate sibling orders within one (fromSurface, fromBlock) anchor
  // group. Keyed with a NUL separator (ids may contain spaces); the surface id
  // is tracked alongside rather than re-split out of the key.
  const orderSeen = new Map<
    string,
    { fromSurfaceId: HiermarkSurfaceId; byOrder: Map<number, HiermarkBranchEdgeId[]> }
  >();
  for (const e of branchEdges) {
    const anchor = `${e.fromSurfaceId}\0${e.fromBlockId}`;
    const group = orderSeen.get(anchor) ?? {
      fromSurfaceId: e.fromSurfaceId,
      byOrder: new Map<number, HiermarkBranchEdgeId[]>(),
    };
    group.byOrder.set(e.order, [...(group.byOrder.get(e.order) ?? []), e.id]);
    orderSeen.set(anchor, group);
  }
  for (const { fromSurfaceId, byOrder } of orderSeen.values()) {
    for (const [order, edgeIds] of byOrder) {
      if (edgeIds.length > 1) {
        issues.push({
          kind: "duplicate-sibling-order",
          surfaceId: fromSurfaceId,
          edgeIds,
          message: `Sibling edges ${edgeIds.map((id) => `"${id}"`).join(", ")} share order ${order}; display order is ambiguous.`,
        });
      }
    }
  }

  // Cycle detection over the surface graph (fromSurface → toSurface).
  const adjacency = new Map<HiermarkSurfaceId, HiermarkSurfaceId[]>();
  for (const e of branchEdges) {
    const list = adjacency.get(e.fromSurfaceId) ?? [];
    list.push(e.toSurfaceId);
    adjacency.set(e.fromSurfaceId, list);
  }
  const state = new Map<HiermarkSurfaceId, 0 | 1 | 2>(); // 0=unseen 1=in-stack 2=done
  let cycleFound = false;
  const visit = (id: HiermarkSurfaceId) => {
    if (cycleFound) return;
    state.set(id, 1);
    for (const next of adjacency.get(id) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) {
        issues.push({
          kind: "cycle",
          surfaceId: next,
          message: `Cycle reaches surface "${next}".`,
        });
        cycleFound = true;
        return;
      }
      if (s === 0) visit(next);
      if (cycleFound) return;
    }
    state.set(id, 2);
  };
  for (const id of Object.keys(surfaces)) {
    if ((state.get(id) ?? 0) === 0) visit(id);
    if (cycleFound) break;
  }

  // Reachability from the root (skip if cyclic — traversal already partial).
  if (!cycleFound && has(rootSurfaceId)) {
    const reachable = new Set<HiermarkSurfaceId>([rootSurfaceId]);
    const queue = [rootSurfaceId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const id of Object.keys(surfaces)) {
      if (id !== rootSurfaceId && !reachable.has(id))
        issues.push({
          kind: "unreachable",
          surfaceId: id,
          message: `Surface "${id}" is not reachable from the root.`,
        });
    }
  }

  return issues;
}
