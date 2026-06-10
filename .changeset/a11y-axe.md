---
"@ham/editor": minor
"@ham/canvas": minor
---

Automated accessibility (axe) tests, plus the real fixes they surfaced: the
editor's editable region now has an accessible name (`aria-label`, configurable
via the new `ariaLabel` prop, + `aria-multiline`); canvas surfaces use a
`treeitem` `<div>` (not `<section>`) and a plain `<div>` card header (not a
`<header>` landmark); and `role="tree"` owns only its columns (status/empty
regions are siblings; decorative connectors + the detached divider are
`aria-hidden`).
