---
"@hiermark/editor": minor
"@hiermark/canvas": minor
---

Pre-publish hardening for downstream consumers.

**@hiermark/editor**

- **`@tiptap/pm` and `yjs` are now `peerDependencies`** (were regular deps). Both
  must be single instances in a host app — duplicate ProseMirror breaks `instanceof`
  checks and duplicate Yjs breaks the CRDT (the editor accepts a host-supplied
  `Y.Doc`). Modern package managers (`pnpm`, `npm 7+`) auto-install peers; older
  setups must add `@tiptap/pm` and `yjs`.
- Removed `y-prosemirror` from dependencies (it was never imported; supplied transitively).
- Fixed a memory leak: an editor-created `Y.Doc` is now destroyed on unmount (a
  host-supplied doc is left untouched).
- Fixed a teardown race in `flushAndDestroy` that could falsely report unflushed
  changes and stall unmount by 3s.
- `HIERMARK_EDITOR_VERSION` is now injected from `package.json` at build time
  (previously a hardcoded, stale string).
- `scrollBlockIntoView` now `CSS.escape`s the block id (custom/imported ids with
  special chars no longer throw).
- Re-export the Tiptap `Editor` type (used by the SuggestPopover slot prop).
- Added `LICENSE` and `engines.node` to the published package.

**@hiermark/canvas**

- Re-export `HiermarkEditorProps` and `HiermarkAnnotationRegistry` so the canvas
  public API (its `editorDefaults` / `annotationRegistry` props) is self-contained.
- Tightened the `@hiermark/editor` peer range to `^0.3.0`.
- `HIERMARK_CANVAS_VERSION` is now injected from `package.json` at build time.
- Added `LICENSE` and `engines.node` to the published package.
