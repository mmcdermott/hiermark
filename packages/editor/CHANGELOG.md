# @ham/editor

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
