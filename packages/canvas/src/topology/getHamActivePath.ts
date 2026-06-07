import type { HamBranchEdge, HamSurfaceId } from "../types";
import type { HamActivePath } from "../types";
import { buildIndices, type HamTopologyIndices } from "./buildIndices";

export interface ActivePathInput<EdgeMeta = unknown> {
  rootSurfaceId: HamSurfaceId;
  activeSurfaceId: HamSurfaceId;
  activeBlockId?: HamBlockId | null;
  branchEdges?: HamBranchEdge<EdgeMeta>[];
  indices?: HamTopologyIndices<EdgeMeta>;
}

type HamBlockId = string;

/**
 * Compute the root→active branch-edge lineage (spec §2.6) by walking *up* from
 * the active surface to the root via incoming edges, then reversing. Guards
 * against malformed/cyclic edge data (the reference never needed this — its
 * single-parent tree couldn't loop going up).
 *
 * If the active surface is unreachable from the root (an orphan), the path is
 * clamped to just `[activeSurfaceId]`.
 */
export function getHamActivePath<EdgeMeta = unknown>(
  input: ActivePathInput<EdgeMeta>,
): HamActivePath {
  const { rootSurfaceId, activeSurfaceId, activeBlockId } = input;
  const { incomingEdgeByToSurface } = input.indices ?? buildIndices(input.branchEdges ?? []);

  const surfaceIds: HamSurfaceId[] = [];
  const edgeIds: string[] = [];
  const anchorBlockIds: HamBlockId[] = [];

  const guard = new Set<HamSurfaceId>();
  let cursor: HamSurfaceId | undefined = activeSurfaceId;

  while (cursor != null) {
    surfaceIds.push(cursor);
    if (cursor === rootSurfaceId) break;
    const edge = incomingEdgeByToSurface.get(cursor);
    if (!edge) break; // reached a root (or an orphan's local root)
    edgeIds.push(edge.id);
    anchorBlockIds.push(edge.fromBlockId);
    if (guard.has(edge.fromSurfaceId)) break; // cycle — bail defensively
    guard.add(edge.fromSurfaceId);
    cursor = edge.fromSurfaceId;
  }

  surfaceIds.reverse();
  edgeIds.reverse();
  anchorBlockIds.reverse();

  // Orphan clamp: if the walk didn't reach the root, the active surface isn't
  // reachable — represent the path as just the active surface.
  if (surfaceIds[0] !== rootSurfaceId) {
    return {
      rootSurfaceId,
      activeSurfaceId,
      activeBlockId: activeBlockId ?? null,
      surfaceIds: [activeSurfaceId],
      edgeIds: [],
      anchorBlockIds: [],
    };
  }

  return {
    rootSurfaceId,
    activeSurfaceId,
    activeBlockId: activeBlockId ?? null,
    surfaceIds,
    edgeIds,
    anchorBlockIds,
  };
}
