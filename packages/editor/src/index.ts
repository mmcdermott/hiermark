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
  SMART_RULES,
  isHamBlockNode,
  isEmptyBlockNode,
} from "./snapshot/blockTreePolicy";
export type { BranchabilityContext } from "./snapshot/blockTreePolicy";

// Markdown helpers (import/export & server-reconciliation path)
export { fnv1a64Hex, normalizeForHash } from "./markdown/hash";
export {
  stripStableIds,
  readStableId,
  injectInlineId,
  blockIdLine,
  type StableIdKind,
} from "./markdown/stable-id";
export {
  headingDepthOf,
  inferBlockContainment,
  inferContainmentFromMarkdown,
  type ContainmentBlock,
} from "./markdown/containment";
export {
  parseChecklist,
  normalize,
  taskKey,
  injectTaskIds,
  type ChecklistItem,
} from "./markdown/checklist";
export { extractCitationKeys, findCitations, type CitationKey } from "./markdown/citations";
export {
  extractResourceLinks,
  findResources,
  detectResourceKind,
  type ResourceRef,
  type ResourceKind,
} from "./markdown/resources";

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
  createExampleAnnotationRegistry,
  createTaskAnnotation,
  createCitationAnnotation,
  createMentionAnnotation,
  createUrlAnnotation,
  type HamExampleAnnotationContext,
} from "./annotations/recognizers";

// Public types
export type * from "./types";
