---
"@ham/canvas": minor
---

Render orphan / detached surfaces. Surfaces with no edge path from the root
were silently invisible; they now project into trailing `detached` columns
(new optional `detached` flag on `HamCanvasColumn`) behind a "Not linked to
root" divider, so data is never lost from view.
