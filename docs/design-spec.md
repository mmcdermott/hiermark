# Hierarchical, Annotatable Markdown (HAM) — Standalone Package Design Specification

**Date:** 2026-06-07  
**Audience:** implementers building HAM as a standalone installable package set before integrating it into a larger research/project-management web app.  
**Status:** proposed v1 architecture.

---

## 0. Executive summary

HAM should be extracted and developed as a focused, standalone package system. The right v1 shape is **two installable packages**:

```text
@ham/editor   # one editable markdown/block-tree surface
@ham/canvas   # 2D grid/canvas of many editable surfaces
```

Internally, each package should have small, explicit modules for block identity, annotations, block snapshots, topology projection, layout, focus, and operation payloads. Those modules do **not** need to be separate npm packages in v1.

The key architectural distinction is:

```text
@ham/editor owns the intra-surface block tree.
@ham/canvas owns the inter-surface 2D topology.
```

A **surface** is the canvas unit: an editable markdown/block tree rooted at a stable root block. A surface may be displayed as a card, document, outline item, compact rail entry, or expanded editor panel. A **column** may contain multiple surfaces. If two different blocks in a surface are branched, their children become two different surfaces in the next column, not necessarily two blocks inside one child document.

This keeps the model simple while preserving the core product behavior:

```text
Vertical organization inside a surface  = block hierarchy owned by the editor.
Vertical organization inside a column   = multiple surfaces owned by the canvas.
Horizontal organization across columns  = branch edges from blocks to surfaces.
```

The package should be opinionated about its implementation stack. It should not try to support arbitrary markdown parsers, arbitrary rich-text editors, or arbitrary collaboration engines. The recommended stack is:

- **React + TypeScript** for components and APIs.
- **Tiptap 3 / ProseMirror** for the editor engine.
- **Yjs + Hocuspocus** for collaborative editing.
- **`@tiptap/markdown`** for markdown import/export.
- **Tiptap task/list/placeholder/suggestion/mathematics/table extensions** as needed.
- **dnd-kit** for drag/reorder interactions.
- **Floating UI** for block menus, branch popovers, and annotation cards.
- **TanStack Virtual** only when large columns/surfaces make virtualization necessary.
- **Vitest + Playwright + Storybook or a Vite playground** for package-local tests and demos.

The current codebase’s direction is substantially right: Tiptap, Yjs/Hocuspocus, block IDs, entity/annotation decorations, editor-to-grid block snapshots, and headless grid logic are the correct foundations. The main changes are to (1) move to a surface/edge canvas model, (2) support multiple surfaces per column, (3) stop exposing a plain `DocNode.children` tree as the core topology, (4) make nested block identity and snapshots explicit, and (5) replace the deprecated/community `tiptap-markdown` dependency with official `@tiptap/markdown` if the migration is feasible.

---

## 1. Goals and non-goals

### 1.1 Goals

HAM v1 should provide a reusable package for applications that need:

1. **Block-centric markdown editing**
   - Rich markdown editing with paragraphs, headings, lists, checklists, links, code, math, tables, and references.
   - Every meaningful structural block has a stable ID.
   - Blocks can be highlighted, collapsed, decorated, and used as branch anchors.

2. **Annotation extraction and rendering**
   - Structured entities such as tasks, citations, references, URLs, mentions, equations, and custom app annotations can be detected and rendered.
   - The editor exposes a thin registry for recognizers and renderers.
   - The package does not own app-specific entity storage.

3. **2D canvas of editable surfaces**
   - A canvas arranges many editable surfaces in a depth-by-breadth layout.
   - A column can contain multiple surfaces.
   - A branch edge connects a source block in one surface to a target surface in the next column.
   - Multiple child surfaces can branch from the same block and be reordered as siblings.
   - Different blocks in the same source surface can branch to different target surfaces in the next column.

4. **Natural interaction**
   - Branch from a block.
   - Add a sibling branch from the same block.
   - Reorder sibling surfaces under the same source block.
   - Collapse/expand surfaces and blocks.
   - Highlight active ancestors, descendants, and branch paths.
   - Scroll/focus the active surface and compact unrelated columns.
   - Navigate by keyboard.

5. **Host-controlled persistence**
   - The package calls handlers; the host application persists content, topology, and metadata.
   - The package defines event payloads and UI semantics; the host supplies storage and authorization.

6. **Collaborative editing**
   - Each editable surface can be collaborative via Yjs/Hocuspocus.
   - Collaboration is surface-local: each surface has its own Yjs document or subdocument.
   - Canvas topology changes can be persisted independently from content edits.

7. **Package-local development**
   - HAM should have a playground and fixtures independent of the larger app.
   - LLM coding agents should be able to work on one constrained behavior at a time with tests.

### 1.2 Non-goals for v1

HAM v1 should explicitly avoid:

1. **Span anchors**
   - Branch anchors are block IDs only. No character offsets, text spans, or range anchoring in v1.

2. **Arbitrary cross-column drag/drop**
   - Users can reorder sibling surfaces under the same source block.
   - Users cannot drag a surface arbitrarily across columns or reparent it under an unrelated block in v1.

3. **Full subtree copy/paste semantics**
   - Copying markdown text does not copy branch topology.
   - Pasted blocks receive new IDs when needed.

4. **Editor-engine neutrality**
   - The package uses Tiptap/ProseMirror internally. It should not support Slate, Lexical, Milkdown, BlockNote, or raw textarea adapters in v1.

5. **Markdown-parser neutrality**
   - The package uses Tiptap’s Markdown extension for editor import/export. It should not expose a pluggable parser interface in v1.

6. **Server ownership**
   - HAM does not include an application server, database schema, auth model, task database, bibliography database, or project model.

7. **Complex block reparenting in the canvas**
   - The canvas may expose future affordances for reparenting block groups, but canonical intra-surface block mutations must be performed by the editor.

---

## 2. Core concepts

### 2.1 Surface

A **surface** is an editable block tree displayed somewhere on the canvas. It is the unit that most users will perceive as a “document,” “card,” “subdocument,” or “section,” but the generic package should call it a surface to avoid overloading document semantics.

```ts
export type HamSurfaceId = string;
export type HamBlockId = string;

export interface HamSurface<Meta = unknown> {
  id: HamSurfaceId;
  rootBlockId: HamBlockId;
  title?: string;
  meta?: Meta;
  content: HamEditorContent;
  readonly?: boolean;
}
```

A host app may map surfaces to database documents, root blocks, notes, cards, or files. HAM does not care.

### 2.2 Block

A **block** is a stable, addressable structural node inside a surface’s editable content.

Examples:

- paragraph
- heading
- checklist item or task item
- bullet/list item
- ordered-list item
- blockquote
- code block
- math block
- table
- image/figure reference
- custom callout

Every block that can be highlighted, collapsed, annotated, or branched from must have a stable `HamBlockId`.

```ts
export interface HamBlockSnapshot {
  id: HamBlockId;
  type: string;
  parentId: HamBlockId | null;
  childIds: HamBlockId[];
  order: number;
  depth: number;
  textPreview: string;
  isEmpty: boolean;
  isCollapsed?: boolean;
  attrs?: Record<string, unknown>;
}

export interface HamSurfaceSnapshot {
  surfaceId: HamSurfaceId;
  rootBlockId: HamBlockId;
  blocks: Record<HamBlockId, HamBlockSnapshot>;
  blockOrder: HamBlockId[]; // preorder traversal
  revision?: string | number;
}
```

The editor owns this tree because editing operations create, split, merge, delete, indent, outdent, and reorder blocks.

### 2.3 Branch edge

A **branch edge** connects a source block in one surface to a target surface, usually displayed one column to the right.

```ts
export type HamBranchEdgeId = string;

export interface HamBranchEdge<Meta = unknown> {
  id: HamBranchEdgeId;
  fromSurfaceId: HamSurfaceId;
  fromBlockId: HamBlockId;
  toSurfaceId: HamSurfaceId;
  order: number; // sibling order among branches from the same source block
  meta?: Meta;
}
```

A block can have zero, one, or many branch edges. Branch edges are not markdown content. They are canvas topology.

### 2.4 Column

A **column** is a visual depth band in the canvas. A column can contain multiple surfaces.

The root column usually has one surface. A rightward column can contain many surfaces generated by branches from one or more blocks in the preceding column.

```ts
export interface HamCanvasColumn<SurfaceMeta = unknown, EdgeMeta = unknown> {
  depth: number;
  items: HamCanvasItem<SurfaceMeta, EdgeMeta>[];
}

export interface HamCanvasItem<SurfaceMeta = unknown, EdgeMeta = unknown> {
  surface: HamSurface<SurfaceMeta>;
  incomingEdge?: HamBranchEdge<EdgeMeta>;
  parentSurfaceId?: HamSurfaceId;
  anchorBlockId?: HamBlockId;
  pathState: "active" | "ancestor" | "descendant" | "sibling" | "unrelated";
  displayMode: "expanded" | "card" | "outline" | "rail" | "hidden";
}
```

### 2.5 Canvas topology

Canvas topology is the graph of surfaces and branch edges.

```ts
export interface HamCanvasState<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HamSurfaceId;
  surfaces: Record<HamSurfaceId, HamSurface<SurfaceMeta>>;
  branchEdges: HamBranchEdge<EdgeMeta>[];
  activeSurfaceId: HamSurfaceId;
  activeBlockId?: HamBlockId | null;
  collapsedSurfaceIds?: Set<HamSurfaceId>;
  collapsedBlockIdsBySurface?: Record<HamSurfaceId, Set<HamBlockId>>;
}
```

The canvas owns this topology. The editor does not.

### 2.6 Active path

The active path is the branch-edge lineage from the root surface to the active surface, plus optionally the active block.

```ts
export interface HamActivePath {
  rootSurfaceId: HamSurfaceId;
  activeSurfaceId: HamSurfaceId;
  activeBlockId?: HamBlockId | null;
  surfaceIds: HamSurfaceId[];
  edgeIds: HamBranchEdgeId[];
  anchorBlockIds: HamBlockId[];
}
```

The active path drives:

- ancestor highlighting;
- descendant highlighting;
- compacting unrelated columns;
- scroll/focus behavior;
- keyboard navigation;
- branch-edge emphasis.

---

## 3. Ownership boundaries

### 3.1 Editor owns intra-surface content and block tree

`@ham/editor` owns:

- Tiptap editor construction.
- Markdown import/export.
- ProseMirror schema/extensions.
- Stable block ID assignment.
- Block splitting/merging policies.
- Nested block snapshots.
- Block collapse state inside the surface if configured.
- Annotation recognition and rendering.
- Block-level adornment slots.
- Branch gutter affordances inside the editor.
- Surface-local collaborative editing.

`@ham/editor` does **not** own:

- multi-surface layout;
- branch topology;
- sibling surface ordering;
- application persistence;
- tasks database;
- bibliography database;
- project/workspace model;
- server routes.

### 3.2 Canvas owns inter-surface topology and layout

`@ham/canvas` owns:

- surfaces by ID;
- branch edges by source block;
- columns and surface ordering;
- active surface/block/path;
- focus and scroll orchestration;
- surface collapse/expand modes;
- sibling surface reorder interactions;
- branch creation UI orchestration;
- keyboard navigation across surfaces and columns;
- passing per-surface branch children and highlight props into `@ham/editor`.

`@ham/canvas` does **not** own:

- markdown parsing;
- ProseMirror transactions;
- block creation/deletion inside a surface;
- block split/merge semantics;
- collaborative Yjs document internals;
- app-specific persistence.

### 3.3 Host app owns persistence and domain data

The host application owns:

- database documents/surfaces/blocks/edges;
- authorization;
- server-side validation;
- collaboration server deployment;
- task records;
- citation/reference records;
- external-resource records;
- import/export workflows;
- project/submission/lab/workspace objects.

HAM calls host handlers. The host persists or rejects the operation.

---

## 4. Recommended dependency stack

### 4.1 Required runtime dependencies

#### `@ham/editor`

```json
{
  "dependencies": {
    "@tiptap/core": "^3",
    "@tiptap/react": "^3",
    "@tiptap/starter-kit": "^3",
    "@tiptap/markdown": "^3",
    "@tiptap/extension-placeholder": "^3",
    "@tiptap/extension-task-list": "^3",
    "@tiptap/extension-task-item": "^3",
    "@tiptap/extension-suggestion": "^3",
    "@tiptap/extension-collaboration": "^3",
    "@tiptap/extension-collaboration-caret": "^3",
    "@tiptap/extension-mathematics": "^3",
    "@tiptap/extension-table": "^3",
    "@hocuspocus/provider": "^4",
    "yjs": "^13",
    "katex": "^0.17",
    "@floating-ui/react": "^0.27"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19"
  }
}
```

Notes:

- Use **Tiptap** because it is headless, extension-based, ProseMirror-backed, and already aligned with the current codebase.
- Use **official `@tiptap/markdown`** instead of the older community `tiptap-markdown` package. The community package’s repository now recommends the official Tiptap Markdown extension.
- Use **Yjs/Hocuspocus** because the current implementation already uses them and they fit the surface-local collaboration model.
- Use **Floating UI** for annotation cards, branch menus, and context popovers.
- Use **KaTeX** through Tiptap’s math extension for LaTeX rendering.

#### `@ham/canvas`

```json
{
  "dependencies": {
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^10",
    "@dnd-kit/utilities": "^3",
    "@floating-ui/react": "^0.27",
    "@tanstack/react-virtual": "^3",
    "zod": "^3"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@ham/editor": "workspace:* || ^0"
  }
}
```

Notes:

- Use **dnd-kit** for sibling surface reorder. Its sortable primitives are a good match for card/surface reordering.
- Use **TanStack Virtual** as an optional internal optimization when many surfaces/blocks make DOM size problematic. Do not use it prematurely for the first demo.
- Use **Zod** for validating operation payloads in demos/tests and for public API sanity checks.

### 4.2 Development dependencies

Use:

```json
{
  "devDependencies": {
    "typescript": "^5",
    "vite": "^7",
    "vitest": "^3",
    "playwright": "^1",
    "storybook": "^9",
    "tsup": "^8",
    "eslint": "^9",
    "prettier": "^3"
  }
}
```

Recommended repo structure:

```text
ham/
  package.json
  pnpm-workspace.yaml
  packages/
    editor/
      src/
      tests/
      package.json
    canvas/
      src/
      tests/
      package.json
  apps/
    playground/
      src/
      package.json
  fixtures/
    simple-branching.json
    multi-surface-column.json
    nested-blocks.json
    annotations.json
```

Build outputs should be installable, not TS-source-only:

```text
dist/
  index.js
  index.d.ts
  styles.css
```

Exports should be explicit:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./dist/styles.css"
  },
  "sideEffects": ["./dist/styles.css"]
}
```

---

## 5. Package: `@ham/editor`

### 5.1 Purpose

`@ham/editor` renders and edits one surface: one collaborative, block-centric markdown document rooted at a stable block.

It should feel like a document editor, but expose enough block-level structure for the canvas to branch from blocks and highlight relationships.

### 5.2 Public exports

```ts
export { HamEditor } from "./HamEditor";
export { createHamEditorExtensions } from "./extensions/createHamEditorExtensions";
export { getHamSurfaceSnapshot } from "./snapshot/getHamSurfaceSnapshot";
export { createHocuspocusCollab } from "./collab/hocuspocus";

export type {
  HamEditorProps,
  HamEditorContent,
  HamBlockId,
  HamSurfaceId,
  HamBlockSnapshot,
  HamSurfaceSnapshot,
  HamBlockEvent,
  HamAnnotationType,
  HamAnnotationHit,
  HamAnnotationRegistry,
  HamBranchChildSummary,
  HamEditorHandle,
} from "./types";
```

### 5.3 Content type

Use Tiptap JSON as the preferred in-memory content format and Markdown as an import/export format.

```ts
export type HamEditorContent =
  | { kind: "tiptap-json"; json: unknown }
  | { kind: "markdown"; markdown: string };
```

Rationale:

- Tiptap/ProseMirror JSON preserves node attributes such as stable block IDs.
- Markdown remains essential for interoperability, LLM ingestion, git export, and human-readable storage.
- The package should support both, but avoid pretending raw markdown is always lossless.

Recommended host persistence:

```ts
interface PersistedSurface {
  id: string;
  rootBlockId: string;
  title: string;
  tiptapJson: unknown; // preferred canonical rich editor state
  markdown: string; // derived/export state, updated on save
  blockSnapshot: HamSurfaceSnapshot;
  yjsState?: Uint8Array; // if collaborative editing is enabled
}
```

### 5.4 `HamEditorProps`

```ts
export interface HamEditorProps<AnnotationData = unknown> {
  surfaceId: HamSurfaceId;
  rootBlockId?: HamBlockId;

  value: HamEditorContent;
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

  onReady?: (handle: HamEditorHandle) => void;
  onChange?: (event: HamEditorChangeEvent) => void;
  onSnapshotChange?: (snapshot: HamSurfaceSnapshot) => void;
  onBlockEvents?: (events: HamBlockEvent[]) => void;
  onBranchRequest?: (event: HamBranchRequestEvent) => void;
  onOpenBranchChild?: (event: HamOpenBranchChildEvent) => void;
  onActiveBlockChange?: (blockId: HamBlockId | null) => void;
}
```

### 5.5 Branch child summaries

The canvas passes branch children into the editor so the editor can render per-block indicators.

```ts
export interface HamBranchChildSummary {
  edgeId: HamBranchEdgeId;
  surfaceId: HamSurfaceId;
  title?: string;
  order: number;
  active?: boolean;
}
```

### 5.6 Branch request event

The editor emits a branch request when the user clicks the branch affordance on a block.

```ts
export interface HamBranchRequestEvent {
  surfaceId: HamSurfaceId;
  blockId: HamBlockId;
  blockSnapshot: HamBlockSnapshot;
  surfaceSnapshot: HamSurfaceSnapshot;
  textPreview: string;
  save: () => Promise<HamEditorSavePayload>;
  nativeEvent?: Event;
}
```

Important: the editor should capture the block snapshot synchronously before any async save begins. This avoids stale/destroyed-editor bugs.

### 5.7 Save payload

```ts
export interface HamEditorSavePayload {
  surfaceId: HamSurfaceId;
  content: {
    tiptapJson: unknown;
    markdown: string;
  };
  snapshot: HamSurfaceSnapshot;
  revision?: string | number;
}
```

### 5.8 Editor handle

The canvas may need imperative operations for focus and scroll. Keep this narrow.

```ts
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
}
```

Do not expose the raw Tiptap editor as the primary API. If absolutely necessary, expose it through an advanced escape hatch:

```ts
getUnsafeTiptapEditor(): Editor | null;
```

### 5.9 Block ID policy

All branchable/collapsible/highlightable structural block nodes must have IDs.

Default ID format:

```text
blk_<nanoid>
```

Policy:

1. IDs are generated client-side.
2. IDs are globally unique enough to be accepted by the server without replacement.
3. IDs are immutable.
4. Splitting a block keeps the original ID on the first fragment and gives the second fragment a new ID.
5. Duplicated IDs caused by paste/import are repaired immediately by assigning fresh IDs to later duplicates.
6. Empty placeholder blocks may have IDs if the editor engine requires them, but they are not branchable by default.
7. ID replacement after server confirmation should be avoided. It creates avoidable remapping problems for branch edges.

The current codebase already has a strong start with a Tiptap extension that assigns `dataBlockId` and deduplicates IDs. It should be generalized from top-level nodes to all structural block nodes that the package supports.

### 5.10 Block snapshot extraction

The editor should compute snapshots directly from the Tiptap/ProseMirror document tree, not by serializing markdown and zipping it to a separately parsed projection.

The current codebase zips exported markdown blocks with top-level editor IDs. That is adequate for a flat prototype, but nested blocks and multiple branchable levels require a true editor-tree snapshot.

Snapshot algorithm:

1. Traverse the ProseMirror document.
2. Visit every node whose Tiptap type is registered as a HAM block node.
3. Ensure it has a stable `dataBlockId`.
4. Compute parent/child relationships from the ProseMirror tree and/or semantic heading/list nesting policy.
5. Emit preorder `blockOrder`.
6. Emit text preview from node text content.
7. Mark branchable/collapsible state based on block type and branch policy.

### 5.11 Block tree policy

The package needs a deterministic policy for what counts as nested structure.

Recommended v1 policy:

1. **Headings create outline containment.**
   - Blocks after a heading belong under that heading until a heading of equal or higher level appears.
   - This is a semantic projection, even if ProseMirror stores headings and paragraphs as siblings.

2. **Lists create literal containment.**
   - List items and nested list items preserve actual nesting.

3. **Task items are blocks.**
   - A checklist item is branchable if non-empty.

4. **Paragraphs are leaf blocks unless under a heading/list item.**

5. **Root block is synthetic if needed.**
   - The surface root is a stable block containing all top-level blocks.

This avoids needing a custom ProseMirror schema where headings physically contain following paragraphs, while still exposing the tree structure the canvas needs.

### 5.12 Branch policy

```ts
export type HamBranchPolicy =
  | "any-nonempty-block"
  | "headings-only"
  | "root-only"
  | ((block: HamBlockSnapshot, snapshot: HamSurfaceSnapshot) => boolean);
```

Default: `any-nonempty-block`.

### 5.13 Annotation registry

The annotation layer should be thin and stable.

```ts
export interface HamAnnotationRegistry<Ctx = unknown> {
  types: HamAnnotationType<Ctx>[];
}

export interface HamAnnotationType<Ctx = unknown> {
  name: string;
  priority?: number;
  recognize: HamAnnotationRecognizer<Ctx>;
  render: React.ComponentType<HamAnnotationRenderProps<Ctx>>;
  placement: "inline" | "block-chip" | "gutter" | "popover" | "decoration";
}

export type HamAnnotationRecognizer<Ctx = unknown> = (args: {
  surfaceId: HamSurfaceId;
  block: HamBlockSnapshot;
  text: string;
  context: Ctx;
}) => HamAnnotationHit[];

export interface HamAnnotationHit {
  id: string;
  type: string;
  blockId: HamBlockId;
  from?: number;
  to?: number;
  label?: string;
  data?: unknown;
}
```

Conflict policy:

1. Hits are sorted by priority descending, then range length descending, then type name.
2. Overlapping inline hits are resolved deterministically.
3. Block-level hits can coexist unless a type opts out.
4. Recognizers must be pure and deterministic for the same input/context.

Example: task annotation

```ts
const taskAnnotation: HamAnnotationType<TaskContext> = {
  name: "task",
  priority: 100,
  placement: "block-chip",
  recognize({ block, text, context }) {
    if (block.type !== "taskItem") return [];
    return [
      {
        id: `task:${block.id}`,
        type: "task",
        blockId: block.id,
        label: text.replace(/^\s*[-*]\s*\[[ x]\]\s*/, ""),
        data: context.tasksByBlockId[block.id],
      },
    ];
  },
  render: TaskChip,
};
```

### 5.14 Collaboration config

```ts
export interface HamCollaborationConfig {
  enabled: boolean;
  documentName: string; // usually surface ID or stable collab doc ID
  provider: "hocuspocus";
  url: string;
  token?: string;
  user?: {
    id?: string;
    name: string;
    color?: string;
  };
  ydoc?: Y.Doc;
  initialSyncTimeoutMs?: number;
}
```

The package may also export a lower-level helper:

```ts
createHocuspocusCollab(config): HamCollaborationRuntime
```

The editor should gate mounting/seeding carefully:

1. Create/load the Yjs document.
2. Connect to Hocuspocus.
3. Wait for initial sync or timeout.
4. Only then seed initial content if the collaborative doc is empty.
5. Flush unsynced changes on unmount before destroying the provider.

The current codebase already implements this pattern and should preserve it.

### 5.15 Slots

Use slots rather than hardcoded UI.

```ts
export interface HamEditorSlots {
  BlockBranchButton?: React.ComponentType<HamBlockSlotProps>;
  BranchChildChip?: React.ComponentType<HamBranchChildChipProps>;
  BlockGutter?: React.ComponentType<HamBlockGutterProps>;
  AnnotationPopover?: React.ComponentType<HamAnnotationPopoverProps>;
  EmptyState?: React.ComponentType<{ surfaceId: HamSurfaceId }>;
  LoadingState?: React.ComponentType<{ surfaceId: HamSurfaceId }>;
  ErrorState?: React.ComponentType<{ surfaceId: HamSurfaceId; error: Error }>;
}
```

Provide defaults so the package works out of the box.

---

## 6. Package: `@ham/canvas`

### 6.1 Purpose

`@ham/canvas` renders and manages a 2D grid of surfaces. It uses `@ham/editor` to render/edit each expanded surface, but it owns inter-surface layout and topology.

### 6.2 Public exports

```ts
export { HamCanvas } from "./HamCanvas";
export { useHamCanvas } from "./useHamCanvas";
export { projectHamColumns } from "./topology/projectHamColumns";
export { getHamActivePath } from "./topology/getHamActivePath";
export { reorderBranchSiblings } from "./topology/reorderBranchSiblings";

export type {
  HamCanvasProps,
  HamCanvasState,
  HamSurface,
  HamBranchEdge,
  HamCanvasColumn,
  HamCanvasItem,
  HamCanvasOperation,
  HamCanvasHandlers,
  HamCanvasHandle,
  HamCanvasLayoutConfig,
} from "./types";
```

### 6.3 `HamCanvasProps`

```ts
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

  handlers: HamCanvasHandlers<SurfaceMeta, EdgeMeta>;

  onReady?: (handle: HamCanvasHandle) => void;
  onActiveChange?: (active: { surfaceId: HamSurfaceId; blockId?: HamBlockId | null }) => void;
}
```

### 6.4 Layout config

```ts
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
  inactiveColumnMode: "card" | "outline" | "rail" | "hidden";
  autoScroll: boolean;
  virtualizeColumns: boolean;
  virtualizeSurfaces: boolean;
}
```

Default:

```ts
const defaultLayout: HamCanvasLayoutConfig = {
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
  autoScroll: true,
  virtualizeColumns: false,
  virtualizeSurfaces: false,
};
```

### 6.5 Behavior config

```ts
export interface HamCanvasBehaviorConfig {
  enableSurfaceReorder: boolean;
  enableBranchCreation: boolean;
  enableSiblingBranchCreation: boolean;
  enableSurfaceDeletion: boolean;
  enableKeyboardNavigation: boolean;
  branchPolicy: HamBranchPolicy;
  deleteSurfacePolicy: "prevent-if-has-children" | "delete-subtree" | "detach-children";
  pendingOperationMode: "optimistic" | "pessimistic";
}
```

Recommended v1 defaults:

```ts
const defaultBehavior: HamCanvasBehaviorConfig = {
  enableSurfaceReorder: true,
  enableBranchCreation: true,
  enableSiblingBranchCreation: true,
  enableSurfaceDeletion: true,
  enableKeyboardNavigation: true,
  branchPolicy: "any-nonempty-block",
  deleteSurfacePolicy: "prevent-if-has-children",
  pendingOperationMode: "pessimistic",
};
```

Use pessimistic topology updates by default. Content editing can be local/optimistic, but topology operations create/delete/reorder surfaces and should not appear committed until the host confirms them.

### 6.6 Canvas handlers

```ts
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
```

### 6.7 Create branch event

```ts
export interface HamCreateSurfaceFromBlockEvent {
  sourceSurfaceId: HamSurfaceId;
  sourceBlockId: HamBlockId;
  sourceBlockSnapshot: HamBlockSnapshot;
  sourceSurfaceSnapshot: HamSurfaceSnapshot;
  suggestedTitle?: string;
  insertAfterEdgeId?: HamBranchEdgeId;
  saveSourceSurface: () => Promise<HamEditorSavePayload>;
}

export interface HamCreateSurfaceResult<SurfaceMeta = unknown, EdgeMeta = unknown> {
  surface: HamSurface<SurfaceMeta>;
  edge: HamBranchEdge<EdgeMeta>;
  activate?: boolean;
}
```

The canvas should call `saveSourceSurface()` before or during branch creation so the source block ID is persisted before the edge is persisted.

### 6.8 Reorder siblings event

Sibling reorder is only valid among edges with the same `fromSurfaceId` and `fromBlockId`.

```ts
export interface HamReorderBranchSiblingsEvent {
  fromSurfaceId: HamSurfaceId;
  fromBlockId: HamBlockId;
  orderedEdgeIds: HamBranchEdgeId[];
  orderedSurfaceIds: HamSurfaceId[];
}
```

### 6.9 Delete surface event

```ts
export interface HamDeleteSurfaceEvent {
  surfaceId: HamSurfaceId;
  incomingEdgeId?: HamBranchEdgeId;
  descendantSurfaceIds: HamSurfaceId[];
  policy: "prevent-if-has-children" | "delete-subtree" | "detach-children";
}
```

V1 should default to `prevent-if-has-children` unless the host explicitly opts into subtree deletion.

### 6.10 Column projection

The canvas should project columns from surfaces, edges, active path, and editor snapshots.

Required inputs:

```ts
export interface HamProjectionInput<SurfaceMeta = unknown, EdgeMeta = unknown> {
  rootSurfaceId: HamSurfaceId;
  surfaces: Record<HamSurfaceId, HamSurface<SurfaceMeta>>;
  branchEdges: HamBranchEdge<EdgeMeta>[];
  snapshotsBySurfaceId: Record<HamSurfaceId, HamSurfaceSnapshot | undefined>;
  activeSurfaceId: HamSurfaceId;
  activeBlockId?: HamBlockId | null;
  collapsedSurfaceIds?: Set<HamSurfaceId>;
}
```

Projection rules:

1. Column 0 contains the root surface.
2. Column `d + 1` contains all child surfaces branched from surfaces in column `d`.
3. Within a parent surface, child surfaces are ordered by the source block’s preorder position in the parent snapshot.
4. For multiple branch edges from the same source block, order by edge `order`, then creation/index fallback.
5. Child surfaces from different source blocks are distinct surfaces. They do not merge into one target document.
6. Surfaces without a reachable path from the root are omitted unless `showOrphans` is enabled.
7. The active path determines path state and display mode.

Pseudocode:

```ts
function projectHamColumns(input: HamProjectionInput): HamCanvasColumn[] {
  const columns: HamCanvasColumn[] = [];
  const visited = new Set<HamSurfaceId>();

  let current = [input.rootSurfaceId];
  let depth = 0;

  while (current.length > 0) {
    const items = current.map((surfaceId) => buildCanvasItem(surfaceId, depth));
    columns.push({ depth, items });

    const next: HamSurfaceId[] = [];
    for (const surfaceId of current) {
      const snapshot = input.snapshotsBySurfaceId[surfaceId];
      const blockOrder = snapshot?.blockOrder ?? [];
      const blockRank = new Map(blockOrder.map((id, i) => [id, i]));

      const outgoing = input.branchEdges
        .filter((e) => e.fromSurfaceId === surfaceId)
        .sort((a, b) => {
          const ar = blockRank.get(a.fromBlockId) ?? Number.MAX_SAFE_INTEGER;
          const br = blockRank.get(b.fromBlockId) ?? Number.MAX_SAFE_INTEGER;
          if (ar !== br) return ar - br;
          if (a.fromBlockId !== b.fromBlockId) return a.fromBlockId.localeCompare(b.fromBlockId);
          return a.order - b.order;
        });

      for (const edge of outgoing) {
        if (!visited.has(edge.toSurfaceId)) next.push(edge.toSurfaceId);
      }
    }

    current = next;
    depth += 1;
  }

  return columns;
}
```

### 6.11 Rendering surfaces

The canvas should default to rendering `HamEditor` for expanded/active surfaces and compact previews for inactive surfaces, but all renderers should be replaceable.

```ts
export interface HamCanvasSlots<SurfaceMeta = unknown, EdgeMeta = unknown> {
  SurfaceFrame?: React.ComponentType<HamSurfaceFrameProps<SurfaceMeta, EdgeMeta>>;
  SurfaceHeader?: React.ComponentType<HamSurfaceHeaderProps<SurfaceMeta, EdgeMeta>>;
  SurfacePreview?: React.ComponentType<HamSurfacePreviewProps<SurfaceMeta, EdgeMeta>>;
  ColumnHeader?: React.ComponentType<HamColumnHeaderProps>;
  BranchConnector?: React.ComponentType<HamBranchConnectorProps<EdgeMeta>>;
  EmptyColumn?: React.ComponentType<{ depth: number }>;
  CreateBranchDialog?: React.ComponentType<HamCreateBranchDialogProps>;
}
```

Default frame modes:

```ts
export type HamSurfaceDisplayMode =
  | "expanded-editor"
  | "card-preview"
  | "outline-preview"
  | "rail-preview";
```

### 6.12 Canvas handle

```ts
export interface HamCanvasHandle {
  focusSurface(surfaceId: HamSurfaceId): void;
  focusBlock(surfaceId: HamSurfaceId, blockId: HamBlockId): void;
  scrollSurfaceIntoView(surfaceId: HamSurfaceId): void;
  scrollBlockIntoView(surfaceId: HamSurfaceId, blockId: HamBlockId): void;
  getActivePath(): HamActivePath;
  getColumns(): HamCanvasColumn[];
}
```

---

## 7. Example usage

### 7.1 Minimal local canvas

```tsx
import { HamCanvas } from "@ham/canvas";
import "@ham/canvas/styles.css";
import "@ham/editor/styles.css";

export function Demo() {
  const [surfaces, setSurfaces] = useState(initialSurfaces);
  const [edges, setEdges] = useState(initialEdges);

  return (
    <HamCanvas
      rootSurfaceId="surface_root"
      surfaces={surfaces}
      branchEdges={edges}
      handlers={{
        async createSurfaceFromBlock(event) {
          const newSurface = makeSurface({
            title: event.sourceBlockSnapshot.textPreview || "Untitled branch",
            initialMarkdown: `# ${event.sourceBlockSnapshot.textPreview}\n\nStart here.`,
          });

          const newEdge = {
            id: makeId("edge"),
            fromSurfaceId: event.sourceSurfaceId,
            fromBlockId: event.sourceBlockId,
            toSurfaceId: newSurface.id,
            order: nextOrder(edges, event.sourceSurfaceId, event.sourceBlockId),
          };

          setSurfaces((s) => ({ ...s, [newSurface.id]: newSurface }));
          setEdges((e) => [...e, newEdge]);

          return { surface: newSurface, edge: newEdge, activate: true };
        },

        async saveSurface(payload) {
          setSurfaces((s) => ({
            ...s,
            [payload.surfaceId]: {
              ...s[payload.surfaceId],
              content: { kind: "tiptap-json", json: payload.content.tiptapJson },
            },
          }));
        },
      }}
    />
  );
}
```

### 7.2 Multiple surfaces in one column

Suppose the root surface has blocks:

```text
surface_root
  block_A: Background
  block_B: Experiment plan
```

If the user branches from `block_A`, the canvas creates:

```text
edge_1: surface_root/block_A -> surface_background_notes
```

If the user then branches from `block_B`, the canvas creates:

```text
edge_2: surface_root/block_B -> surface_experiment_plan
```

Projection:

```text
Column 0
  surface_root

Column 1
  surface_background_notes     # child of block_A
  surface_experiment_plan      # child of block_B
```

These are separate surfaces, not one shared right-column document.

If the user creates a second branch from `block_A`:

```text
edge_3: surface_root/block_A -> surface_background_alternative
```

Projection:

```text
Column 1
  surface_background_notes        # block_A order 0
  surface_background_alternative  # block_A order 1
  surface_experiment_plan         # block_B order 0
```

### 7.3 Collaborative surface

```tsx
<HamEditor
  surfaceId="surface_123"
  value={{ kind: "markdown", markdown: initialMarkdown }}
  collaboration={{
    enabled: true,
    provider: "hocuspocus",
    documentName: "surface_123",
    url: "wss://collab.example.com",
    token: authToken,
    user: { id: user.id, name: user.name, color: user.color },
  }}
  onSnapshotChange={(snapshot) => updateSnapshotCache(snapshot)}
  onChange={(event) => queueSave(event)}
/>
```

### 7.4 Annotation registry

```tsx
const annotations = {
  types: [taskAnnotation, citationAnnotation, urlResourceAnnotation, mentionAnnotation],
};

<HamCanvas
  rootSurfaceId={rootSurfaceId}
  surfaces={surfaces}
  branchEdges={edges}
  annotationRegistry={annotations}
  editorDefaults={{ annotationContext: { tasks, references, people } }}
  handlers={handlers}
/>;
```

### 7.5 Custom surface frame

```tsx
<HamCanvas
  {...props}
  slots={{
    SurfaceFrame({ item, children, mode }) {
      return (
        <section className={`my-surface my-surface-${mode}`}>
          <header>
            <span>{item.surface.title}</span>
            {item.incomingEdge && <small>branched from {item.anchorBlockId}</small>}
          </header>
          {children}
        </section>
      );
    },
  }}
/>
```

---

## 8. Operation semantics

### 8.1 Branch from block

Flow:

1. User hovers/focuses a branchable block.
2. Editor renders branch affordance.
3. User clicks branch.
4. Editor emits `onBranchRequest` with `sourceSurfaceId`, `sourceBlockId`, block snapshot, surface snapshot, and save callback.
5. Canvas opens branch dialog or immediately calls `handlers.createSurfaceFromBlock`.
6. Canvas/handler saves source surface first if needed.
7. Host creates target surface and branch edge.
8. Canvas activates target surface and scrolls it into view.

### 8.2 Add sibling branch

Flow:

1. User clicks “add sibling branch” under an existing child surface or source block.
2. Canvas determines the source block from the existing edge.
3. Canvas calls `handlers.createSiblingSurface` or `createSurfaceFromBlock` with `insertAfterEdgeId`.
4. Host creates another target surface with same `fromSurfaceId/fromBlockId`.
5. Canvas displays it adjacent to the existing sibling.

### 8.3 Reorder sibling surfaces

Allowed only for siblings sharing the same source block:

```text
same fromSurfaceId + same fromBlockId
```

Flow:

1. User drags one child surface above/below another child surface under the same anchor block.
2. Canvas computes new edge order.
3. Canvas calls `handlers.reorderBranchSiblings`.
4. Host persists order.
5. Canvas applies confirmed order.

No arbitrary reparenting in v1.

### 8.4 Delete surface

Default v1 policy: prevent deletion if surface has child surfaces.

Alternative host-enabled policy: delete subtree.

The canvas must include descendant IDs in the event payload so the host can validate and show confirmation.

### 8.5 Reparent block group

This is not core v1, but the architecture should leave room for it.

Correct ownership:

```text
Canvas may initiate the request.
Editor must execute the block-tree transaction.
Host persists the resulting editor content/snapshot.
Canvas recomputes projection from updated snapshots.
```

Do not implement block reparenting as direct canvas state mutation.

---

## 9. Keyboard and accessibility behavior

### 9.1 Keyboard navigation

Default shortcuts:

```text
Alt+ArrowRight   open first child branch from active block/surface
Alt+ArrowLeft    move to parent surface / source block
Alt+ArrowDown    next sibling surface or next block
Alt+ArrowUp      previous sibling surface or previous block
Mod+Enter        create branch from active block
Mod+Shift+Enter  create sibling branch from same source block
Esc              collapse popover / return focus to surface frame
```

All shortcuts should be configurable.

### 9.2 Accessibility

Requirements:

1. Branch buttons must be keyboard reachable.
2. Surface cards must have labels and roles.
3. Drag/reorder must have keyboard fallback.
4. Active path highlighting cannot rely on color alone.
5. Popovers must trap or manage focus appropriately.
6. Screen-reader text should distinguish “branch child,” “sibling branch,” and “parent surface.”

Use dnd-kit’s accessibility support for sortable interactions, but write package-level tests for keyboard reordering.

---

## 10. Styling and theming

HAM should ship default CSS with CSS variables, not Tailwind-specific classes.

```css
:root {
  --ham-bg: #ffffff;
  --ham-surface-bg: #ffffff;
  --ham-surface-border: #d8d8df;
  --ham-text: #16161a;
  --ham-muted: #6f6f7a;
  --ham-accent: #6f5cff;
  --ham-danger: #c73b3b;
  --ham-radius: 12px;
  --ham-column-gap: 24px;
  --ham-surface-gap: 16px;
}
```

Expose class names with a stable prefix:

```text
.ham-canvas
.ham-column
.ham-surface
.ham-surface-active
.ham-editor
.ham-block
.ham-block-active
.ham-block-ancestor
.ham-branch-button
.ham-branch-child-chip
.ham-annotation-chip
```

Applications can override styles without forking components.

---

## 11. Suggested implementation plan

### Phase 0 — Scaffold standalone repo

Deliverables:

- pnpm workspace.
- `@ham/editor` and `@ham/canvas` packages.
- Vite playground.
- Vitest setup.
- Shared fixture files.
- CSS build/export.
- CI: typecheck, lint, test, build.

Acceptance criteria:

- `pnpm build` emits installable package output.
- Playground imports packages as consumers, not via relative source paths.

### Phase 1 — Editor surface MVP

Deliverables:

- Tiptap editor with StarterKit, tasks, placeholder, official Markdown.
- Stable block ID extension.
- Nested block snapshot extraction.
- Branch gutter slot.
- Markdown import/export.
- JSON export.
- Basic annotation registry.

Tests:

- Assigns IDs to blocks.
- Does not duplicate IDs after split/paste.
- Emits nested snapshots for headings and lists.
- Branch request includes source block ID and surface snapshot.
- Markdown export/import round-trips basic content.

### Phase 2 — Canvas MVP

Deliverables:

- Surface/edge data model.
- Column projection supporting multiple surfaces per column.
- Active path computation.
- Default surface frame and editor rendering.
- Branch creation flow.
- Add sibling branch flow.
- Sibling reorder via dnd-kit.
- Auto-scroll active surface into view.

Tests:

- Two branches from two different blocks become two surfaces in next column.
- Two branches from same block are siblings and respect `order`.
- Active path marks ancestors and siblings correctly.
- Reorder event only allows same-anchor siblings.

### Phase 3 — Collaboration

Deliverables:

- Hocuspocus/Yjs client integration.
- Initial sync gating.
- Flush-on-unmount.
- Collaborative cursor/caret display.
- Local non-collab mode remains supported for playground/testing.

Tests:

- Two editor instances converge on same content.
- Block IDs remain unique after collaborative edits.
- Initial content is not duplicated by pre-sync seeding.

### Phase 4 — Interaction polish

Deliverables:

- Keyboard navigation.
- Collapse/expand surfaces.
- Collapse/expand blocks.
- Compact rail/outline display modes.
- Branch connector rendering.
- Annotation popovers.

Tests:

- Keyboard navigation moves across path/siblings.
- Collapsed columns preserve active path visibility.
- Popovers and branch buttons are keyboard accessible.

### Phase 5 — App integration adapter

Deliverables:

- Adapter layer in the host app mapping database documents/blocks/edges to HAM surfaces/edges.
- Migration away from app-local `LevelsLayout`/`OverviewCard` logic.
- Server routes accept block-only branch anchors.
- Remove span-anchor code from the branch path.

---

## 12. Migration notes for the current codebase

These notes are not part of HAM’s generic API, but they describe how the current implementation should evolve.

### 12.1 Keep the current stack direction

Keep:

- Tiptap/ProseMirror editor.
- Yjs/Hocuspocus collaboration.
- Block ID extension idea.
- Branch gutter idea.
- Entity/annotation plugin idea.
- Editor snapshot emitted to layout/persistence.
- Headless topology logic.

Change:

- Replace `tiptap-markdown` with `@tiptap/markdown` if the current Tiptap version supports it cleanly.
- Make block snapshots tree-shaped, not top-level-only.
- Move layout skins into the canvas package.
- Replace `DocNode.children` as the primary topology with `surfaces + branchEdges`.
- Drop text span branch APIs for v1.
- Make branch edge order per source block.

### 12.2 Collapse packages to two public packages

Current packages can map roughly as:

```text
@rlm/editor          -> @ham/editor
@rlm/markdown-engine -> internal modules in @ham/editor
@rlm/doc-grid        -> @ham/canvas
@rlm/doc-tree        -> internal topology modules in @ham/canvas
```

`@rlm/hsm-format` should stay separate. It is a domain-specific hierarchical-summary format, not generic HAM infrastructure.

### 12.3 Replace document tree with surface topology

Current shape:

```ts
interface DocNode {
  id: string;
  title: string;
  meta: unknown;
  children: DocNode[];
}
```

Recommended shape:

```ts
interface HamCanvasState {
  rootSurfaceId: string;
  surfaces: Record<string, HamSurface>;
  branchEdges: HamBranchEdge[];
}
```

This is necessary because a child is not merely a child of a document. It is a target surface reached through a specific source block.

### 12.4 Remove span anchors from v1 branch creation

Current branch logic supports text spans. For the standalone package, simplify to:

```ts
POST /branch
{
  "fromSurfaceId": "surface_1",
  "fromBlockId": "blk_abc",
  "title": "New branch"
}
```

The host app may still store legacy span data, but HAM v1 should not expose it.

### 12.5 Move app-specific entity implementations out

The generic package should expose annotation registry APIs. Concrete task/citation implementations can live in the app or in optional example modules.

Good generic package exports:

```text
AnnotationLayer
AnnotationRegistry
TaskList node support
Suggestion hooks
```

App-owned code:

```text
citation lookup against user's bibliography
project task records
reference import workflows
submission metadata
lab/project permissions
```

---

## 13. Test fixtures

Create JSON fixtures that drive both unit tests and playground stories.

### 13.1 Simple root

```json
{
  "rootSurfaceId": "s_root",
  "surfaces": {
    "s_root": {
      "id": "s_root",
      "rootBlockId": "blk_root",
      "title": "Project overview",
      "content": {
        "kind": "markdown",
        "markdown": "# Project overview\n\nBackground text.\n\n## Experiment plan\n\n- [ ] Run baseline"
      }
    }
  },
  "branchEdges": []
}
```

### 13.2 Multi-surface same-column

```json
{
  "rootSurfaceId": "s_root",
  "surfaces": {
    "s_root": {
      "id": "s_root",
      "rootBlockId": "blk_root",
      "title": "Root",
      "content": { "kind": "markdown", "markdown": "# Root\n\n## A\n\n## B" }
    },
    "s_a": {
      "id": "s_a",
      "rootBlockId": "blk_a_root",
      "title": "Branch from A",
      "content": { "kind": "markdown", "markdown": "# Branch from A" }
    },
    "s_b": {
      "id": "s_b",
      "rootBlockId": "blk_b_root",
      "title": "Branch from B",
      "content": { "kind": "markdown", "markdown": "# Branch from B" }
    }
  },
  "branchEdges": [
    {
      "id": "e_a",
      "fromSurfaceId": "s_root",
      "fromBlockId": "blk_A",
      "toSurfaceId": "s_a",
      "order": 0
    },
    {
      "id": "e_b",
      "fromSurfaceId": "s_root",
      "fromBlockId": "blk_B",
      "toSurfaceId": "s_b",
      "order": 0
    }
  ]
}
```

### 13.3 Same-block siblings

```json
{
  "branchEdges": [
    {
      "id": "e_1",
      "fromSurfaceId": "s_root",
      "fromBlockId": "blk_A",
      "toSurfaceId": "s_a1",
      "order": 0
    },
    {
      "id": "e_2",
      "fromSurfaceId": "s_root",
      "fromBlockId": "blk_A",
      "toSurfaceId": "s_a2",
      "order": 1
    }
  ]
}
```

---

## 14. Acceptance criteria for v1

HAM v1 is ready to fold back into the larger app when all of the following are true:

1. A Vite playground can create, edit, branch, reorder, collapse, and delete surfaces without the larger app.
2. A column can display multiple surfaces produced by branching from different blocks in the previous column.
3. Branch children from the same source block are rendered as siblings and can be reordered.
4. The editor emits stable nested block snapshots.
5. Branch anchors are block-only and survive editing, saving, reload, and collaboration.
6. Markdown import/export works for the supported syntax set.
7. Annotation registry supports at least tasks, citations/mentions, and URLs in examples.
8. Collaborative editing does not duplicate initial content and does not duplicate block IDs.
9. The package builds to JS and `.d.ts` files and can be consumed as an installed dependency.
10. App integration requires only data mapping and handlers, not forking package internals.

---

## 15. Open design decisions

### 15.1 Is Tiptap JSON or markdown canonical?

Recommendation: **Tiptap JSON is canonical for the editor; markdown is canonical for export/interchange.**

Reason: block IDs and rich node attributes live naturally in Tiptap/ProseMirror JSON. Markdown is valuable, but not lossless for every editor feature.

### 15.2 Are heading-contained blocks physical or projected?

Recommendation: **projected containment.**

Reason: Markdown headings are normally siblings, not containers. The editor can expose a heading-based outline tree without requiring an unnatural ProseMirror schema.

### 15.3 Should annotations be markdown-derived or editor-derived?

Recommendation: **editor-derived during editing; markdown-derived during import/export or server reconciliation if needed.**

Reason: the live editor already has the content tree and positions. Avoid serializing to markdown on every decoration refresh.

### 15.4 Should canvas depend on editor?

Recommendation: **yes, as a peer dependency and default renderer, but with render slots.**

The canvas should import editor types and provide first-class integration. It does not need to be editor-engine agnostic.

### 15.5 Should collaboration be in a third package?

Recommendation: **no for v1.**

Put Hocuspocus client integration in `@ham/editor`. The server remains app-owned. Split a server package only if multiple apps need the same Hocuspocus server/auth/persistence implementation.

---

## 16. References and rationale sources

- Tiptap is a headless, ProseMirror-based editor framework with extension-based customization: https://tiptap.dev/docs/editor/getting-started/overview
- ProseMirror schemas define valid document structures and are the underlying model Tiptap builds on: https://prosemirror.net/examples/schema/
- Tiptap’s official Markdown extension provides bidirectional Markdown parsing/serialization and custom Markdown extension hooks: https://tiptap.dev/docs/editor/markdown
- Tiptap’s official Markdown package is installed as `@tiptap/markdown`: https://tiptap.dev/docs/editor/markdown/getting-started/installation
- The older `tiptap-markdown` repository now recommends using Tiptap’s official Markdown extension: https://github.com/aguingand/tiptap-markdown
- Yjs documents describe shared types that can be synchronized by providers: https://docs.yjs.dev/getting-started/working-with-shared-types
- Hocuspocus is a Yjs-based collaboration backend/provider stack: https://tiptap.dev/docs/hocuspocus/getting-started/overview
- dnd-kit is an extensible TypeScript drag/drop toolkit with React support and sortable/reorder primitives: https://dndkit.com/
- Floating UI supports anchored popovers/tooltips/dropdowns with collision-aware positioning: https://floating-ui.com/
- TanStack Virtual supports virtualizing large scrollable content in React and other runtimes: https://tanstack.com/virtual/latest
- Tiptap’s Mathematics extension uses KaTeX to render LaTeX formulas: https://tiptap.dev/docs/editor/extensions/nodes/mathematics
- Tiptap’s TableKit/Table extensions support table editing: https://tiptap.dev/docs/editor/extensions/functionality/table-kit
