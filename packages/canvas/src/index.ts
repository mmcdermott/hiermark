// @ham/canvas — a 2D canvas of editable HAM surfaces linked by branch edges.

export const HAM_CANVAS_VERSION = "0.1.0";

// Component + hook
export { HamCanvas } from "./HamCanvas";
export { useHamCanvas, siblingEdges, buildReorderEvent } from "./useHamCanvas";
export { computeSiblingInsert } from "./topology/reorderBranchSiblings";
export type { SiblingInsert } from "./topology/reorderBranchSiblings";
export type { UseHamCanvasResult, HamCanvasActions } from "./useHamCanvas";

// Pure topology
export { projectHamColumns } from "./topology/projectHamColumns";
export { getHamActivePath } from "./topology/getHamActivePath";
export { buildIndices, collectDescendants } from "./topology/buildIndices";
export type { HamTopologyIndices } from "./topology/buildIndices";
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
export { HamConnectorsOverlay, DefaultConnector } from "./connectors/HamConnectorsOverlay";
export { visibleEdges, connectorState, geometryFor } from "./connectors/connectors";
export type { EdgeGeometry, HamHoverTarget } from "./connectors/connectors";

// Public types
export type * from "./types";
