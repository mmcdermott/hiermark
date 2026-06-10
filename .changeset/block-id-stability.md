---
"@ham/editor": patch
---

Block ids now stay anchored to the block they identified when duplicates or
splits occur. Previously: a copy of a block pasted ABOVE its original silently
stole the original's id (re-anchoring host-persisted branch edges and
annotations onto the copy), and pressing Enter at the START of a block or list
item left the id on the new empty block above instead of the one carrying the
content. Duplicate ids now resolve to the occurrence matching the
pre-transaction holder's content (tie-broken by mapped position), and
split-at-start swaps the id onto the content-bearing half.
