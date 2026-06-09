---
"@ham/editor": minor
---

Add an image alt-text / title editor. Clicking any image opens a popover
(`ImageEditor` extension + `ImagePopover`) to edit its alt text
(accessibility-critical) and title, written back to the node attrs and to
`![alt](src "title")` markdown. Wired by default in `HamEditor`.
