// @hiermark/canvas — a 2D canvas of editable Hiermark surfaces linked by branch edges.

export const HIERMARK_CANVAS_VERSION = "0.1.0";

// Component + hook
export { HiermarkCanvas } from "./HiermarkCanvas";
export { useHiermarkCanvas, siblingEdges, buildReorderEvent } from "./useHiermarkCanvas";
export { computeSiblingInsert } from "./topology/reorderBranchSiblings";
export type { SiblingInsert } from "./topology/reorderBranchSiblings";
export { siblingEdgeOrder } from "./topology/siblingOrder";
export type { UseHiermarkCanvasResult, HiermarkCanvasActions } from "./useHiermarkCanvas";

// Pure topology
export {
  projectHiermarkColumns,
  buildProjectionContext,
  projectColumnsFromContext,
} from "./topology/projectHiermarkColumns";
export type { HiermarkProjectionContext, HiermarkProjectionContextInput } from "./topology/projectHiermarkColumns";
export { getHiermarkActivePath } from "./topology/getHiermarkActivePath";
export { buildIndices, collectDescendants } from "./topology/buildIndices";
export type { HiermarkTopologyIndices } from "./topology/buildIndices";
export { validateHiermarkTopology } from "./topology/validateHiermarkTopology";
export type { HiermarkTopologyIssue, HiermarkTopologyIssueKind } from "./topology/validateHiermarkTopology";
export { computePathState, pickDisplayMode, buildPathStateContext } from "./topology/pathState";
export type { PathStateContext } from "./topology/pathState";
export {
  reorderSiblingEdgesByIndex,
  reorderSiblingEdgesByIds,
  areSameAnchorSiblings,
} from "./topology/reorderBranchSiblings";

// Config defaults
export { defaultLayout, defaultBehavior, resolveLayout, resolveBehavior } from "./defaults";

// Connectors (cross-column edge overlay)
export { HiermarkConnectorsOverlay, DefaultConnector } from "./connectors/HiermarkConnectorsOverlay";
export { visibleEdges, connectorState, geometryFor } from "./connectors/connectors";
export type { EdgeGeometry, HiermarkHoverTarget } from "./connectors/connectors";

// Public types
export type * from "./types";
