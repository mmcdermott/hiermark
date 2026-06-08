import type { HamBranchEdge, HamBranchEdgeId, HamSurface, HamSurfaceId } from "../types";

export type HamTopologyIssueKind =
  | "missing-root"
  | "missing-surface"
  | "duplicate-incoming"
  | "cycle"
  | "unreachable";

export interface HamTopologyIssue {
  kind: HamTopologyIssueKind;
  /** The surface the issue is about, when applicable. */
  surfaceId?: HamSurfaceId;
  /** The edge(s) involved, when applicable. */
  edgeIds?: HamBranchEdgeId[];
  message: string;
}

export interface ValidateTopologyInput<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HamSurfaceId;
  surfaces: Record<HamSurfaceId, HamSurface<SurfaceMeta>>;
  branchEdges: HamBranchEdge<EdgeMeta>[];
}

/**
 * Validate a HAM topology against the tree invariant (spec §2). Pure and
 * synchronous, so a host can call it on save / in dev to surface problems the
 * tolerant projection would otherwise hide:
 *
 * - `missing-root` — the root surface id isn't in `surfaces`.
 * - `missing-surface` — an edge references a surface not in `surfaces`.
 * - `duplicate-incoming` — a surface has more than one incoming edge (the
 *   projection keeps only the first; the rest are silently dropped).
 * - `cycle` — the edges form a loop.
 * - `unreachable` — a non-root surface no edge path reaches from the root.
 *
 * @example A clean tree reports nothing.
 * ```ts
 * validateHamTopology({
 *   rootSurfaceId: "r",
 *   surfaces: { r: { id: "r", rootBlockId: "rb", content: { kind: "markdown", markdown: "" } } },
 *   branchEdges: [],
 * }); // => []
 * ```
 */
export function validateHamTopology<SurfaceMeta = unknown, EdgeMeta = unknown>(
  input: ValidateTopologyInput<SurfaceMeta, EdgeMeta>,
): HamTopologyIssue[] {
  const { rootSurfaceId, surfaces, branchEdges } = input;
  const issues: HamTopologyIssue[] = [];
  const has = (id: HamSurfaceId) => Object.prototype.hasOwnProperty.call(surfaces, id);

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
  const incomingBySurface = new Map<HamSurfaceId, HamBranchEdgeId[]>();
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

  // Cycle detection over the surface graph (fromSurface → toSurface).
  const adjacency = new Map<HamSurfaceId, HamSurfaceId[]>();
  for (const e of branchEdges) {
    const list = adjacency.get(e.fromSurfaceId) ?? [];
    list.push(e.toSurfaceId);
    adjacency.set(e.fromSurfaceId, list);
  }
  const state = new Map<HamSurfaceId, 0 | 1 | 2>(); // 0=unseen 1=in-stack 2=done
  let cycleFound = false;
  const visit = (id: HamSurfaceId) => {
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
    const reachable = new Set<HamSurfaceId>([rootSurfaceId]);
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
