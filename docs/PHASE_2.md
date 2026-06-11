# Phase 2 — @hiermark/canvas MVP

> **Goal (design spec §11):** the surface/edge data model; column projection
> supporting multiple surfaces per column; active-path computation; default
> surface frame and editor rendering; branch creation, add-sibling, and dnd-kit
> sibling reorder; auto-scroll the active surface.

## What was built

**Pure topology core** (no React/IO, exhaustively unit-tested):

- `buildIndices` — recovers adjacency (`childEdgesBySurface`,
  `incomingEdgeByToSurface`) from the flat edge list; `collectDescendants` BFS.
- `projectHiermarkColumns` — the central BFS (spec §6.10): depth-banded columns where
  a column holds surfaces branched from different blocks of different parents,
  ordered by **source-block preorder rank → fromBlockId → edge.order**, with a
  `visited` guard and stale-anchor tolerance (missing blocks sort last).
- `getHiermarkActivePath` — root→active lineage via an upward edge walk with a cycle
  guard and orphan clamp.
- `computePathState` / `pickDisplayMode` — active / ancestor / descendant /
  sibling (strict: same parent surface **and** anchor block) / unrelated, mapped
  to expanded / card / outline / rail / hidden; the active path stays visible
  even when its columns are compacted.
- `reorderSiblingEdges*` — same-anchor-only reorder with the reference's
  splice/clamp/no-op-returns-same-reference semantics and dense `order`
  renormalization; `areSameAnchorSiblings` guards cross-anchor drops.

**Headless `useHiermarkCanvas`** — owns the active selection, the per-surface snapshot
cache (drives child-column ordering), collapse state, and **pessimistic**
topology operations (branch / add-sibling / reorder / delete) through the host
`HiermarkCanvasHandlers`; memoizes the projection and active path.

**`HiermarkCanvas` component** — renders depth columns; the active surface mounts a
full `HiermarkEditor`, others render compact previews. Branch buttons flow to
`createSurfaceFromBlock`; same-anchor siblings reorder via dnd-kit (pointer +
keyboard sensors, sortable contexts scoped per anchor group so cross-group drops
are impossible); add-sibling / delete buttons; debounced save through
`saveSurface`; auto-scroll the active surface into view.

## Tests (19)

- **two blocks → two surfaces in the next column** (spec §7.2);
- **same-block siblings respect `order`**, before a later block's branch;
- reorder reflected in projection; **active/ancestor/sibling/unrelated** marking;
  descendant marking; stale-anchor sorts last;
- active path walk + orphan clamp + cycle guard; descendant collection;
- **reorder only allows same-anchor siblings** (cross-anchor is a no-op);
  splice/clamp/no-op-same-reference semantics;
- `HiermarkCanvas`: editor mounts at root, two-block→two-item column, branch button
  fires `createSurfaceFromBlock` with the right source, preview-open activates.

## Go/no-go gate — all green

```text
pnpm build        ✓  @hiermark/canvas → dist + styles.css
pnpm typecheck    ✓  editor, canvas, docs
pnpm lint         ✓
pnpm test         ✓  editor 51, canvas 19
pnpm format:check ✓
```

## Deferred (with rationale)

- **Snapshots for non-mounted (card) surfaces** — child columns of the _active_
  surface order correctly (its editor provides a snapshot); ancestor columns fall
  back to a deterministic id/order sort. Computing snapshots for cards (without
  mounting an editor) is a Phase 4 optimization.
- **Branch connector SVG lines, rail/outline compact rendering, keyboard
  navigation across surfaces** — Phase 4 interaction polish.
- **Collaboration** — Phase 3.

## TODO(next)

- Phase 3: Yjs/Hocuspocus collaboration in `@hiermark/editor` (mount→sync→seed→flush
  gating, collaborative carets), local mode preserved.
