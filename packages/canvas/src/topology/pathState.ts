import type {
  HiermarkActivePath,
  HiermarkBranchEdge,
  HiermarkCanvasLayoutConfig,
  HiermarkPathState,
  HiermarkSurfaceDisplayMode,
  HiermarkSurfaceId,
} from "../types";
import type { HiermarkTopologyIndices } from "./buildIndices";

export interface PathStateContext {
  activeSurfaceId: HiermarkSurfaceId;
  activeSurfaceSet: Set<HiermarkSurfaceId>;
  descendantsOfActive: Set<HiermarkSurfaceId>;
  incomingEdgeByToSurface: Map<HiermarkSurfaceId, HiermarkBranchEdge>;
}

/** Parent (source surface) of a surface, via its incoming edge. */
function parentOf(
  surfaceId: HiermarkSurfaceId,
  incoming: Map<HiermarkSurfaceId, HiermarkBranchEdge>,
): { surface?: HiermarkSurfaceId; block?: HiermarkSurfaceId } {
  const edge = incoming.get(surfaceId);
  return { surface: edge?.fromSurfaceId, block: edge?.fromBlockId };
}

/**
 * Classify a surface relative to the active path (spec §2.4). A "sibling" shares
 * both the same parent surface *and* the same anchor block as the active surface
 * (the strict definition that also governs reorder eligibility).
 */
export function computePathState(surfaceId: HiermarkSurfaceId, ctx: PathStateContext): HiermarkPathState {
  if (surfaceId === ctx.activeSurfaceId) return "active";
  if (ctx.activeSurfaceSet.has(surfaceId)) return "ancestor";
  if (ctx.descendantsOfActive.has(surfaceId)) return "descendant";

  const self = parentOf(surfaceId, ctx.incomingEdgeByToSurface);
  const active = parentOf(ctx.activeSurfaceId, ctx.incomingEdgeByToSurface);
  if (
    self.surface != null &&
    self.surface === active.surface &&
    self.block != null &&
    self.block === active.block
  ) {
    return "sibling";
  }
  return "unrelated";
}

/** Map path state + collapse + layout to a display mode (spec §2.4 / §6.11). */
export function pickDisplayMode(
  pathState: HiermarkPathState,
  isCollapsed: boolean,
  layout: HiermarkCanvasLayoutConfig,
): HiermarkSurfaceDisplayMode {
  // The active path must remain visible even when its columns are compacted.
  const onActivePath = pathState === "active" || pathState === "ancestor";

  if (isCollapsed && !onActivePath) {
    return layout.inactiveColumnMode === "hidden" ? "hidden" : "rail";
  }

  switch (pathState) {
    case "active":
      return layout.activeColumnMode === "expanded" ? "expanded" : "card";
    case "ancestor":
    case "sibling":
    case "descendant":
      return layout.inactiveColumnMode === "hidden" ? "card" : layout.inactiveColumnMode;
    case "unrelated":
    default:
      return layout.inactiveColumnMode;
  }
}

export function buildPathStateContext(
  activePath: HiermarkActivePath,
  descendantsOfActive: Set<HiermarkSurfaceId>,
  indices: HiermarkTopologyIndices,
): PathStateContext {
  return {
    activeSurfaceId: activePath.activeSurfaceId,
    activeSurfaceSet: new Set(activePath.surfaceIds),
    descendantsOfActive,
    incomingEdgeByToSurface: indices.incomingEdgeByToSurface,
  };
}
