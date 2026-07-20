import type { Editor } from "@tiptap/core";
import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Core identity + block tree (spec §2.1, §2.2)
// ---------------------------------------------------------------------------

export type HiermarkSurfaceId = string;
export type HiermarkBlockId = string;
export type HiermarkBranchEdgeId = string;

/** A stable, addressable structural node inside a surface's content. */
export interface HiermarkBlockSnapshot {
  id: HiermarkBlockId;
  type: string;
  parentId: HiermarkBlockId | null;
  childIds: HiermarkBlockId[];
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
export interface HiermarkSurfaceSnapshot {
  surfaceId: HiermarkSurfaceId;
  rootBlockId: HiermarkBlockId;
  blocks: Record<HiermarkBlockId, HiermarkBlockSnapshot>;
  /** Preorder traversal of every block id, root first. */
  blockOrder: HiermarkBlockId[];
  revision?: string | number;
}

/** How a block may be branched at a given moment. */
export type HiermarkBranchMode = "branch" | "add-sibling" | "none";

/**
 * Declarative branchability evaluated against the projected snapshot tree.
 * The `"smart"` default resolves to
 * `{ kind: "rules", leaves: true, multiChildContainers: true,
 *    singleChildContainers: false, passThrough: "hoist-up", alwaysHeadings: true }`.
 */
export interface HiermarkBranchabilityRules {
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
 * Which blocks may be branched from. Default `"bubble-up"`: show a branch
 * affordance only where there is a *meaningful* alternative branch point — a
 * block with a single nested branch point absorbs it (bubbles it up), so a
 * linear header → header → paragraph chain shows just one affordance at the top;
 * a real fork (≥2 nested branch points) shows the fork *and* each branch.
 *
 * Other policies:
 * - `"off"` — no branch affordances at all (e.g. a standalone editor with no
 *   canvas to branch into).
 * - `"smart"` — the previous default: branch leaves + forks, hoisting single
 *   child chains, headings always (per-block, no whole-subtree bubble-up).
 * - `"any-nonempty-block"` / `"headings-only"` / `"root-only"` — simple rules.
 */
export type HiermarkBranchPolicy =
  | "bubble-up"
  | "off"
  | "smart"
  | "any-nonempty-block"
  | "headings-only"
  | "root-only"
  | HiermarkBranchabilityRules
  | ((block: HiermarkBlockSnapshot, snapshot: HiermarkSurfaceSnapshot) => boolean);

// ---------------------------------------------------------------------------
// Content (spec §5.3)
// ---------------------------------------------------------------------------

export type HiermarkEditorContent =
  | { kind: "tiptap-json"; json: unknown }
  | { kind: "markdown"; markdown: string };

// ---------------------------------------------------------------------------
// Branch summaries + events (spec §5.5–§5.8)
// ---------------------------------------------------------------------------

/** A branch child of a block, passed by the canvas into the editor for indicators. */
export interface HiermarkBranchChildSummary {
  edgeId: HiermarkBranchEdgeId;
  surfaceId: HiermarkSurfaceId;
  title?: string;
  order: number;
  active?: boolean;
}

export interface HiermarkEditorSavePayload {
  surfaceId: HiermarkSurfaceId;
  content: {
    tiptapJson: unknown;
    markdown: string;
  };
  snapshot: HiermarkSurfaceSnapshot;
}

export interface HiermarkBranchRequestEvent {
  surfaceId: HiermarkSurfaceId;
  blockId: HiermarkBlockId;
  blockSnapshot: HiermarkBlockSnapshot;
  surfaceSnapshot: HiermarkSurfaceSnapshot;
  textPreview: string;
  /**
   * How the affordance was presented: `"branch"` (the block had no children) or
   * `"add-sibling"` (it already had a branch child). Lets the host route the two
   * to different handlers (create first child vs add a sibling).
   */
  mode: HiermarkBranchMode;
  /** Persist the source surface (so the source block id exists) before branching. */
  save: () => Promise<HiermarkEditorSavePayload>;
}

export interface HiermarkOpenBranchChildEvent {
  surfaceId: HiermarkSurfaceId;
  blockId: HiermarkBlockId;
  edgeId: HiermarkBranchEdgeId;
  childSurfaceId: HiermarkSurfaceId;
}

export interface HiermarkEditorChangeEvent {
  surfaceId: HiermarkSurfaceId;
  content: HiermarkEditorContent;
}

// ---------------------------------------------------------------------------
// Annotations (spec §5.13)
// ---------------------------------------------------------------------------

export type HiermarkAnnotationPlacement =
  | "inline"
  | "block-chip"
  | "gutter"
  | "popover"
  | "decoration";

export interface HiermarkAnnotationHit {
  id: string;
  type: string;
  blockId: HiermarkBlockId;
  /** Block-relative start offset (chars), for inline/popover/decoration placements. */
  from?: number;
  /** Block-relative end offset (chars). */
  to?: number;
  label?: string;
  data?: unknown;
}

export type HiermarkAnnotationRecognizer<Ctx = unknown> = (args: {
  surfaceId: HiermarkSurfaceId;
  block: HiermarkBlockSnapshot;
  text: string;
  context: Ctx;
}) => HiermarkAnnotationHit[];

/**
 * A surgical, identity-preserving edit to a block, applied as a single
 * ProseMirror transaction — so it flows through Collaboration/Yjs to every
 * client and to persistence (the only safe way to mutate the shared doc). The
 * block's `dataBlockId` is protected: identity can't be changed through this,
 * so branch edges and anchored annotations survive.
 */
export type HiermarkBlockEdit = {
  /** Merge these attrs onto the block's node — e.g. `{ checked: true }` on a `taskItem`. */
  setAttrs: Record<string, unknown>;
};

/**
 * What an annotation's `render` component may write back, scoped to its hit.
 * `setAttrs` targets the hit's block; `replaceText` targets the hit's inline
 * range (`hit.from`..`hit.to`) — a no-op for block-level hits without a range.
 */
export type HiermarkAnnotationEdit = HiermarkBlockEdit | { replaceText: string };

export interface HiermarkAnnotationRenderProps<Ctx = unknown> {
  hit: HiermarkAnnotationHit;
  context: Ctx;
  /** Close an open popover/card, if this annotation opened one. */
  close?: () => void;
  /**
   * Write back to the block/range this annotation is anchored to, as one
   * transaction (synced via Yjs). Pre-scoped to `hit`. Returns false if the
   * edit couldn't be applied (block gone, or `replaceText` on a range-less hit).
   * Call from an event handler (e.g. onClick), never during render.
   */
  update: (edit: HiermarkAnnotationEdit) => boolean;
}

/** A candidate shown in the annotation search popover. */
export interface HiermarkAnnotationSuggestion {
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
export interface HiermarkAnnotationSuggestConfig<Ctx = unknown> {
  /** Single character that opens the search (e.g. `"@"`). */
  trigger: string;
  /** Allow spaces inside the query (default false — query ends at whitespace). */
  allowSpaces?: boolean;
  /** Ranked candidates for the current query. */
  search: (query: string, context: Ctx) => HiermarkAnnotationSuggestion[];
}

/** Live type-ahead state passed to a {@link HiermarkSuggestPopoverProps} renderer. */
export interface HiermarkSuggestState {
  active: boolean;
  trigger: string | null;
  query: string;
  /** Document range covering the trigger + query (what an insert replaces). */
  range: { from: number; to: number } | null;
  items: HiermarkAnnotationSuggestion[];
}

/** Props for a custom type-ahead popover (`HiermarkEditorSlots.SuggestPopover`). */
export interface HiermarkSuggestPopoverProps {
  state: HiermarkSuggestState;
  /** Highlighted candidate index (host-owned; keep keyboard + render in sync). */
  index: number;
  editor: Editor | null;
  onHover: (index: number) => void;
  onSelect: (item: HiermarkAnnotationSuggestion) => void;
}

export interface HiermarkAnnotationType<Ctx = unknown> {
  name: string;
  priority?: number;
  placement: HiermarkAnnotationPlacement;
  recognize: HiermarkAnnotationRecognizer<Ctx>;
  render?: ComponentType<HiermarkAnnotationRenderProps<Ctx>>;
  /** A block-level annotation that suppresses other block-level hits on the same block. */
  opaqueBlock?: boolean;
  /** Extra CSS class for inline/decoration placements. */
  inlineClass?: (hit: HiermarkAnnotationHit, context: Ctx) => string | undefined;
  /** Type-ahead search for inserting this annotation (spec §5.13). */
  suggest?: HiermarkAnnotationSuggestConfig<Ctx>;
}

export interface HiermarkAnnotationRegistry<Ctx = unknown> {
  types: HiermarkAnnotationType<Ctx>[];
}

// ---------------------------------------------------------------------------
// Slots (spec §5.15)
// ---------------------------------------------------------------------------

export interface HiermarkBlockSlotProps {
  surfaceId: HiermarkSurfaceId;
  blockId: HiermarkBlockId;
  blockType: string;
  /**
   * How this block branches: `"branch"` creates a first child surface,
   * `"add-sibling"` adds another branch alongside existing children. A single
   * slot component can render both by switching on this.
   */
  mode: HiermarkBranchMode;
  onBranch: () => void;
}

export interface HiermarkBranchChildChipProps {
  surfaceId: HiermarkSurfaceId;
  blockId: HiermarkBlockId;
  child: HiermarkBranchChildSummary;
  onOpen: () => void;
}

export interface HiermarkEditorSlots {
  BlockBranchButton?: ComponentType<HiermarkBlockSlotProps>;
  /**
   * Affordance shown when a block already has a branch child (mode
   * `"add-sibling"`). Falls back to {@link HiermarkEditorSlots.BlockBranchButton}
   * with `mode === "add-sibling"` when omitted.
   */
  BlockSiblingBranchButton?: ComponentType<HiermarkBlockSlotProps>;
  BranchChildChip?: ComponentType<HiermarkBranchChildChipProps>;
  LoadingState?: ComponentType<{ surfaceId: HiermarkSurfaceId }>;
  ErrorState?: ComponentType<{ surfaceId: HiermarkSurfaceId; error: Error; retry?: () => void }>;
  /** Replace the default annotation type-ahead popover (e.g. richer rows). */
  SuggestPopover?: ComponentType<HiermarkSuggestPopoverProps>;
}

// ---------------------------------------------------------------------------
// Collaboration (spec §5.14) — wired in Phase 3
// ---------------------------------------------------------------------------

export interface HiermarkCollaborationUser {
  id?: string;
  name: string;
  color?: string;
}

/** A transport provider (e.g. Hocuspocus) — the subset Hiermark relies on. */
export interface HiermarkCollaborationProvider {
  synced: boolean;
  hasUnsyncedChanges: boolean;
  awareness?: unknown;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  destroy(): void;
}

/** A collaboration runtime: a Y.Doc plus a way to open its transport. */
export interface HiermarkCollaborationRuntime {
  /** The Yjs document (typed as unknown to avoid leaking the yjs type here). */
  ydoc: unknown;
  connect(): Promise<HiermarkCollaborationProvider>;
}

/** Lifecycle of the collaboration connection (drives host spinners / analytics). */
export type HiermarkCollaborationStatus =
  | "connecting"
  | "connected"
  | "synced"
  | "timedout"
  | "error";

/** What teardown managed to do with any unsynced changes. */
export interface HiermarkCollaborationFlushResult {
  /** True if all pending changes drained to the server before destroy. */
  flushed: boolean;
  /** Best-effort count of changes that were still pending (on timeout). */
  pendingChanges?: number;
}

/** Options shared by both collaboration transports. */
export interface HiermarkCollaborationCommonConfig {
  enabled: boolean;
  documentName: string;
  user?: HiermarkCollaborationUser;
  initialSyncTimeoutMs?: number;
  /** Reuse an existing Y.Doc instead of creating one (e.g. for tests). */
  ydoc?: unknown;
  /** Bounded reconnect attempts on a failed `connect()` (default 3, backoff 1/2/4s). */
  maxRetries?: number;
  /** Observe the connection lifecycle (connecting → connected → synced / error). */
  onStatusChange?: (status: HiermarkCollaborationStatus) => void;
  /** A connect failure that has exhausted all retries. */
  onError?: (error: Error) => void;
  /** A reconnect attempt is about to run (1-based). */
  onRetry?: (attempt: number) => void;
  /** The number of locally-pending (not-yet-synced) changes changed. */
  onUnsyncedChangesChange?: (count: number) => void;
  /** Reports the teardown flush outcome (so a host can warn about lost edits). */
  onBeforeUnmount?: (result: HiermarkCollaborationFlushResult) => void;
}

/** Built-in Hocuspocus transport: connect to `url` for `documentName`. */
export interface HiermarkCollaborationHocuspocusConfig extends HiermarkCollaborationCommonConfig {
  provider: "hocuspocus";
  url: string;
  token?: string;
  runtime?: never;
}

/** Custom transport: the host injects a {@link HiermarkCollaborationRuntime}. */
export interface HiermarkCollaborationRuntimeConfig extends HiermarkCollaborationCommonConfig {
  /** A custom transport (or a test double) — no Hocuspocus fields required. */
  runtime: HiermarkCollaborationRuntime;
  provider?: never;
  url?: never;
  token?: never;
}

/**
 * A discriminated union: pass `provider: "hocuspocus"` + `url` for the
 * built-in transport, or `runtime` for a custom one — never fake one to
 * satisfy the other.
 */
export type HiermarkCollaborationConfig =
  | HiermarkCollaborationHocuspocusConfig
  | HiermarkCollaborationRuntimeConfig;

// ---------------------------------------------------------------------------
// Images / figures (host-owned storage)
// ---------------------------------------------------------------------------

/** The resolved location of an image after the host has stored it. */
export interface HiermarkUploadedImage {
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
export type HiermarkImageUploadHandler = (
  file: File,
  context: { surfaceId: HiermarkSurfaceId },
) => Promise<HiermarkUploadedImage | null>;

/**
 * Which surface the editor presents: the rich WYSIWYG editor (`"rich"`) or a
 * raw-markdown `<textarea>` (`"source"`). Source mode lets a user edit the
 * literal markdown — e.g. hand-tweak a GFM table or a math expression — and
 * re-parses back into the rich editor on switch. Source edits emit `onChange`
 * (as `{ kind: "markdown" }` content) and are committed automatically whenever
 * the handle is read (`save()`, `getMarkdown()`, …), so they persist even if
 * the surface saves or unmounts before switching back to rich.
 */
export type HiermarkEditorMode = "rich" | "source";

// ---------------------------------------------------------------------------
// Imperative handle (spec §5.8)
// ---------------------------------------------------------------------------

export interface HiermarkEditorHandle {
  surfaceId: HiermarkSurfaceId;
  focusBlock(blockId: HiermarkBlockId, opts?: { scroll?: boolean }): void;
  scrollBlockIntoView(blockId: HiermarkBlockId, opts?: ScrollIntoViewOptions): void;
  /**
   * Reads are source-aware: while in source mode, edited markdown is first
   * committed (id-preserving) into the editor, so getSnapshot / getMarkdown /
   * getJSON / save always reflect the text visible to the user — source mode
   * is never an invisible draft buffer.
   */
  getSnapshot(): HiermarkSurfaceSnapshot;
  getMarkdown(): string;
  getJSON(): unknown;
  save(): Promise<HiermarkEditorSavePayload>;
  /**
   * Replace the editor's content (the escape hatch for hosts that need to swap
   * in a new revision after mount — see {@link HiermarkEditorProps.value}, which is
   * mount-time only). `emitUpdate` defaults to true (fires onChange/snapshot).
   */
  setContent(content: HiermarkEditorContent, opts?: { emitUpdate?: boolean }): void;
  /**
   * Upload image files through {@link HiermarkEditorProps.onImageUpload} and insert
   * them at the cursor — the programmatic path for a host "insert image" button
   * / file picker. No-op (resolves immediately) when no upload handler is set.
   */
  uploadImages(files: FileList | File[]): Promise<void>;
  /** The current edit surface — `"rich"` or raw-markdown `"source"`. */
  getMode(): HiermarkEditorMode;
  /**
   * Switch between the rich editor and the raw-markdown source `<textarea>`.
   * Switching to `"rich"` re-parses the edited markdown; block ids are restored
   * onto unchanged, reordered, and edited-in-place blocks (so branch edges /
   * annotations anchored on them survive the round-trip). No-op under active
   * collaboration (source mode would clobber the shared doc) — `getMode` then
   * stays `"rich"`.
   */
  setMode(mode: HiermarkEditorMode): void;
  collapseBlock(blockId: HiermarkBlockId): void;
  expandBlock(blockId: HiermarkBlockId): void;
  /**
   * Apply a surgical edit to a block, by id, as one transaction (synced via
   * Yjs) — the supported way for host UI (e.g. a tasks panel toggling a
   * checklist item, or resolving an annotation) to mutate canonical block state.
   * Returns false if no block with that id exists. See {@link HiermarkBlockEdit}.
   */
  updateBlock(blockId: HiermarkBlockId, edit: HiermarkBlockEdit): boolean;
  /**
   * Advanced escape hatch (spec §5.8): the underlying Tiptap editor. Prefer the
   * typed handle methods; reach for this only when no first-class API exists.
   */
  getUnsafeTiptapEditor(): unknown;
}

// ---------------------------------------------------------------------------
// Editor props (spec §5.4)
// ---------------------------------------------------------------------------

export interface HiermarkEditorProps<AnnotationData = unknown> {
  surfaceId: HiermarkSurfaceId;
  /**
   * Identity of the synthetic root block. Block ids are **surface-scoped**, so
   * the constant default (`"blk_root"`) is safe — don't treat block ids as
   * globally unique across surfaces.
   */
  rootBlockId?: HiermarkBlockId;

  /**
   * **Mount-time content only** — captured once when the editor mounts; later
   * changes to `value` are NOT applied (this is not a controlled input). To
   * replace content after mount, remount with a new React `key`, or seed a fresh
   * surface. A controlled `value` / `defaultValue` split may arrive later.
   */
  value: HiermarkEditorContent;
  /**
   * Change this token to re-apply `value` after mount — a declarative revision
   * swap (history restore, server-pushed content) without remounting by `key`.
   * Block ids are preserved for unchanged / edited-in-place blocks (like source
   * mode). Ignored under collaboration (the shared Y.Doc owns content).
   */
  revision?: string | number;
  title?: string;
  editable?: boolean;
  autofocus?: boolean | "start" | "end" | HiermarkBlockId;

  /**
   * Blocks to visually highlight (class `hiermark-block-highlighted`, themable via
   * `--hiermark-highlight-bg`) — e.g. search hits or validation errors. Updates
   * re-decorate in place without remounting.
   */
  highlightedBlockIds?: Iterable<HiermarkBlockId>;
  activeBlockId?: HiermarkBlockId | null;
  collapsedBlockIds?: Iterable<HiermarkBlockId>;

  branchChildren?: Record<HiermarkBlockId, HiermarkBranchChildSummary[]>;
  branchPolicy?: HiermarkBranchPolicy;

  annotations?: HiermarkAnnotationRegistry<AnnotationData>;
  annotationContext?: AnnotationData;

  collaboration?: HiermarkCollaborationConfig;

  /**
   * Enables image paste / drag-drop / picker insertion, routing each file
   * through this handler so the host owns storage. Without it, image upload is
   * inert (pasting an image file does nothing); `![alt](src)` markdown still
   * renders regardless.
   */
  onImageUpload?: HiermarkImageUploadHandler;
  /** Reports an image upload rejection (the handler threw). */
  onImageUploadError?: (error: unknown, file: File) => void;
  /**
   * Image-`src` policy enforced by the sanitizer. The default allowlist is
   * http/https/blob, relative URLs, and `data:image/*`. Return false to strip
   * an image with a disallowed src.
   */
  isAllowedImageSrc?: (src: string) => boolean;
  /**
   * Link-`href` policy enforced by the sanitizer (and by the link popover's
   * "Open" affordance). The default allowlist is http/https/mailto plus
   * relative URLs, after control-character normalization. Return false to
   * strip the link mark (its text is kept).
   */
  isAllowedLinkHref?: (href: string) => boolean;

  /** Fires when the edit surface toggles between rich and raw-markdown source. */
  onModeChange?: (mode: HiermarkEditorMode) => void;

  /**
   * Show a floating formatting toolbar (bold / italic / strikethrough / inline
   * code) over a non-empty text selection. Default true; set false to disable
   * (e.g. a read-only or minimal surface).
   */
  bubbleMenu?: boolean;

  /**
   * Accessible name for the editable region (the ProseMirror `role="textbox"`).
   * Defaults to the `title` ("Markdown editor: <title>") or "Markdown editor".
   * Set this when several surfaces share a screen so each is distinguishable.
   */
  ariaLabel?: string;

  slots?: HiermarkEditorSlots;
  className?: string;

  onReady?: (handle: HiermarkEditorHandle) => void;
  /**
   * Fires on every edit. The emitted content is `tiptap-json` (cheap); the
   * markdown serialization is produced only by {@link HiermarkEditorHandle.save} /
   * the save payload, not on every keystroke.
   */
  onChange?: (event: HiermarkEditorChangeEvent) => void;
  onSnapshotChange?: (snapshot: HiermarkSurfaceSnapshot) => void;
  onBranchRequest?: (event: HiermarkBranchRequestEvent) => void;
  onOpenBranchChild?: (event: HiermarkOpenBranchChildEvent) => void;
  onActiveBlockChange?: (blockId: HiermarkBlockId | null) => void;
}
