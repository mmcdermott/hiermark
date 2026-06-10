---
"@ham/canvas": minor
---

Canvas-level undo/redo for sibling reorders. After a drag-reorder, Cmd/Ctrl+Z
reverts it (Cmd/Ctrl+Shift+Z or Ctrl+Y redoes) when the canvas chrome is
focused — re-applying the captured order through the existing reorder handler,
no host "restore" capability needed. Exposes the pure `siblingEdgeOrder` helper.
