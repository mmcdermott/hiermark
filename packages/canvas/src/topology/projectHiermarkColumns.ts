import { resolveLayout } from "../defaults";
import type {
  HiermarkBranchEdge,
  HiermarkCanvasColumn,
  HiermarkCanvasItem,
  HiermarkProjectionInput,
  HiermarkSurfaceId,
  HiermarkSurfaceSnapshot,
} from "../types";
import { buildIndices, collectDescendants, type HiermarkTopologyIndices } from "./buildIndices";
import { getHiermarkActivePath } from "./getHiermarkActivePath";
import { buildPathStateContext, computePathState, pickDisplayMode } from "./pathState";

/**
 * The snapshot-independent half of a projection: the edge indices plus a
 * per-surface item (path state + display mode) for every surface. Surface
 * *snapshots* only influence sibling ordering within a column — never which
 * surface lands in which column nor its display mode — so a host can memoize
 * this on topology / active-path / layout changes and re-run only the cheap
 * snapshot-driven ordering ({@link projectColumnsFromContext}) when a snapshot
 * updates (e.g. on every keystroke's debounced snapshot).
 */
export interface HiermarkProjectionContext<SurfaceMeta = unknown, EdgeMeta = unknown> {
  indices: HiermarkTopologyIndices<EdgeMeta>;
  itemBySurface: Map<HiermarkSurfaceId, HiermarkCanvasItem<SurfaceMeta, EdgeMeta>>;
}

/**
 * The input to {@link buildProjectionContext}: a projection input minus the
 * snapshots (which it never reads). Carving the snapshot field out of the type
 * lets a host memoize the context on a snapshot-free dependency list without
 * tripping exhaustive-deps lint.
 */
export type HiermarkProjectionContextInput<SurfaceMeta = unknown, EdgeMeta = unknown> = Omit<
  HiermarkProjectionInput<SurfaceMeta, EdgeMeta>,
  "snapshotsBySurfaceId"
>;

/**
 * Compute the topology- and active-path-derived half of a projection. Does NOT
 * read snapshots, so its result is stable across snapshot-only updates.
 */
export function buildProjectionContext<SurfaceMeta = unknown, EdgeMeta = unknown>(
  input: HiermarkProjectionContextInput<SurfaceMeta, EdgeMeta>,
): HiermarkProjectionContext<SurfaceMeta, EdgeMeta> {
  const layout = resolveLayout(input.layout);
  const indices = buildIndices(input.branchEdges);
  const { childEdgesBySurface, incomingEdgeByToSurface } = indices;

  const activePath = getHiermarkActivePath({
    rootSurfaceId: input.rootSurfaceId,
    activeSurfaceId: input.activeSurfaceId,
    activeBlockId: input.activeBlockId,
    indices,
  });
  const descendantsOfActive = collectDescendants(input.activeSurfaceId, childEdgesBySurface);
  const pathCtx = buildPathStateContext(activePath, descendantsOfActive, indices);
  const collapsed = input.collapsedSurfaceIds ?? new Set<HiermarkSurfaceId>();

  const itemBySurface = new Map<HiermarkSurfaceId, HiermarkCanvasItem<SurfaceMeta, EdgeMeta>>();
  for (const surfaceId of Object.keys(input.surfaces)) {
    const surface = input.surfaces[surfaceId];
    if (!surface) continue;
    const incomingEdge = incomingEdgeByToSurface.get(surfaceId) as
      | HiermarkBranchEdge<EdgeMeta>
      | undefined;
    const pathState = computePathState(surfaceId, pathCtx);
    const displayMode = pickDisplayMode(pathState, collapsed.has(surfaceId), layout);
    itemBySurface.set(surfaceId, {
      surface,
      ...(incomingEdge ? { incomingEdge } : {}),
      ...(incomingEdge ? { parentSurfaceId: incomingEdge.fromSurfaceId } : {}),
      ...(incomingEdge ? { anchorBlockId: incomingEdge.fromBlockId } : {}),
      pathState,
      displayMode,
    });
  }
  return { indices, itemBySurface };
}

/**
 * Sort a surface's outgoing edges by (source-block preorder rank, fromBlockId,
 * edge.order) (spec §6.10 rules 3–4). Stale anchors — blocks no longer in the
 * parent snapshot — sort last rather than throwing.
 */
function sortOutgoing<EdgeMeta>(
  edges: HiermarkBranchEdge<EdgeMeta>[],
  snapshot: HiermarkSurfaceSnapshot | undefined,
): HiermarkBranchEdge<EdgeMeta>[] {
  const blockRank = new Map<string, number>();
  snapshot?.blockOrder.forEach((id, i) => blockRank.set(id, i));
  return [...edges].sort((a, b) => {
    const ar = blockRank.get(a.fromBlockId) ?? Number.MAX_SAFE_INTEGER;
    const br = blockRank.get(b.fromBlockId) ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    if (a.fromBlockId !== b.fromBlockId) return a.fromBlockId.localeCompare(b.fromBlockId);
    return a.order - b.order;
  });
}

/**
 * Project surfaces + branch edges into depth-banded columns (spec §6.10). A
 * column can hold surfaces branched from different blocks of different parents;
 * within a column, items are grouped by parent (in the parent's column order)
 * and ordered by the source block's preorder rank then edge order. Each item
 * carries its incoming edge, parentage, path state, and display mode.
 */
export function projectHiermarkColumns<SurfaceMeta = unknown, EdgeMeta = unknown>(
  input: HiermarkProjectionInput<SurfaceMeta, EdgeMeta>,
): HiermarkCanvasColumn<SurfaceMeta, EdgeMeta>[] {
  return projectColumnsFromContext(buildProjectionContext(input), input);
}

/**
 * BFS the surface tree into depth-banded columns, ordering each parent's
 * children by source-block preorder (from `input.snapshotsBySurfaceId`). Reuses
 * the precomputed per-surface items in `ctx`, so a snapshot-only update re-runs
 * just this ordering pass — not the index/active-path/display-mode work in
 * {@link buildProjectionContext}.
 */
export function projectColumnsFromContext<SurfaceMeta = unknown, EdgeMeta = unknown>(
  ctx: HiermarkProjectionContext<SurfaceMeta, EdgeMeta>,
  input: HiermarkProjectionInput<SurfaceMeta, EdgeMeta>,
): HiermarkCanvasColumn<SurfaceMeta, EdgeMeta>[] {
  const { childEdgesBySurface } = ctx.indices;

  const columns: HiermarkCanvasColumn<SurfaceMeta, EdgeMeta>[] = [];
  const visited = new Set<HiermarkSurfaceId>();
  let current: HiermarkSurfaceId[] = input.surfaces[input.rootSurfaceId] ? [input.rootSurfaceId] : [];
  for (const id of current) visited.add(id);
  let depth = 0;

  while (current.length > 0) {
    const items = current
      .map((id) => ctx.itemBySurface.get(id))
      .filter((item): item is HiermarkCanvasItem<SurfaceMeta, EdgeMeta> => item !== undefined);
    columns.push({ depth, items });

    const next: HiermarkSurfaceId[] = [];
    for (const surfaceId of current) {
      const outgoing = sortOutgoing(
        childEdgesBySurface.get(surfaceId) ?? [],
        input.snapshotsBySurfaceId[surfaceId],
      );
      for (const edge of outgoing) {
        if (!visited.has(edge.toSurfaceId) && input.surfaces[edge.toSurfaceId]) {
          visited.add(edge.toSurfaceId);
          next.push(edge.toSurfaceId);
        }
      }
    }
    current = next;
    depth += 1;
  }

  // Surfaces unreachable from the root (orphans / detached subtrees) would
  // otherwise be silently invisible. Project them into trailing `detached`
  // columns, seeded from the detached "local roots" (those not reached by
  // another detached surface), so the data is never lost from view.
  const remaining = Object.keys(input.surfaces).filter(
    (id) => input.surfaces[id] && !visited.has(id),
  );
  if (remaining.length > 0) {
    const remainingSet = new Set(remaining);
    const reachedWithin = new Set<HiermarkSurfaceId>();
    for (const fromId of remaining) {
      for (const edge of childEdgesBySurface.get(fromId) ?? []) {
        if (remainingSet.has(edge.toSurfaceId)) reachedWithin.add(edge.toSurfaceId);
      }
    }
    // Local roots, then any cycle-only remainder (no entry point) so nothing is dropped.
    let detachedCurrent = remaining.filter((id) => !reachedWithin.has(id));
    if (detachedCurrent.length === 0) detachedCurrent = remaining;
    for (const id of detachedCurrent) visited.add(id);
    let detachedDepth = 0;

    while (detachedCurrent.length > 0) {
      const items = detachedCurrent
        .map((id) => ctx.itemBySurface.get(id))
        .filter((item): item is HiermarkCanvasItem<SurfaceMeta, EdgeMeta> => item !== undefined);
      columns.push({ depth: depth + detachedDepth, items, detached: true });

      const next: HiermarkSurfaceId[] = [];
      for (const surfaceId of detachedCurrent) {
        const outgoing = sortOutgoing(
          childEdgesBySurface.get(surfaceId) ?? [],
          input.snapshotsBySurfaceId[surfaceId],
        );
        for (const edge of outgoing) {
          if (!visited.has(edge.toSurfaceId) && input.surfaces[edge.toSurfaceId]) {
            visited.add(edge.toSurfaceId);
            next.push(edge.toSurfaceId);
          }
        }
      }
      detachedCurrent = next;
      detachedDepth += 1;
    }
  }

  return columns;
}
