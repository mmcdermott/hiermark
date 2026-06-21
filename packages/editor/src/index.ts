// @hiermark/editor — one collaborative, block-centric markdown surface.

// Injected at build time from package.json by tsup/vitest `define` (see
// tsup.config.ts) so it can never drift from the published version.
declare const __HIERMARK_PKG_VERSION__: string;
export const HIERMARK_EDITOR_VERSION: string = __HIERMARK_PKG_VERSION__;

// Component
export { HiermarkEditor } from "./HiermarkEditor";

// Tiptap interop: the one intentional Tiptap type on the public surface — the
// `editor` prop of a custom SuggestPopover slot (HiermarkSuggestPopoverProps) is
// a Tiptap Editor. Re-exported so consumers can name it without a direct
// @tiptap/core import. (Most Tiptap/ProseMirror/Yjs internals stay behind
// `unknown`; use `getUnsafeTiptapEditor()` for the escape hatch.)
export type { Editor } from "@tiptap/core";

// Extensions
export { createHiermarkEditorExtensions } from "./extensions/createHiermarkEditorExtensions";
export type {
  HiermarkEditorExtensionOptions,
  HiermarkCollabBinding,
} from "./extensions/createHiermarkEditorExtensions";

// Collaboration
export { createHocuspocusCollab, flushAndDestroy } from "./collab/hocuspocus";
export { BlockId } from "./extensions/block-id";
export type { BlockIdOptions } from "./extensions/block-id";
export { HiermarkCodeBlock, hiermarkLowlight } from "./extensions/code-block";
export { HiermarkInlineMath, HiermarkBlockMath } from "./extensions/math";
export type { HiermarkMathClick, HiermarkMathOptions } from "./extensions/math";
export { Sanitize, isSafeUri, isSafeImageSrc } from "./extensions/sanitize";
export type { SanitizeOptions } from "./extensions/sanitize";
export { LinkEditor, linkEditorKey } from "./extensions/link-editor";
export type {
  LinkEditorOptions,
  LinkEditorContext,
  LinkEditTarget,
} from "./extensions/link-editor";
export { ImageUpload, uploadHiermarkImages, imageUploadKey } from "./extensions/image-upload";
export type { ImageUploadContext, ImageUploadOptions } from "./extensions/image-upload";
export { ImageEditor, imageEditorKey } from "./extensions/image-editor";
export type {
  ImageEditorOptions,
  ImageEditorContext,
  ImageEditTarget,
} from "./extensions/image-editor";
export { BlockGutter, blockGutterKey } from "./extensions/block-gutter";
export type {
  BlockGutterContext,
  BlockGutterOptions,
  GutterEntry,
} from "./extensions/block-gutter";
export { TaskInputRules } from "./extensions/task-input-rules";
export {
  DefaultBranchButton,
  DefaultBranchChildChip,
  BlockGutterAffordances,
} from "./components/gutter";
export { BlockFold, blockFoldKey, computeFold } from "./extensions/block-fold";
export type {
  BlockFoldContext,
  BlockFoldOptions,
  FoldNodeMeta,
  FoldResult,
} from "./extensions/block-fold";

// Identity
export { generateBlockId, isBlockId } from "./id";

// Snapshot
export {
  getHiermarkSurfaceSnapshot,
  surfaceSnapshotFromDoc,
} from "./snapshot/getHiermarkSurfaceSnapshot";
export type { SurfaceSnapshotOptions } from "./snapshot/getHiermarkSurfaceSnapshot";
export { projectBlockTree, previewOf } from "./snapshot/projectBlockTree";
export type { BlockNodeMeta, ProjectBlockTreeOptions } from "./snapshot/projectBlockTree";
export {
  DEFAULT_HIERMARK_BLOCK_TYPES,
  isBranchable,
  resolveBranchMode,
  computeBranchPointSet,
  branchModeFromSet,
  SMART_RULES,
  isHiermarkBlockNode,
  isEmptyBlockNode,
} from "./snapshot/blockTreePolicy";
export type { BranchabilityContext } from "./snapshot/blockTreePolicy";
export { collectBlockIdentities, planBlockIdRestore } from "./snapshot/blockIdentity";
export type { BlockIdentity, BlockIdRestore } from "./snapshot/blockIdentity";

// Markdown helpers (import/export & server-reconciliation path).
// Single-sourced from the pure `./markdown` barrel, which is also published as the
// `@hiermark/editor/markdown` subpath so servers can import these without the React stack
// (see GitHub issue #50). Re-exporting from there keeps the root and subpath in sync.
export * from "./markdown";

// Annotations
export { recognizeAnnotations, type RecognizeInput } from "./annotations/recognize";
export { resolveHits, type HitMeta } from "./annotations/conflict";
export { annotationId } from "./annotations/identity";
export {
  AnnotationLayer,
  annotationLayerKey,
  type AnnotationLayerContext,
  type AnnotationLayerOptions,
} from "./annotations/plugin";
export { AnnotationPopover, type OpenAnnotation } from "./annotations/AnnotationPopover";
export {
  AnnotationSuggest,
  annotationSuggestKey,
  collectSuggestions,
  dismissAnnotationSuggest,
  type AnnotationSuggestContext,
  type AnnotationSuggestState,
  type AnnotationSuggestOptions,
} from "./annotations/suggest";
export { SuggestPopover, type SuggestPopoverProps } from "./annotations/SuggestPopover";
export {
  createExampleAnnotationRegistry,
  createTaskAnnotation,
  createCitationAnnotation,
  createMentionAnnotation,
  createUrlAnnotation,
  type HiermarkExampleAnnotationContext,
} from "./annotations/recognizers";

// Public types
export type * from "./types";
