---
"@hiermark/editor": patch
---

The annotation type-ahead (`@`-search) opens only when the user types into the
token. It used to open whenever the caret sat right after a trigger match, so a
click on an existing citation pill, an arrow-key move, a remote peer's edit, a
`setContent`, or the initial collaboration sync (which parks the caret at the
end of a document that ends in `@key`) all popped the search unbidden. Once
open it still follows the caret within the token; it now also closes on blur.
