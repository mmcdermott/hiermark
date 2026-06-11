---
"@hiermark/canvas": minor
"@hiermark/editor": patch
---

Canvas correctness batch — autosave can no longer lose edits, and behavior
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
- `validateHiermarkTopology` reports a new `duplicate-sibling-order` issue;
  add-sibling inserters are keyed by visual gap (duplicate orders no longer
  drop an inserter); `revealBranchFromBlock`'s parameter is typed
  `HiermarkBlockId`.
- The active block id is passed only to the active surface's editor (block
  ids are surface-scoped; a colliding id in another expanded surface no longer
  lights up as active).
