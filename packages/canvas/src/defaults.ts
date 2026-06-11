import type { HiermarkCanvasBehaviorConfig, HiermarkCanvasLayoutConfig } from "./types";

export const defaultLayout: HiermarkCanvasLayoutConfig = {
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
  columnScroll: false,
  showGroupHeaders: false,
};

export const defaultBehavior: HiermarkCanvasBehaviorConfig = {
  enableSurfaceReorder: true,
  enableBranchCreation: true,
  enableSiblingBranchCreation: true,
  enableSurfaceDeletion: true,
  enableKeyboardNavigation: true,
  branchPolicy: "bubble-up",
  deleteSurfacePolicy: "prevent-if-has-children",
};

export function resolveLayout(partial?: Partial<HiermarkCanvasLayoutConfig>): HiermarkCanvasLayoutConfig {
  return { ...defaultLayout, ...partial };
}

export function resolveBehavior(
  partial?: Partial<HiermarkCanvasBehaviorConfig>,
): HiermarkCanvasBehaviorConfig {
  return { ...defaultBehavior, ...partial };
}
