# @ham/canvas

## 0.3.0

### Minor Changes

- 0b7ea74: API honesty: every declared prop now does what it says, and dead surface is
  gone (breaking for code that referenced it).

  `@ham/editor`:
  - `autofocus` implements its full contract — `"start"` / `"end"` map to
    Tiptap, and a block id places the caret inside that block after mount
    (unknown ids fail gracefully). Previously every non-boolean coerced to
    `false`.
  - `highlightedBlockIds` is implemented: listed blocks get the
    `ham-block-highlighted` class (themable via `--ham-highlight-bg`), updating
    in place on prop change.
  - `HamCollaborationConfig` is now a discriminated union: pass
    `provider: "hocuspocus"` + `url`, or a custom `runtime` — no more fake
    transport fields to satisfy the type. (`createHocuspocusCollab` now takes
    `HamCollaborationHocuspocusConfig`.)
  - Removed (never implemented): `onBlockEvents` + `HamBlockEvent` types, the
    `EmptyState` / `BlockGutter` editor slots, `HamBranchRequestEvent.nativeEvent`,
    and `HamEditorSavePayload.revision`.

  `@ham/canvas`:
  - `handlers.createSurfaceFromBlock` is optional: a read-only / preview canvas
    mounts with no dummy handler; missing-handler branch requests dev-warn, and
    affordances are hidden unless the handler exists.
  - `editorDefaults` is now the curated `HamCanvasEditorDefaults` (canvas-owned
    props like `value` / `onChange` / `onReady` are rejected at the type level
    instead of being silently overridden).
  - `HamCanvasHandle.focusBlock` actually moves the caret into the requested
    block (parking the focus until the surface's editor mounts, if needed).
  - Removed (never implemented): `behavior.pendingOperationMode` and
    `HamCreateSurfaceFromBlockEvent.insertAfterEdgeId`.

- a2ecb19: Canvas correctness batch — autosave can no longer lose edits, and behavior
  flags are enforced at the action layer:
  - **Autosave**: deactivating a surface (expanded → card) now flushes the
    pending debounce while the editor handle is still valid and drops the
    handle, fixing the deterministic edit-loss on quick deactivate/reactivate;
    an unmount during an in-flight save captures the latest payload and sends it
    as one trailing write (previously the final edits were silently dropped);
    and unmounting an untouched surface no longer fires a spurious save (the
    editor's initial block-id stamp and mount-time `setEditable` no longer emit
    `onChange`).
  - `enableSiblingBranchCreation: false` is now enforced in `addSibling` and the
    gutter add-sibling path (blocked attempts report through `onOperationError`).
  - `updateSurfaceSnapshot` rejections route to `onOperationError` (new
    `"update-snapshot"` operation type) instead of an unhandled rejection.
  - Pending operations are counted per surface, so overlapping ops can't clear
    the pending indicator early.
  - `addSibling` append uses the group's max order + 1 (orders are sparse after
    deletes; appending at `group.length` landed mid-group).
  - `reorderSiblings` resolves `true`/`false` for success/failure, and the
    reorder undo/redo stacks only commit their bookkeeping on success — a
    rejected handler no longer desynchronizes undo history.
  - `validateHamTopology` reports a new `duplicate-sibling-order` issue;
    add-sibling inserters are keyed by visual gap (duplicate orders no longer
    drop an inserter); `revealBranchFromBlock`'s parameter is typed
    `HamBlockId`.
  - The active block id is passed only to the active surface's editor (block
    ids are surface-scoped; a colliding id in another expanded surface no longer
    lights up as active).

- 9cb4527: Performance + keyboard-UX batch:
  - Branch-child summaries are computed in one pass per edge-set change and
    passed with stable identity, instead of a per-rendered-surface scan of every
    edge on every render — which also forced a gutter-decoration rebuild in
    every mounted editor whenever the canvas re-rendered (e.g. on hover). Chips
    now render sorted by edge order.
  - The connector overlay's ResizeObserver re-subscribes only when the anchor
    set changes (hover/active-path churn used to re-observe every anchor on each
    cursor move), and edges to display:none anchors (0×0 rects) are skipped
    instead of smearing degenerate beziers across the canvas.
  - Focus management: explicit activation affordances (Open, preview, outline)
    hand DOM focus into the activated surface's editor once it mounts; Alt+Arrow
    navigation focuses the activated treeitem (roving tabindex), and Enter on a
    focused treeitem enters its editor — keyboard "navigation" previously
    restyled the canvas while focus stayed stranded on <body>.
  - Editor popovers (math/link/image) restore focus to the editor when dismissed
    with Escape, and popover/bubble-toolbar surfaces use theme tokens instead of
    hardcoded white (they were white-on-dark in the shipped dark theme).

### Patch Changes

- baca4be: Compatibility: React 18.3+ is now an accepted peer (`^18.3.0 || ^19`) — the
  packages use no React-19-only APIs, and a dedicated CI leg builds and runs the
  full suite with React 18 installed. The published manifests no longer pin
  `engines.node` (the repo root keeps it for contributor tooling).

## 0.2.0

### Minor Changes

- d237582: Automated accessibility (axe) tests, plus the real fixes they surfaced: the
  editor's editable region now has an accessible name (`aria-label`, configurable
  via the new `ariaLabel` prop, + `aria-multiline`); canvas surfaces use a
  `treeitem` `<div>` (not `<section>`) and a plain `<div>` card header (not a
  `<header>` landmark); and `role="tree"` owns only its columns (status/empty
  regions are siblings; decorative connectors + the detached divider are
  `aria-hidden`).
- 3a3a504: Keyboard navigation: Alt+Right now follows the active block's first outgoing
  edge (instead of the active surface's first child, which could jump to an
  unrelated sibling group), and Alt+C toggles collapse of the active surface.
- c125dee: Surfaces now expose `aria-busy` and a visible header spinner while an async
  operation (save/branch/reorder/delete) is in flight, rather than only dimming.
- 683f977: Render orphan / detached surfaces. Surfaces with no edge path from the root
  were silently invisible; they now project into trailing `detached` columns
  (new optional `detached` flag on `HamCanvasColumn`) behind a "Not linked to
  root" divider, so data is never lost from view.
- 656cb8d: Canvas-level undo/redo for sibling reorders. After a drag-reorder, Cmd/Ctrl+Z
  reverts it (Cmd/Ctrl+Shift+Z or Ctrl+Y redoes) when the canvas chrome is
  focused — re-applying the captured order through the existing reorder handler,
  no host "restore" capability needed. Exposes the pure `siblingEdgeOrder` helper.
- 6f24247: Toward v1.0: editor gains click-to-edit math, inline link editing, code-block
  soft-wrap, IME guards, an XSS sanitizer, source-mode id preservation, and
  collaboration retry/status callbacks; canvas gains a bubble-up branch policy,
  compact-card sizing, two-way hover connectors, scroll-to-reveal, SurfaceBody /
  EmptyCanvas slots, reduced-motion, and ARIA tree semantics. Both packages now
  ship dual ESM + CJS builds with `publishConfig`/provenance.

### Patch Changes

- 357328b: Packaging fixes: `@ham/editor`'s exports map no longer carries redundant
  top-level `types` keys that resolved ESM-flavored declarations under the
  `require` condition (CJS TypeScript consumers now get `index.d.cts`), and
  `@ham/canvas` declares its `@ham/editor` peer as an explicit `>=0.1.0 <1.0.0`
  range instead of `workspace:^` (which made changesets major-bump the canvas on
  every editor minor).
