# @ham/canvas

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
