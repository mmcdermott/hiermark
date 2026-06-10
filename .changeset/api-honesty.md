---
"@ham/editor": minor
"@ham/canvas": minor
---

API honesty: every declared prop now does what it says, and dead surface is
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
