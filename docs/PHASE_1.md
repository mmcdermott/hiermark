# Phase 1 — @ham/editor surface MVP

> **Goal (design spec §11):** a Tiptap editor with StarterKit, tasks, placeholder
> and official Markdown; a stable block-id extension; nested block-snapshot
> extraction; a branch gutter; markdown + JSON import/export; a basic annotation
> registry.

## What was built

**Editor engine** — `createHamEditorExtensions()` assembles StarterKit, TaskList/
TaskItem, Placeholder, the official `@tiptap/markdown` (so `editor.getMarkdown()`
and markdown content load losslessly), KaTeX math, and the HAM block-id
extension. `undoRedo` is disabled when collaboration is on (Phase 3).

**Stable block identity** — `BlockId` assigns a `blk_<nanoid>` `dataBlockId` to
every structural block (headings, paragraphs, blockquotes, code, **list and task
items** — generalized from the reference's top-level-only version). `keepOnSplit:
false` gives split fragments fresh ids; an `appendTransaction` pass (and an
`onCreate` pass for the initial content) repairs missing/duplicate ids on every
doc change. Ids are immutable and never remapped.

**Tree-shaped snapshots** — `getHamSurfaceSnapshot(editor, …)` walks the live
ProseMirror tree (never markdown) into a `HamSurfaceSnapshot` with `parentId`/
`childIds`/`order`/`depth` and a preorder `blockOrder`. Containment combines
**literal** list/task nesting with **projected** heading containment (the
reference's `inferBlockContainment` algorithm). The core, `projectBlockTree`, is
a pure function over block metas — exhaustively unit-tested without a DOM.

**Branch gutter** — `BlockGutter` renders a branch button on each branchable
block and chips for existing branch children, as ProseMirror decorations fed by
a `getContext` getter. `HamEditor` turns a click into an `onBranchRequest` event
that captures the surface snapshot **synchronously** (spec §5.7) and carries a
`save()` callback.

**Markdown helpers** (import/export & server-reconciliation path) — FNV-1a
hashing, the `ham:` stable-id comment grammar, heading containment, fenced-code-
aware checklist parsing with content keys, and citation/URL extraction.

**Annotation registry** — a thin two-axis (recognizer × placement) registry with
a deterministic conflict resolver (priority → range → type), block-anchored
identity, and a decoration plugin that renders inline highlights and block chips.
Bundled example recognizers: tasks, citations (`@key`), mentions, and URLs — the
mention/citation pair demonstrates conflict resolution (a known `@person` wins
over a citation for the same span).

**`HamEditor` component** — local (non-collab) editor wiring all of the above,
emitting `onChange`/`onSnapshotChange`/`onBranchRequest`/`onActiveBlockChange`
and publishing a typed `HamEditorHandle` (focus/scroll/snapshot/markdown/json/
save + a `getUnsafeTiptapEditor` escape hatch).

## Tests (46, jsdom + pure)

- block-id assignment + uniqueness on load; **duplicate-id repair after paste**.
- heading containment, list nesting, ordering, preorder, before-first-heading →
  root, dangling-parent fallback (pure `projectBlockTree`).
- markdown extractors: hashing, stable-id strip/read/inject (id never changes a
  hash), fenced-code checklist, citation/URL extraction.
- `HamEditor`: tree snapshot from a real editor, markdown round-trip, branch
  request payload, `save()` payload.
- annotations: conflict resolution (overlap, opaque-block), example registry
  recognition, and live inline/chip decorations rendered in the DOM.

## Go/no-go gate — all green

```text
pnpm build        ✓  @ham/editor → dist (44 exports) + styles.css
pnpm typecheck    ✓
pnpm lint         ✓
pnpm test         ✓  editor 46, canvas 1
pnpm format:check ✓
```

## Deferred (with rationale)

- **Collaboration** (Phase 3) — `HamEditor` is structured so the collab mount/
  seed/flush gating slots in around the same `useEditor`.
- **Block fold / collapse, annotation popovers, React slot overrides** (Phase 4)
  — the handle's `collapseBlock`/`expandBlock` are stubs; the gutter and
  annotation chips render via DOM decorations today and gain Floating-UI popovers
  and slot overrides in Phase 4.
- **Precise inline-offset mapping inside deeply-nested list items** — current
  mapping is exact for paragraphs/headings/items; refined in Phase 4 if needed.

## TODO(next)

- Phase 2: `@ham/canvas` — surface/edge model, `projectHamColumns`,
  `getHamActivePath`, branch/sibling flows, dnd reorder.
