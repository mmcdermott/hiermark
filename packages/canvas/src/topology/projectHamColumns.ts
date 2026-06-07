import { resolveLayout } from "../defaults";
import type {
  HamBranchEdge,
  HamCanvasColumn,
  HamCanvasItem,
  HamProjectionInput,
  HamSurfaceId,
  HamSurfaceSnapshot,
} from "../types";
import { buildIndices, collectDescendants } from "./buildIndices";
import { getHamActivePath } from "./getHamActivePath";
import { buildPathStateContext, computePathState, pickDisplayMode } from "./pathState";

/**
 * Sort a surface's outgoing edges by (source-block preorder rank, fromBlockId,
 * edge.order) (spec §6.10 rules 3–4). Stale anchors — blocks no longer in the
 * parent snapshot — sort last rather than throwing.
 */
function sortOutgoing<EdgeMeta>(
  edges: HamBranchEdge<EdgeMeta>[],
  snapshot: HamSurfaceSnapshot | undefined,
): HamBranchEdge<EdgeMeta>[] {
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
export function projectHamColumns<SurfaceMeta = unknown, EdgeMeta = unknown>(
  input: HamProjectionInput<SurfaceMeta, EdgeMeta>,
): HamCanvasColumn<SurfaceMeta, EdgeMeta>[] {
  const layout = resolveLayout(input.layout);
  const indices = buildIndices(input.branchEdges);
  const { childEdgesBySurface, incomingEdgeByToSurface } = indices;

  const activePath = getHamActivePath({
    rootSurfaceId: input.rootSurfaceId,
    activeSurfaceId: input.activeSurfaceId,
    activeBlockId: input.activeBlockId,
    indices,
  });
  const descendantsOfActive = collectDescendants(input.activeSurfaceId, childEdgesBySurface);
  const pathCtx = buildPathStateContext(activePath, descendantsOfActive, indices);
  const collapsed = input.collapsedSurfaceIds ?? new Set<HamSurfaceId>();

  const buildItem = (surfaceId: HamSurfaceId): HamCanvasItem<SurfaceMeta, EdgeMeta> | null => {
    const surface = input.surfaces[surfaceId];
    if (!surface) return null;
    const incomingEdge = incomingEdgeByToSurface.get(surfaceId) as
      | HamBranchEdge<EdgeMeta>
      | undefined;
    const pathState = computePathState(surfaceId, pathCtx);
    const displayMode = pickDisplayMode(pathState, collapsed.has(surfaceId), layout);
    return {
      surface,
      ...(incomingEdge ? { incomingEdge } : {}),
      ...(incomingEdge ? { parentSurfaceId: incomingEdge.fromSurfaceId } : {}),
      ...(incomingEdge ? { anchorBlockId: incomingEdge.fromBlockId } : {}),
      pathState,
      displayMode,
    };
  };

  const columns: HamCanvasColumn<SurfaceMeta, EdgeMeta>[] = [];
  const visited = new Set<HamSurfaceId>();
  let current: HamSurfaceId[] = input.surfaces[input.rootSurfaceId] ? [input.rootSurfaceId] : [];
  for (const id of current) visited.add(id);
  let depth = 0;

  while (current.length > 0) {
    const items = current
      .map(buildItem)
      .filter((item): item is HamCanvasItem<SurfaceMeta, EdgeMeta> => item !== null);
    columns.push({ depth, items });

    const next: HamSurfaceId[] = [];
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

  return columns;
}
