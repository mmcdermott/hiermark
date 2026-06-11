---
"@hiermark/editor": minor
"@hiermark/canvas": minor
---

API honesty: every declared prop now does what it says, and dead surface is
gone (breaking for code that referenced it).

`@hiermark/editor`:

- `autofocus` implements its full contract — `"start"` / `"end"` map to
  Tiptap, and a block id places the caret inside that block after mount
  (unknown ids fail gracefully). Previously every non-boolean coerced to
  `false`.
- `highlightedBlockIds` is implemented: listed blocks get the
  `hiermark-block-highlighted` class (themable via `--hiermark-highlight-bg`), updating
  in place on prop change.
- `HiermarkCollaborationConfig` is now a discriminated union: pass
  `provider: "hocuspocus"` + `url`, or a custom `runtime` — no more fake
  transport fields to satisfy the type. (`createHocuspocusCollab` now takes
  `HiermarkCollaborationHocuspocusConfig`.)
- Removed (never implemented): `onBlockEvents` + `HiermarkBlockEvent` types, the
  `EmptyState` / `BlockGutter` editor slots, `HiermarkBranchRequestEvent.nativeEvent`,
  and `HiermarkEditorSavePayload.revision`.

`@hiermark/canvas`:

- `handlers.createSurfaceFromBlock` is optional: a read-only / preview canvas
  mounts with no dummy handler; missing-handler branch requests dev-warn, and
  affordances are hidden unless the handler exists.
- `editorDefaults` is now the curated `HiermarkCanvasEditorDefaults` (canvas-owned
  props like `value` / `onChange` / `onReady` are rejected at the type level
  instead of being silently overridden).
- `HiermarkCanvasHandle.focusBlock` actually moves the caret into the requested
  block (parking the focus until the surface's editor mounts, if needed).
- Removed (never implemented): `behavior.pendingOperationMode` and
  `HiermarkCreateSurfaceFromBlockEvent.insertAfterEdgeId`.
