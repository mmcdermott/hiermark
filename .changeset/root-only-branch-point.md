---
"@hiermark/editor": patch
---

`branchPolicy: "root-only"` now puts its one affordance on the document root —
`+` while the surface has no children, `⊕` (add a sibling) after — instead of
showing nothing until a child already existed. The document-level button is
labelled for the document ("Branch this document…") and rests visible rather
than at the per-block ghost opacity.
