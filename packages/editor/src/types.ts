import type { Editor } from "@tiptap/core";
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

/** A candidate shown in the annotation search popover. */
export interface HamAnnotationSuggestion {
  /** Stable id (for React keys / dedup across types sharing a trigger). */
  id: string;
  /** Primary label shown in the list. */
  label: string;
  /** Optional secondary detail line (e.g. author / year, or `@handle`). */
  detail?: string;
  /**
   * Literal text inserted in place of the trigger + query when chosen
   * (e.g. `"@vaswani2017 "`). Inserted verbatim — not parsed as markdown.
   */
  insert: string;
}

/**
 * Lets an annotation type drive a type-ahead: typing the `trigger` opens a
 * popover whose candidates come from `search(query)`; choosing one inserts its
 * `insert` text, which the recognizers then pick up (e.g. an `@key` pill). Pure
 * over `context`, so the editor never interprets the domain.
 */
export interface HamAnnotationSuggestConfig<Ctx = unknown> {
  /** Single character that opens the search (e.g. `"@"`). */
  trigger: string;
  /** Allow spaces inside the query (default false — query ends at whitespace). */
  allowSpaces?: boolean;
  /** Ranked candidates for the current query. */
  search: (query: string, context: Ctx) => HamAnnotationSuggestion[];
}

/** Live type-ahead state passed to a {@link HamSuggestPopoverProps} renderer. */
export interface HamSuggestState {
  active: boolean;
  trigger: string | null;
  query: string;
  /** Document range covering the trigger + query (what an insert replaces). */
  range: { from: number; to: number } | null;
  items: HamAnnotationSuggestion[];
}

/** Props for a custom type-ahead popover (`HamEditorSlots.SuggestPopover`). */
export interface HamSuggestPopoverProps {
  state: HamSuggestState;
  /** Highlighted candidate index (host-owned; keep keyboard + render in sync). */
  index: number;
  editor: Editor | null;
  onHover: (index: number) => void;
  onSelect: (item: HamAnnotationSuggestion) => void;
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
  /** Type-ahead search for inserting this annotation (spec §5.13). */
  suggest?: HamAnnotationSuggestConfig<Ctx>;
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
  /** Replace the default annotation type-ahead popover (e.g. richer rows). */
  SuggestPopover?: ComponentType<HamSuggestPopoverProps>;
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
// Images / figures (host-owned storage)
// ---------------------------------------------------------------------------

/** The resolved location of an image after the host has stored it. */
export interface HamUploadedImage {
  /** Anything usable as an `<img src>`: an uploaded URL, object URL, or data URI. */
  src: string;
  /** Alt text; falls back to the file name when omitted. */
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
}

/**
 * Host hook that decides how an image is stored. The editor calls it for every
 * pasted, dropped, or picker-selected image file and inserts the returned `src`
 * — so storage (server upload, S3, object URL, base64, …) stays entirely the
 * host's choice. Return `null` to skip a file (e.g. validation failed).
 */
export type HamImageUploadHandler = (
  file: File,
  context: { surfaceId: HamSurfaceId },
) => Promise<HamUploadedImage | null>;

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
  /**
   * Replace the editor's content (the escape hatch for hosts that need to swap
   * in a new revision after mount — see {@link HamEditorProps.value}, which is
   * mount-time only). `emitUpdate` defaults to true (fires onChange/snapshot).
   */
  setContent(content: HamEditorContent, opts?: { emitUpdate?: boolean }): void;
  /**
   * Upload image files through {@link HamEditorProps.onImageUpload} and insert
   * them at the cursor — the programmatic path for a host "insert image" button
   * / file picker. No-op (resolves immediately) when no upload handler is set.
   */
  uploadImages(files: FileList | File[]): Promise<void>;
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
  /**
   * Identity of the synthetic root block. Block ids are **surface-scoped**, so
   * the constant default (`"blk_root"`) is safe — don't treat block ids as
   * globally unique across surfaces.
   */
  rootBlockId?: HamBlockId;

  /**
   * **Mount-time content only** — captured once when the editor mounts; later
   * changes to `value` are NOT applied (this is not a controlled input). To
   * replace content after mount, remount with a new React `key`, or seed a fresh
   * surface. A controlled `value` / `defaultValue` split may arrive later.
   */
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

  /**
   * Enables image paste / drag-drop / picker insertion, routing each file
   * through this handler so the host owns storage. Without it, image upload is
   * inert (pasting an image file does nothing); `![alt](src)` markdown still
   * renders regardless.
   */
  onImageUpload?: HamImageUploadHandler;
  /** Reports an image upload rejection (the handler threw). */
  onImageUploadError?: (error: unknown, file: File) => void;

  slots?: HamEditorSlots;
  className?: string;

  onReady?: (handle: HamEditorHandle) => void;
  /**
   * Fires on every edit. The emitted content is `tiptap-json` (cheap); the
   * markdown serialization is produced only by {@link HamEditorHandle.save} /
   * the save payload, not on every keystroke.
   */
  onChange?: (event: HamEditorChangeEvent) => void;
  onSnapshotChange?: (snapshot: HamSurfaceSnapshot) => void;
  onBlockEvents?: (events: HamBlockEvent[]) => void;
  onBranchRequest?: (event: HamBranchRequestEvent) => void;
  onOpenBranchChild?: (event: HamOpenBranchChildEvent) => void;
  onActiveBlockChange?: (blockId: HamBlockId | null) => void;
}
