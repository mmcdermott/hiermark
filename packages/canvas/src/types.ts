import type {
  HiermarkAnnotationRegistry,
  HiermarkBlockId,
  HiermarkBlockSnapshot,
  HiermarkBranchEdgeId,
  HiermarkBranchPolicy,
  HiermarkBranchRequestEvent,
  HiermarkEditorContent,
  HiermarkEditorProps,
  HiermarkEditorSavePayload,
  HiermarkSurfaceId,
  HiermarkSurfaceSnapshot,
} from "@hiermark/editor";
import type { ComponentType, ReactNode } from "react";

export type {
  HiermarkSurfaceId,
  HiermarkBlockId,
  HiermarkBranchEdgeId,
  HiermarkSurfaceSnapshot,
  HiermarkBlockSnapshot,
  HiermarkBranchPolicy,
  HiermarkEditorContent,
  HiermarkEditorSavePayload,
  // Re-exported so the canvas public surface is self-contained: both are
  // referenced by canvas props (`editorDefaults` derives from HiermarkEditorProps,
  // `annotationRegistry` is a HiermarkAnnotationRegistry) — a consumer shouldn't
  // need a direct @hiermark/editor import to name them.
  HiermarkEditorProps,
  HiermarkAnnotationRegistry,
};

// ---------------------------------------------------------------------------
// Surface + edge model (spec §2.1, §2.3)
// ---------------------------------------------------------------------------

/** An editable block tree displayed on the canvas. */
export interface HiermarkSurface<Meta = unknown> {
  id: HiermarkSurfaceId;
  rootBlockId: HiermarkBlockId;
  title?: string;
  meta?: Meta;
  content: HiermarkEditorContent;
  readonly?: boolean;
}

/** Connects a source block in one surface to a target surface (one column right). */
export interface HiermarkBranchEdge<Meta = unknown> {
  id: HiermarkBranchEdgeId;
  fromSurfaceId: HiermarkSurfaceId;
  fromBlockId: HiermarkBlockId;
  toSurfaceId: HiermarkSurfaceId;
  /** Sibling order among branches from the same source block. */
  order: number;
  meta?: Meta;
}

// ---------------------------------------------------------------------------
// Projection output (spec §2.4)
// ---------------------------------------------------------------------------

export type HiermarkPathState = "active" | "ancestor" | "descendant" | "sibling" | "unrelated";

export type HiermarkSurfaceDisplayMode = "expanded" | "card" | "outline" | "rail" | "hidden";

export interface HiermarkCanvasItem<SurfaceMeta = unknown, EdgeMeta = unknown> {
  surface: HiermarkSurface<SurfaceMeta>;
  incomingEdge?: HiermarkBranchEdge<EdgeMeta>;
  parentSurfaceId?: HiermarkSurfaceId;
  anchorBlockId?: HiermarkBlockId;
  pathState: HiermarkPathState;
  displayMode: HiermarkSurfaceDisplayMode;
}

export interface HiermarkCanvasColumn<SurfaceMeta = unknown, EdgeMeta = unknown> {
  depth: number;
  items: HiermarkCanvasItem<SurfaceMeta, EdgeMeta>[];
  /**
   * True for trailing columns holding surfaces with no edge path from the root
   * (orphans / detached subtrees). They are projected so the data is never
   * silently invisible; the canvas renders a divider before the first one.
   */
  detached?: boolean;
}

/** The branch-edge lineage from the root surface to the active surface (spec §2.6). */
export interface HiermarkActivePath {
  rootSurfaceId: HiermarkSurfaceId;
  activeSurfaceId: HiermarkSurfaceId;
  activeBlockId?: HiermarkBlockId | null;
  surfaceIds: HiermarkSurfaceId[];
  edgeIds: HiermarkBranchEdgeId[];
  anchorBlockIds: HiermarkBlockId[];
}

export interface HiermarkProjectionInput<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HiermarkSurfaceId;
  surfaces: Record<HiermarkSurfaceId, HiermarkSurface<SurfaceMeta>>;
  branchEdges: HiermarkBranchEdge<EdgeMeta>[];
  snapshotsBySurfaceId: Record<HiermarkSurfaceId, HiermarkSurfaceSnapshot | undefined>;
  activeSurfaceId: HiermarkSurfaceId;
  activeBlockId?: HiermarkBlockId | null;
  collapsedSurfaceIds?: Set<HiermarkSurfaceId>;
  layout?: HiermarkCanvasLayoutConfig;
}

// ---------------------------------------------------------------------------
// Layout + behavior config (spec §6.4, §6.5)
// ---------------------------------------------------------------------------

export interface HiermarkCanvasLayoutConfig {
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
  /**
   * Give each column its own vertical scroll region (instead of one shared page
   * scroll). With a bounded canvas height this lets you scroll deep into one
   * column without moving the others — and makes "descend into a surface's
   * children" (auto-scroll on activation) feel crisp. Default false.
   */
  columnScroll: boolean;
  /**
   * Render a small provenance header above each sibling group naming the parent
   * surface / anchor block the group branches from. Default false. Customize via
   * {@link HiermarkCanvasSlots.GroupHeader}.
   */
  showGroupHeaders: boolean;
}

export type HiermarkDeleteSurfacePolicy =
  | "prevent-if-has-children"
  | "delete-subtree"
  | "detach-children";

export interface HiermarkCanvasBehaviorConfig {
  enableSurfaceReorder: boolean;
  enableBranchCreation: boolean;
  enableSiblingBranchCreation: boolean;
  enableSurfaceDeletion: boolean;
  enableKeyboardNavigation: boolean;
  branchPolicy: HiermarkBranchPolicy;
  deleteSurfacePolicy: HiermarkDeleteSurfacePolicy;
}

// ---------------------------------------------------------------------------
// Handlers + operation events (spec §6.6–6.9)
// ---------------------------------------------------------------------------

export interface HiermarkCreateSurfaceFromBlockEvent {
  sourceSurfaceId: HiermarkSurfaceId;
  sourceBlockId: HiermarkBlockId;
  sourceBlockSnapshot: HiermarkBlockSnapshot;
  sourceSurfaceSnapshot: HiermarkSurfaceSnapshot;
  suggestedTitle?: string;
  saveSourceSurface: () => Promise<HiermarkEditorSavePayload>;
}

export interface HiermarkCreateSiblingSurfaceEvent {
  fromSurfaceId: HiermarkSurfaceId;
  fromBlockId: HiermarkBlockId;
  insertAfterEdgeId?: HiermarkBranchEdgeId;
  /**
   * The 0-based order the canvas computed for the new edge. The host SHOULD
   * assign this to the new branch edge and shift existing siblings up (see
   * {@link HiermarkCreateSiblingSurfaceEvent.shiftedSiblingOrders}). If omitted
   * (legacy hosts), append at the end.
   */
  order?: number;
  /**
   * Pre-computed new orders for the existing siblings displaced by the insert,
   * keyed by edge id — so the host persists the renumber without re-deriving it.
   */
  shiftedSiblingOrders?: Record<HiermarkBranchEdgeId, number>;
  suggestedTitle?: string;
}

export interface HiermarkCreateSurfaceResult<SurfaceMeta = unknown, EdgeMeta = unknown> {
  surface: HiermarkSurface<SurfaceMeta>;
  edge: HiermarkBranchEdge<EdgeMeta>;
  activate?: boolean;
}

export interface HiermarkReorderBranchSiblingsEvent {
  fromSurfaceId: HiermarkSurfaceId;
  fromBlockId: HiermarkBlockId;
  orderedEdgeIds: HiermarkBranchEdgeId[];
  orderedSurfaceIds: HiermarkSurfaceId[];
}

export interface HiermarkDeleteSurfaceEvent {
  surfaceId: HiermarkSurfaceId;
  incomingEdgeId?: HiermarkBranchEdgeId;
  descendantSurfaceIds: HiermarkSurfaceId[];
  policy: HiermarkDeleteSurfacePolicy;
}

export interface HiermarkCanvasHandlers<SurfaceMeta = unknown, EdgeMeta = unknown> {
  /**
   * Create a new surface branched from a block. Optional so read-only /
   * preview canvases need no dummy handler — without it (or with
   * `behavior.enableBranchCreation: false`) branch affordances are hidden.
   */
  createSurfaceFromBlock?(
    event: HiermarkCreateSurfaceFromBlockEvent,
  ): Promise<HiermarkCreateSurfaceResult<SurfaceMeta, EdgeMeta>>;
  createSiblingSurface?(
    event: HiermarkCreateSiblingSurfaceEvent,
  ): Promise<HiermarkCreateSurfaceResult<SurfaceMeta, EdgeMeta>>;
  reorderBranchSiblings?(
    event: HiermarkReorderBranchSiblingsEvent,
  ): Promise<HiermarkBranchEdge<EdgeMeta>[]>;
  deleteSurface?(event: HiermarkDeleteSurfaceEvent): Promise<void>;
  saveSurface?(event: HiermarkEditorSavePayload): Promise<void>;
  updateSurfaceSnapshot?(event: {
    surfaceId: HiermarkSurfaceId;
    snapshot: HiermarkSurfaceSnapshot;
  }): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Slots (spec §6.11)
// ---------------------------------------------------------------------------

export interface HiermarkSurfaceFrameProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HiermarkCanvasItem<SurfaceMeta, EdgeMeta>;
  mode: HiermarkSurfaceDisplayMode;
  children: ReactNode;
}

export interface HiermarkSurfaceHeaderProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HiermarkCanvasItem<SurfaceMeta, EdgeMeta>;
  onActivate: () => void;
  onDelete?: () => void;
  onAddSibling?: () => void;
}

export interface HiermarkSurfacePreviewProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HiermarkCanvasItem<SurfaceMeta, EdgeMeta>;
  onActivate: () => void;
}

/**
 * Replaces the body of an *inactive* surface card (outline / card / rail) — e.g.
 * a richer summary, charts, or status badges — without re-implementing the
 * editor mount or activation wiring. The expanded (active) surface always keeps
 * its editor. `defaultBody` is what the canvas would otherwise render, so a slot
 * can wrap or fall back to it.
 */
export interface HiermarkSurfaceBodyProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  item: HiermarkCanvasItem<SurfaceMeta, EdgeMeta>;
  mode: HiermarkSurfaceDisplayMode;
  snapshot?: HiermarkSurfaceSnapshot;
  onActivate: () => void;
  defaultBody: ReactNode;
}

export interface HiermarkColumnHeaderProps {
  depth: number;
  count: number;
}

/** Provenance header above a sibling group: where this set of surfaces branches from. */
export interface HiermarkGroupHeaderProps<SurfaceMeta = unknown> {
  /** Surface that owns the anchor block this group branches from. */
  parentSurfaceId: HiermarkSurfaceId;
  /** The parent surface, if it's in the current projection. */
  parentSurface?: HiermarkSurface<SurfaceMeta>;
  /** The anchor block id in the parent surface. */
  anchorBlockId: HiermarkBlockId;
  /** A short text preview of the anchor block, if a snapshot is available. */
  anchorPreview?: string;
  /** Number of sibling surfaces in the group. */
  count: number;
  /** Activate the parent surface (focused on the anchor block). */
  onActivateParent: () => void;
}

/** How prominently a connector is drawn, derived from the active path. */
export type HiermarkConnectorState = "active" | "ancestor" | "muted";

export interface HiermarkConnectorRenderProps<EdgeMeta = unknown> {
  edge: HiermarkBranchEdge<EdgeMeta>;
  /** Cubic-bezier path string in canvas-content coordinates. */
  path: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  state: HiermarkConnectorState;
}

/** Props passed to a custom add-sibling affordance (spec §6.5, §6.11). */
export interface HiermarkAddSiblingButtonProps {
  /** Surface that owns the anchor block the new branch attaches to. */
  fromSurfaceId: HiermarkSurfaceId;
  /** Anchor block the new sibling branches from. */
  fromBlockId: HiermarkBlockId;
  /** Existing sibling edge this insertion lands after (undefined = prepend). */
  afterEdgeId?: HiermarkBranchEdgeId;
  /** Resolved order the new sibling will occupy among its siblings. */
  insertOrder: number;
  /** Number of existing siblings in the group (for "insert" vs "append" affordances). */
  siblingCount: number;
  /** Whether this is the trailing (append) inserter rather than a between-gap one. */
  isAppend: boolean;
  /** Create the sibling at this position. */
  onAddSibling: () => void;
}

export interface HiermarkCanvasSlots<SurfaceMeta = unknown, EdgeMeta = unknown> {
  SurfaceFrame?: ComponentType<HiermarkSurfaceFrameProps<SurfaceMeta, EdgeMeta>>;
  SurfaceHeader?: ComponentType<HiermarkSurfaceHeaderProps<SurfaceMeta, EdgeMeta>>;
  SurfacePreview?: ComponentType<HiermarkSurfacePreviewProps<SurfaceMeta, EdgeMeta>>;
  /** Replace the body of an inactive surface card (see {@link HiermarkSurfaceBodyProps}). */
  SurfaceBody?: ComponentType<HiermarkSurfaceBodyProps<SurfaceMeta, EdgeMeta>>;
  ColumnHeader?: ComponentType<HiermarkColumnHeaderProps>;
  EmptyColumn?: ComponentType<{ depth: number }>;
  /** Rendered when the canvas has no surfaces to show (e.g. a missing root). */
  EmptyCanvas?: ComponentType<{ rootSurfaceId: HiermarkSurfaceId }>;
  /** Provenance header above each sibling group (when `layout.showGroupHeaders`). */
  GroupHeader?: ComponentType<HiermarkGroupHeaderProps<SurfaceMeta>>;
  /** Override per-edge connector rendering (must return an SVG element). */
  Connector?: ComponentType<HiermarkConnectorRenderProps<EdgeMeta>>;
  /** Override the positioned add-sibling affordance in a column's sibling rail. */
  AddSiblingButton?: ComponentType<HiermarkAddSiblingButtonProps>;
}

// ---------------------------------------------------------------------------
// Component props + handle (spec §6.3, §6.12)
// ---------------------------------------------------------------------------

export interface HiermarkCanvasHandle {
  /** Activate a surface (and scroll it into view). */
  focusSurface(surfaceId: HiermarkSurfaceId): void;
  /**
   * Activate a surface, scroll it into view, and move the caret INTO the
   * given block (once that surface's editor has mounted).
   */
  focusBlock(surfaceId: HiermarkSurfaceId, blockId: HiermarkBlockId): void;
  scrollSurfaceIntoView(surfaceId: HiermarkSurfaceId): void;
  /** Scroll a surface's child surfaces into view in the next column. */
  revealChildren(surfaceId: HiermarkSurfaceId): void;
  getActivePath(): HiermarkActivePath;
  getColumns(): HiermarkCanvasColumn[];
}

export type HiermarkCanvasOperationType =
  | "create-branch"
  | "create-sibling"
  | "reorder-siblings"
  | "delete-surface"
  | "save-surface"
  | "update-snapshot";

/** A failed (or package-blocked) canvas operation, surfaced via `onOperationError`. */
export interface HiermarkCanvasOperationError {
  type: HiermarkCanvasOperationType;
  surfaceId?: HiermarkSurfaceId;
  /** The rejection from the host handler, if any. */
  error?: unknown;
  /**
   * Set when the package itself refused the operation before calling the host
   * (e.g. `deleteSurfacePolicy: "prevent-if-has-children"` with descendants).
   */
  blocked?: boolean;
  /** Human-readable reason when `blocked`. */
  reason?: string;
}

/**
 * Editor props a host may default for every canvas-mounted editor. This is
 * {@link HiermarkEditorProps} minus the canvas-OWNED wiring (content, identity,
 * branch/save/snapshot callbacks…): those were silently overridden before,
 * which read as the host's callbacks being dropped. Extend the Omit list when
 * the canvas takes ownership of a new editor prop.
 */
export type HiermarkCanvasEditorDefaults = Partial<
  Omit<
    HiermarkEditorProps,
    | "surfaceId"
    | "rootBlockId"
    | "value"
    | "title"
    | "editable"
    | "activeBlockId"
    | "branchChildren"
    | "branchPolicy"
    | "annotations"
    | "annotationContext"
    | "revision"
    | "onReady"
    | "onChange"
    | "onSnapshotChange"
    | "onBranchRequest"
    | "onOpenBranchChild"
    | "onActiveBlockChange"
  >
>;

export interface HiermarkCanvasProps<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HiermarkSurfaceId;
  surfaces: Record<HiermarkSurfaceId, HiermarkSurface<SurfaceMeta>>;
  branchEdges: HiermarkBranchEdge<EdgeMeta>[];

  activeSurfaceId?: HiermarkSurfaceId;
  activeBlockId?: HiermarkBlockId | null;

  layout?: Partial<HiermarkCanvasLayoutConfig>;
  behavior?: Partial<HiermarkCanvasBehaviorConfig>;
  slots?: HiermarkCanvasSlots<SurfaceMeta, EdgeMeta>;

  editorDefaults?: HiermarkCanvasEditorDefaults;
  annotationRegistry?: HiermarkAnnotationRegistry;
  annotationContext?: unknown;

  handlers: HiermarkCanvasHandlers<SurfaceMeta, EdgeMeta>;
  className?: string;

  onReady?: (handle: HiermarkCanvasHandle) => void;
  onActiveChange?: (active: {
    surfaceId: HiermarkSurfaceId;
    blockId?: HiermarkBlockId | null;
  }) => void;
  /**
   * Called when a topology/save operation is rejected by a host handler, or
   * refused package-side (e.g. a delete blocked by `deleteSurfacePolicy`).
   * Without it, handler rejections are swallowed.
   */
  onOperationError?: (error: HiermarkCanvasOperationError) => void;
}

export type { HiermarkBranchRequestEvent };
