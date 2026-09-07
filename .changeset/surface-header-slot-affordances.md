---
"@hiermark/canvas": minor
---

`SurfaceHeader` slot: hosts keep collapse, reorder and the saving indicator.

A host that supplied its own `slots.SurfaceHeader` silently lost sibling
drag-reorder (the only dnd-kit activator lived in the default header), the
collapse toggle and the pending spinner. `HiermarkSurfaceHeaderProps` now
carries `collapsed` + `onToggleCollapsed`, `pending`, and `dragHandleProps`
(spread onto whatever element should act as the drag handle; absent when the
surface isn't sortable), so a custom header can render the same affordances
next to its own controls.
