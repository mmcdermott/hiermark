# @ham/editor

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

- b82be24: URI sanitizer hardening: the link/image policy is now a normalization-first
  ALLOWLIST instead of a scheme denylist. Hrefs allow http/https/mailto plus
  relative URLs; image srcs (not a navigation context) block the script-capable
  set — javascript:/vbscript:/file: and non-image `data:` payloads — while
  custom inert schemes (e.g. an upload handler's `stored://`) stay allowed. URLs are normalized the way browsers do (tab/CR/LF stripped
  anywhere, control chars trimmed) before scheme detection, closing the
  `java\tscript:` obfuscation bypass for content that arrives without
  browser-side validation (tiptap-json seeds, collab updates). New
  `isAllowedLinkHref` prop (symmetric to `isAllowedImageSrc`) lets hosts widen
  or tighten the policy, and the link popover's "Open" affordance respects it.
- 8bdd71b: Source mode is no longer an invisible draft buffer. While the raw-markdown
  textarea is active: typing emits `onChange` with `{ kind: "markdown" }`
  content, and every handle read (`save()`, `getMarkdown()`, `getJSON()`,
  `getSnapshot()`, and a branch event's `save`) first commits the edited source
  into the editor — preserving block ids — so the text the user sees is always
  the text that saves. Previously, source-mode edits were silently dropped if
  the surface saved or unmounted (e.g. canvas autosave/flush) before switching
  back to rich mode.

### Patch Changes

- 1d402ea: Block ids now stay anchored to the block they identified when duplicates or
  splits occur. Previously: a copy of a block pasted ABOVE its original silently
  stole the original's id (re-anchoring host-persisted branch edges and
  annotations onto the copy), and pressing Enter at the START of a block or list
  item left the id on the new empty block above instead of the one carrying the
  content. Duplicate ids now resolve to the occurrence matching the
  pre-transaction holder's content (tie-broken by mapped position), and
  split-at-start swaps the id onto the content-bearing half.
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

- baca4be: Compatibility: React 18.3+ is now an accepted peer (`^18.3.0 || ^19`) — the
  packages use no React-19-only APIs, and a dedicated CI leg builds and runs the
  full suite with React 18 installed. The published manifests no longer pin
  `engines.node` (the repo root keeps it for contributor tooling).
- 826ef1c: Editor correctness batch: the bubble toolbar's text-selection check no longer
  relies on `constructor.name` (minifiers rename classes, which silently
  disabled the toolbar in every production bundle — now `isTextSelection`);
  math/link/image popovers close on any document change so a concurrent edit
  (remote collab, upload resolving, host `setContent`) can't make them commit at
  stale positions; the snapshot cache is evicted when
  surfaceId/rootBlockId/title change; a `revision` swap while source mode is
  open resyncs the textarea (previously the stale text silently overwrote the
  new revision on save); and an already-synced collaboration provider no longer
  schedules the initial-sync timeout (which delivered a spurious "timedout"
  status after "synced").
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

## 0.2.0

### Minor Changes

- d237582: Automated accessibility (axe) tests, plus the real fixes they surfaced: the
  editor's editable region now has an accessible name (`aria-label`, configurable
  via the new `ariaLabel` prop, + `aria-multiline`); canvas surfaces use a
  `treeitem` `<div>` (not `<section>`) and a plain `<div>` card header (not a
  `<header>` landmark); and `role="tree"` owns only its columns (status/empty
  regions are siblings; decorative connectors + the detached divider are
  `aria-hidden`).
- 195f854: Add a selection bubble toolbar (`BubbleToolbar`): a floating bold / italic /
  strikethrough / inline-code toolbar over a non-empty text selection. On by
  default; opt out per editor with `bubbleMenu={false}`. Hidden in code blocks,
  source mode, and when the editor is not editable.
- f9b27db: Enable image resize handles. A selected image can be drag-resized; width/height
  persist as schema attrs (kept in JSON / collaboration; markdown export stays
  size-agnostic). The node view keeps a real `<img>`, so click-to-edit alt and
  the block gutter still resolve the image.
- d76bcf7: Add an image alt-text / title editor. Clicking any image opens a popover
  (`ImageEditor` extension + `ImagePopover`) to edit its alt text
  (accessibility-critical) and title, written back to the node attrs and to
  `![alt](src "title")` markdown. Wired by default in `HamEditor`.
- 6f24247: Toward v1.0: editor gains click-to-edit math, inline link editing, code-block
  soft-wrap, IME guards, an XSS sanitizer, source-mode id preservation, and
  collaboration retry/status callbacks; canvas gains a bubble-up branch policy,
  compact-card sizing, two-way hover connectors, scroll-to-reveal, SurfaceBody /
  EmptyCanvas slots, reduced-motion, and ARIA tree semantics. Both packages now
  ship dual ESM + CJS builds with `publishConfig`/provenance.
- b96afc4: Add a pure `@ham/editor/markdown` subpath export for server-side consumers
  (issue #50). The markdown grammar helpers — `stripStableIds`, `readStableId`,
  `injectInlineId`, `inferContainmentFromMarkdown`, `parseChecklist`,
  `extractCitationKeys`, `extractResourceLinks`, `fnv1a64Hex`, and friends — are
  import-pure (no React, Tiptap, or DOM), so a host app's save-time reconciler,
  collab worker, or git-sync CLI can now `import { parseChecklist } from
"@ham/editor/markdown"` without dragging the browser editor into its module
  graph. The package root (`@ham/editor`) re-exports the same module, so the
  client editor and the server share one grammar implementation — avoiding the
  definition drift that would otherwise be a silent data-loss bug. No runtime or
  API change to existing root-barrel imports.

### Patch Changes

- 357328b: Packaging fixes: `@ham/editor`'s exports map no longer carries redundant
  top-level `types` keys that resolved ESM-flavored declarations under the
  `require` condition (CJS TypeScript consumers now get `index.d.cts`), and
  `@ham/canvas` declares its `@ham/editor` peer as an explicit `>=0.1.0 <1.0.0`
  range instead of `workspace:^` (which made changesets major-bump the canvas on
  every editor minor).
