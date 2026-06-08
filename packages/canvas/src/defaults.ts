import type { HamCanvasBehaviorConfig, HamCanvasLayoutConfig } from "./types";

export const defaultLayout: HamCanvasLayoutConfig = {
  orientation: "left-to-right",
  columnWidth: 520,
  expandedColumnWidth: 720,
  railColumnWidth: 220,
  minSurfaceHeight: 120,
  columnGap: 24,
  surfaceGap: 16,
  padding: 24,
  activeColumnMode: "expanded",
  inactiveColumnMode: "card",
  appearance: "card",
  showConnectors: "active",
  connectorCurvature: 0.5,
  autoScroll: true,
  virtualizeColumns: false,
  virtualizeSurfaces: false,
};

export const defaultBehavior: HamCanvasBehaviorConfig = {
  enableSurfaceReorder: true,
  enableBranchCreation: true,
  enableSiblingBranchCreation: true,
  enableSurfaceDeletion: true,
  enableKeyboardNavigation: true,
  branchPolicy: "smart",
  deleteSurfacePolicy: "prevent-if-has-children",
  pendingOperationMode: "pessimistic",
};

export function resolveLayout(partial?: Partial<HamCanvasLayoutConfig>): HamCanvasLayoutConfig {
  return { ...defaultLayout, ...partial };
}

export function resolveBehavior(
  partial?: Partial<HamCanvasBehaviorConfig>,
): HamCanvasBehaviorConfig {
  return { ...defaultBehavior, ...partial };
}
