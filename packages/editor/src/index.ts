// @ham/editor — one collaborative, block-centric markdown surface.

export const HAM_EDITOR_VERSION = "0.1.0";

// Component
export { HamEditor } from "./HamEditor";

// Extensions
export { createHamEditorExtensions } from "./extensions/createHamEditorExtensions";
export type {
  HamEditorExtensionOptions,
  HamCollabBinding,
} from "./extensions/createHamEditorExtensions";

// Collaboration
export { createHocuspocusCollab, flushAndDestroy } from "./collab/hocuspocus";
export { BlockId } from "./extensions/block-id";
export type { BlockIdOptions } from "./extensions/block-id";
export { HamCodeBlock, hamLowlight } from "./extensions/code-block";
export { HamInlineMath, HamBlockMath } from "./extensions/math";
export type { HamMathClick, HamMathOptions } from "./extensions/math";
export { Sanitize, isSafeUri, isSafeImageSrc } from "./extensions/sanitize";
export type { SanitizeOptions } from "./extensions/sanitize";
export { LinkEditor, linkEditorKey } from "./extensions/link-editor";
export type {
  LinkEditorOptions,
  LinkEditorContext,
  LinkEditTarget,
} from "./extensions/link-editor";
export { ImageUpload, uploadHamImages, imageUploadKey } from "./extensions/image-upload";
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
export { getHamSurfaceSnapshot, surfaceSnapshotFromDoc } from "./snapshot/getHamSurfaceSnapshot";
export type { SurfaceSnapshotOptions } from "./snapshot/getHamSurfaceSnapshot";
export { projectBlockTree, previewOf } from "./snapshot/projectBlockTree";
export type { BlockNodeMeta, ProjectBlockTreeOptions } from "./snapshot/projectBlockTree";
export {
  DEFAULT_HAM_BLOCK_TYPES,
  isBranchable,
  resolveBranchMode,
  computeBranchPointSet,
  branchModeFromSet,
  SMART_RULES,
  isHamBlockNode,
  isEmptyBlockNode,
} from "./snapshot/blockTreePolicy";
export type { BranchabilityContext } from "./snapshot/blockTreePolicy";
export { collectBlockIdentities, planBlockIdRestore } from "./snapshot/blockIdentity";
export type { BlockIdentity, BlockIdRestore } from "./snapshot/blockIdentity";

// Markdown helpers (import/export & server-reconciliation path).
// Single-sourced from the pure `./markdown` barrel, which is also published as the
// `@ham/editor/markdown` subpath so servers can import these without the React stack
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
  type HamExampleAnnotationContext,
} from "./annotations/recognizers";

// Public types
export type * from "./types";
