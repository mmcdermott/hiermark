import type {
  HamAnnotationRegistry,
  HamBlockId,
  HamBlockSnapshot,
  HamBranchEdgeId,
  HamBranchPolicy,
  HamBranchRequestEvent,
  HamEditorContent,
  HamEditorProps,
  HamEditorSavePayload,
  HamSurfaceId,
  HamSurfaceSnapshot,
} from "@ham/editor";
import type { ComponentType, ReactNode } from "react";

export type {
  HamSurfaceId,
  HamBlockId,
  HamBranchEdgeId,
  HamSurfaceSnapshot,
  HamBlockSnapshot,
  HamBranchPolicy,
  HamEditorContent,
  HamEditorSavePayload,
};

// ---------------------------------------------------------------------------
// Surface + edge model (spec §2.1, §2.3)
// ---------------------------------------------------------------------------

/** An editable block tree displayed on the canvas. */
export interface HamSurface<Meta = unknown> {
  id: HamSurfaceId;
  rootBlockId: HamBlockId;
  title?: string;
  meta?: Meta;
  content: HamEditorContent;
  readonly?: boolean;
}

/** Connects a source block in one surface to a target surface (one column right). */
export interface HamBranchEdge<Meta = unknown> {
  id: HamBranchEdgeId;
  fromSurfaceId: HamSurfaceId;
  fromBlockId: HamBlockId;
  toSurfaceId: HamSurfaceId;
  /** Sibling order among branches from the same source block. */
  order: number;
  meta?: Meta;
}

// ---------------------------------------------------------------------------
// Projection output (spec §2.4)
// ---------------------------------------------------------------------------

export type HamPathState = "active" | "ancestor" | "descendant" | "sibling" | "unrelated";

export type HamSurfaceDisplayMode = "expanded" | "card" | "outline" | "rail" | "hidden";

export interface HamCanvasItem<SurfaceMeta = unknown, EdgeMeta = unknown> {
  surface: HamSurface<SurfaceMeta>;
  incomingEdge?: HamBranchEdge<EdgeMeta>;
  parentSurfaceId?: HamSurfaceId;
  anchorBlockId?: HamBlockId;
  pathState: HamPathState;
  displayMode: HamSurfaceDisplayMode;
}

export interface HamCanvasColumn<SurfaceMeta = unknown, EdgeMeta = unknown> {
  depth: number;
  items: HamCanvasItem<SurfaceMeta, EdgeMeta>[];
}

/** The branch-edge lineage from the root surface to the active surface (spec §2.6). */
export interface HamActivePath {
  rootSurfaceId: HamSurfaceId;
  activeSurfaceId: HamSurfaceId;
  activeBlockId?: HamBlockId | null;
  surfaceIds: HamSurfaceId[];
  edgeIds: HamBranchEdgeId[];
  anchorBlockIds: HamBlockId[];
}

export interface HamProjectionInput<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HamSurfaceId;
  surfaces: Record<HamSurfaceId, HamSurface<SurfaceMeta>>;
  branchEdges: HamBranchEdge<EdgeMeta>[];
  snapshotsBySurfaceId: Record<HamSurfaceId, HamSurfaceSnapshot | undefined>;
  activeSurfaceId: HamSurfaceId;
  activeBlockId?: HamBlockId | null;
  collapsedSurfaceIds?: Set<HamSurfaceId>;
  layout?: HamCanvasLayoutConfig;
}

// ---------------------------------------------------------------------------
// Layout + behavior config (spec §6.4, §6.5)
// ---------------------------------------------------------------------------

export interface HamCanvasLayoutConfig {
  orientation: "left-to-right";
  columnWidth: number;
  expandedColumnWidth: number;
  railColumnWidth: number;
  minSurfaceHeight: number;
  maxSurfaceHeight?: number;
  columnGap: number;
  surfaceGap: number;
  padding: number;
  activeColumnMode: "expanded" | "normal";
  /**
   * How surfaces that aren't the active one are shown. `"expanded"` keeps every
   * surface as a full editor (nothing collapses when you branch) — good on a
   * wide screen; the others compact inactive surfaces.
   */
  inactiveColumnMode: "card" | "outline" | "rail" | "hidden" | "expanded";
  /**
   * Visual treatment of the surfaces. `"card"` (default) renders each surface as
   * a separate bordered, shadowed card. `"flat"` drops the per-surface chrome and
   * tightens gaps so a column reads as one holistic editor with hairline
   * dividers. `"plain"` removes all chrome (no borders, shadows, or backgrounds).
   */
  appearance: "card" | "flat" | "plain";
  /**
   * Whether to draw connector lines from a source block to its child surfaces
   * across columns. `"off"` draws none; `"active"` (default) only the active
   * lineage; `"all"` every edge; `"hover"` only edges incident to the hovered
   * surface (plus the active lineage).
   */
  showConnectors: "off" | "all" | "active" | "hover";
  /** Curvature of connector paths, 0 (straight) … 1 (deeply curved). Default 0.5. */
  connectorCurvature: number;
  autoScroll: boolean;
  virtualizeColumns: boolean;
  virtualizeSurfaces: boolean;
}

export type HamDeleteSurfacePolicy =
  | "prevent-if-has-children"
  | "delete-subtree"
  | "detach-children";

export interface HamCanvasBehaviorConfig {
  enableSurfaceReorder: boolean;
  enableBranchCreation: boolean;
  enableSiblingBranchCreation: boolean;
  enableSurfaceDeletion: boolean;
  enableKeyboardNavigation: boolean;
  branchPolicy: HamBranchPolicy;
  deleteSurfacePolicy: HamDeleteSurfacePolicy;
  pendingOperationMode: "optimistic" | "pessimistic";
}

// ---------------------------------------------------------------------------
// Handlers + operation events (spec §6.6–6.9)
// ---------------------------------------------------------------------------

export interface HamCreateSurfaceFromBlockEvent {
  sourceSurfaceId: HamSurfaceId;
  sourceBlockId: HamBlockId;
  sourceBlockSnapshot: HamBlockSnapshot;
  sourceSurfaceSnapshot: HamSurfaceSnapshot;
  suggestedTitle?: string;
  insertAfterEdgeId?: HamBranchEdgeId;
  saveSourceSurface: () => Promise<HamEditorSavePayload>;
}

export interface HamCreateSiblingSurfaceEvent {
  fromSurfaceId: HamSurfaceId;
  fromBlockId: HamBlockId;
  insertAfterEdgeId?: HamBranchEdgeId;
  /**
   * The 0-based order the canvas computed for the new edge. The host SHOULD
   * assign this to the new branch edge and shift existing siblings up (see
   * {@link HamCreateSiblingSurfaceEvent.shiftedSiblingOrders}). If omitted
   * (legacy hosts), append at the end.
   */
  order?: number;
  /**
   * Pre-computed new orders for the existing siblings displaced by the insert,
   * keyed by edge id — so the host persists the renumber without re-deriving it.
   */
  shiftedSiblingOrders?: Record<HamBranchEdgeId, number>;
  suggestedTitle?: string;
}

export interface HamCreateSurfaceResult<SurfaceMeta = unknown, EdgeMeta = unknown> {
  surface: HamSurface<SurfaceMeta>;
  edge: HamBranchEdge<EdgeMeta>;
  activate?: boolean;
}

export interface HamReorderBranchSiblingsEvent {
  fromSurfaceId: HamSurfaceId;
  fromBlockId: HamBlockId;
  orderedEdgeIds: HamBranchEdgeId[];
  orderedSurfaceIds: HamSurfaceId[];
}

export interface HamDeleteSurfaceEvent {
  surfaceId: HamSurfaceId;
  incomingEdgeId?: HamBranchEdgeId;
  descendantSurfaceIds: HamSurfaceId[];
  policy: HamDeleteSurfacePolicy;
}

export interface HamCanvasHandlers<SurfaceMeta = unknown, EdgeMeta = unknown> {
  createSurfaceFromBlock(
    event: HamCreateSurfaceFromBlockEvent,
  ): Promise<HamCreateSurfaceResult<SurfaceMeta, EdgeMeta>>;
  createSiblingSurface?(
    event: HamCreateSiblingSurfaceEvent,
  ): Promise<HamCreateSurfaceResult<SurfaceMeta, EdgeMeta>>;
  reorderBranchSiblings?(event: HamReorderBranchSiblingsEvent): Promise<HamBranchEdge<EdgeMeta>[]>;
  deleteSurface?(event: HamDeleteSurfaceEvent): Promise<void>;
  saveSurface?(event: HamEditorSavePayload): Promise<void>;
  updateSurfaceSnapshot?(event: {
    surfaceId: HamSurfaceId;
    snapshot: HamSurfaceSnapshot;
  }): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Slots (spec §6.11)
// ---------------------------------------------------------------------------

export interface HamSurfaceFrameProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HamCanvasItem<SurfaceMeta, EdgeMeta>;
  mode: HamSurfaceDisplayMode;
  children: ReactNode;
}

export interface HamSurfaceHeaderProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HamCanvasItem<SurfaceMeta, EdgeMeta>;
  onActivate: () => void;
  onDelete?: () => void;
  onAddSibling?: () => void;
}

export interface HamSurfacePreviewProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HamCanvasItem<SurfaceMeta, EdgeMeta>;
  onActivate: () => void;
}

export interface HamColumnHeaderProps {
  depth: number;
  count: number;
}

/** How prominently a connector is drawn, derived from the active path. */
export type HamConnectorState = "active" | "ancestor" | "muted";

export interface HamConnectorRenderProps<EdgeMeta = unknown> {
  edge: HamBranchEdge<EdgeMeta>;
  /** Cubic-bezier path string in canvas-content coordinates. */
  path: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  state: HamConnectorState;
}

/** Props passed to a custom add-sibling affordance (spec §6.5, §6.11). */
export interface HamAddSiblingButtonProps {
  /** Surface that owns the anchor block the new branch attaches to. */
  fromSurfaceId: HamSurfaceId;
  /** Anchor block the new sibling branches from. */
  fromBlockId: HamBlockId;
  /** Existing sibling edge this insertion lands after (undefined = prepend). */
  afterEdgeId?: HamBranchEdgeId;
  /** Resolved order the new sibling will occupy among its siblings. */
  insertOrder: number;
  /** Number of existing siblings in the group (for "insert" vs "append" affordances). */
  siblingCount: number;
  /** Whether this is the trailing (append) inserter rather than a between-gap one. */
  isAppend: boolean;
  /** Create the sibling at this position. */
  onAddSibling: () => void;
}

export interface HamCanvasSlots<SurfaceMeta = unknown, EdgeMeta = unknown> {
  SurfaceFrame?: ComponentType<HamSurfaceFrameProps<SurfaceMeta, EdgeMeta>>;
  SurfaceHeader?: ComponentType<HamSurfaceHeaderProps<SurfaceMeta, EdgeMeta>>;
  SurfacePreview?: ComponentType<HamSurfacePreviewProps<SurfaceMeta, EdgeMeta>>;
  ColumnHeader?: ComponentType<HamColumnHeaderProps>;
  EmptyColumn?: ComponentType<{ depth: number }>;
  /** Override per-edge connector rendering (must return an SVG element). */
  Connector?: ComponentType<HamConnectorRenderProps<EdgeMeta>>;
  /** Override the positioned add-sibling affordance in a column's sibling rail. */
  AddSiblingButton?: ComponentType<HamAddSiblingButtonProps>;
}

// ---------------------------------------------------------------------------
// Component props + handle (spec §6.3, §6.12)
// ---------------------------------------------------------------------------

export interface HamCanvasHandle {
  focusSurface(surfaceId: HamSurfaceId): void;
  focusBlock(surfaceId: HamSurfaceId, blockId: HamBlockId): void;
  scrollSurfaceIntoView(surfaceId: HamSurfaceId): void;
  getActivePath(): HamActivePath;
  getColumns(): HamCanvasColumn[];
}

export interface HamCanvasProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HamSurfaceId;
  surfaces: Record<HamSurfaceId, HamSurface<SurfaceMeta>>;
  branchEdges: HamBranchEdge<EdgeMeta>[];

  activeSurfaceId?: HamSurfaceId;
  activeBlockId?: HamBlockId | null;

  layout?: Partial<HamCanvasLayoutConfig>;
  behavior?: Partial<HamCanvasBehaviorConfig>;
  slots?: HamCanvasSlots<SurfaceMeta, EdgeMeta>;

  editorDefaults?: Partial<HamEditorProps>;
  annotationRegistry?: HamAnnotationRegistry;
  annotationContext?: unknown;

  handlers: HamCanvasHandlers<SurfaceMeta, EdgeMeta>;
  className?: string;

  onReady?: (handle: HamCanvasHandle) => void;
  onActiveChange?: (active: { surfaceId: HamSurfaceId; blockId?: HamBlockId | null }) => void;
}

export type { HamBranchRequestEvent };
