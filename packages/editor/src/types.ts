import type { ComponentType, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Core identity + block tree (spec §2.1, §2.2)
// ---------------------------------------------------------------------------

export type HamSurfaceId = string;
export type HamBlockId = string;
export type HamBranchEdgeId = string;

/** A stable, addressable structural node inside a surface's content. */
export interface HamBlockSnapshot {
  id: HamBlockId;
  type: string;
  parentId: HamBlockId | null;
  childIds: HamBlockId[];
  /** Index among siblings of the same parent. */
  order: number;
  /** Distance from the synthetic root (root = 0). */
  depth: number;
  textPreview: string;
  isEmpty: boolean;
  isCollapsed?: boolean;
  attrs?: Record<string, unknown>;
}

/** A tree-shaped snapshot of one surface's block structure. */
export interface HamSurfaceSnapshot {
  surfaceId: HamSurfaceId;
  rootBlockId: HamBlockId;
  blocks: Record<HamBlockId, HamBlockSnapshot>;
  /** Preorder traversal of every block id, root first. */
  blockOrder: HamBlockId[];
  revision?: string | number;
}

/** How a block may be branched at a given moment. */
export type HamBranchMode = "branch" | "add-sibling" | "none";

/**
 * Declarative branchability evaluated against the projected snapshot tree.
 * The `"smart"` default resolves to
 * `{ kind: "rules", leaves: true, multiChildContainers: true,
 *    singleChildContainers: false, passThrough: "hoist-up", alwaysHeadings: true }`.
 */
export interface HamBranchabilityRules {
  kind: "rules";
  /** Branch leaf blocks (no children). Default true. */
  leaves?: boolean;
  /** Branch containers that fork (>= 2 children). Default true. */
  multiChildContainers?: boolean;
  /** Branch a single-child intermediate container. Default false (redundant). */
  singleChildContainers?: boolean;
  /**
   * Where the affordance lands when a single-child container is suppressed:
   * `"hoist-up"` keeps the topmost container in the chain branchable;
   * `"delegate-down"` keeps only the chain's tail (leaf). Default `"hoist-up"`.
   */
  passThrough?: "hoist-up" | "delegate-down";
  /** Always allow headings regardless of arity. Default true. */
  alwaysHeadings?: boolean;
  /** Restrict to a maximum projected depth (root = 0). Optional. */
  maxDepth?: number;
}

/**
 * Which blocks may be branched from. Default `"smart"`: branch leaves and real
 * forks, suppressing redundant single-child pass-through intermediates (see
 * {@link HamBranchabilityRules}). The string policies stay available for hosts
 * that want the simpler behavior.
 */
export type HamBranchPolicy =
  | "smart"
  | "any-nonempty-block"
  | "headings-only"
  | "root-only"
  | HamBranchabilityRules
  | ((block: HamBlockSnapshot, snapshot: HamSurfaceSnapshot) => boolean);

// ---------------------------------------------------------------------------
// Content (spec §5.3)
// ---------------------------------------------------------------------------

export type HamEditorContent =
  | { kind: "tiptap-json"; json: unknown }
  | { kind: "markdown"; markdown: string };

// ---------------------------------------------------------------------------
// Branch summaries + events (spec §5.5–§5.8)
// ---------------------------------------------------------------------------

/** A branch child of a block, passed by the canvas into the editor for indicators. */
export interface HamBranchChildSummary {
  edgeId: HamBranchEdgeId;
  surfaceId: HamSurfaceId;
  title?: string;
  order: number;
  active?: boolean;
}

export interface HamEditorSavePayload {
  surfaceId: HamSurfaceId;
  content: {
    tiptapJson: unknown;
    markdown: string;
  };
  snapshot: HamSurfaceSnapshot;
  revision?: string | number;
}

export interface HamBranchRequestEvent {
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  blockSnapshot: HamBlockSnapshot;
  surfaceSnapshot: HamSurfaceSnapshot;
  textPreview: string;
  /**
   * How the affordance was presented: `"branch"` (the block had no children) or
   * `"add-sibling"` (it already had a branch child). Lets the host route the two
   * to different handlers (create first child vs add a sibling).
   */
  mode: HamBranchMode;
  /** Persist the source surface (so the source block id exists) before branching. */
  save: () => Promise<HamEditorSavePayload>;
  nativeEvent?: Event;
}

export interface HamOpenBranchChildEvent {
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  edgeId: HamBranchEdgeId;
  childSurfaceId: HamSurfaceId;
}

export interface HamEditorChangeEvent {
  surfaceId: HamSurfaceId;
  content: HamEditorContent;
}

export type HamBlockEventType = "created" | "updated" | "deleted";

export interface HamBlockEvent {
  type: HamBlockEventType;
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  blockType: string;
  textPreview: string;
}

// ---------------------------------------------------------------------------
// Annotations (spec §5.13)
// ---------------------------------------------------------------------------

export type HamAnnotationPlacement = "inline" | "block-chip" | "gutter" | "popover" | "decoration";

export interface HamAnnotationHit {
  id: string;
  type: string;
  blockId: HamBlockId;
  /** Block-relative start offset (chars), for inline/popover/decoration placements. */
  from?: number;
  /** Block-relative end offset (chars). */
  to?: number;
  label?: string;
  data?: unknown;
}

export type HamAnnotationRecognizer<Ctx = unknown> = (args: {
  surfaceId: HamSurfaceId;
  block: HamBlockSnapshot;
  text: string;
  context: Ctx;
}) => HamAnnotationHit[];

export interface HamAnnotationRenderProps<Ctx = unknown> {
  hit: HamAnnotationHit;
  context: Ctx;
  /** Close an open popover/card, if this annotation opened one. */
  close?: () => void;
}

export interface HamAnnotationType<Ctx = unknown> {
  name: string;
  priority?: number;
  placement: HamAnnotationPlacement;
  recognize: HamAnnotationRecognizer<Ctx>;
  render?: ComponentType<HamAnnotationRenderProps<Ctx>>;
  /** A block-level annotation that suppresses other block-level hits on the same block. */
  opaqueBlock?: boolean;
  /** Extra CSS class for inline/decoration placements. */
  inlineClass?: (hit: HamAnnotationHit, context: Ctx) => string | undefined;
}

export interface HamAnnotationRegistry<Ctx = unknown> {
  types: HamAnnotationType<Ctx>[];
}

// ---------------------------------------------------------------------------
// Slots (spec §5.15)
// ---------------------------------------------------------------------------

export interface HamBlockSlotProps {
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  blockType: string;
  /**
   * How this block branches: `"branch"` creates a first child surface,
   * `"add-sibling"` adds another branch alongside existing children. A single
   * slot component can render both by switching on this.
   */
  mode: HamBranchMode;
  onBranch: () => void;
}

export interface HamBranchChildChipProps {
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  child: HamBranchChildSummary;
  onOpen: () => void;
}

export interface HamBlockGutterProps {
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  children?: ReactNode;
}

export interface HamEditorSlots {
  BlockBranchButton?: ComponentType<HamBlockSlotProps>;
  /**
   * Affordance shown when a block already has a branch child (mode
   * `"add-sibling"`). Falls back to {@link HamEditorSlots.BlockBranchButton}
   * with `mode === "add-sibling"` when omitted.
   */
  BlockSiblingBranchButton?: ComponentType<HamBlockSlotProps>;
  BranchChildChip?: ComponentType<HamBranchChildChipProps>;
  BlockGutter?: ComponentType<HamBlockGutterProps>;
  EmptyState?: ComponentType<{ surfaceId: HamSurfaceId }>;
  LoadingState?: ComponentType<{ surfaceId: HamSurfaceId }>;
  ErrorState?: ComponentType<{ surfaceId: HamSurfaceId; error: Error }>;
}

// ---------------------------------------------------------------------------
// Collaboration (spec §5.14) — wired in Phase 3
// ---------------------------------------------------------------------------

export interface HamCollaborationUser {
  id?: string;
  name: string;
  color?: string;
}

/** A transport provider (e.g. Hocuspocus) — the subset HAM relies on. */
export interface HamCollaborationProvider {
  synced: boolean;
  hasUnsyncedChanges: boolean;
  awareness?: unknown;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  destroy(): void;
}

/** A collaboration runtime: a Y.Doc plus a way to open its transport. */
export interface HamCollaborationRuntime {
  /** The Yjs document (typed as unknown to avoid leaking the yjs type here). */
  ydoc: unknown;
  connect(): Promise<HamCollaborationProvider>;
}

export interface HamCollaborationConfig {
  enabled: boolean;
  documentName: string;
  provider: "hocuspocus";
  url: string;
  token?: string;
  user?: HamCollaborationUser;
  initialSyncTimeoutMs?: number;
  /** Reuse an existing Y.Doc instead of creating one (e.g. for tests). */
  ydoc?: unknown;
  /** Inject a custom runtime (custom transport or a test double). */
  runtime?: HamCollaborationRuntime;
}

// ---------------------------------------------------------------------------
// Imperative handle (spec §5.8)
// ---------------------------------------------------------------------------

export interface HamEditorHandle {
  surfaceId: HamSurfaceId;
  focusBlock(blockId: HamBlockId, opts?: { scroll?: boolean }): void;
  scrollBlockIntoView(blockId: HamBlockId, opts?: ScrollIntoViewOptions): void;
  getSnapshot(): HamSurfaceSnapshot;
  getMarkdown(): string;
  getJSON(): unknown;
  save(): Promise<HamEditorSavePayload>;
  collapseBlock(blockId: HamBlockId): void;
  expandBlock(blockId: HamBlockId): void;
  /**
   * Advanced escape hatch (spec §5.8): the underlying Tiptap editor. Prefer the
   * typed handle methods; reach for this only when no first-class API exists.
   */
  getUnsafeTiptapEditor(): unknown;
}

// ---------------------------------------------------------------------------
// Editor props (spec §5.4)
// ---------------------------------------------------------------------------

export interface HamEditorProps<AnnotationData = unknown> {
  surfaceId: HamSurfaceId;
  rootBlockId?: HamBlockId;

  value: HamEditorContent;
  title?: string;
  editable?: boolean;
  autofocus?: boolean | "start" | "end" | HamBlockId;

  highlightedBlockIds?: Iterable<HamBlockId>;
  activeBlockId?: HamBlockId | null;
  collapsedBlockIds?: Iterable<HamBlockId>;

  branchChildren?: Record<HamBlockId, HamBranchChildSummary[]>;
  branchPolicy?: HamBranchPolicy;

  annotations?: HamAnnotationRegistry<AnnotationData>;
  annotationContext?: AnnotationData;

  collaboration?: HamCollaborationConfig;

  slots?: HamEditorSlots;
  className?: string;

  onReady?: (handle: HamEditorHandle) => void;
  onChange?: (event: HamEditorChangeEvent) => void;
  onSnapshotChange?: (snapshot: HamSurfaceSnapshot) => void;
  onBlockEvents?: (events: HamBlockEvent[]) => void;
  onBranchRequest?: (event: HamBranchRequestEvent) => void;
  onOpenBranchChild?: (event: HamOpenBranchChildEvent) => void;
  onActiveBlockChange?: (blockId: HamBlockId | null) => void;
}
