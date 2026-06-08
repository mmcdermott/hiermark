# Phase 7 — Column modes, expandable demos, and the real task-CSS fix

> Three follow-up UX issues from the user.

## What was fixed

**1. Task checkboxes were STILL on a separate line.**
Root cause: Tiptap renders `<ul data-type="taskList"><li data-checked="…">` —
the `<li>` has **no** `data-type="taskItem"`. Phase 6 (following a review
suggestion) targeted `li[data-type="taskItem"]`, which matches nothing, so the
flex layout never applied. Now the selectors target
`ul[data-type="taskList"] > li > {label,div}` (the actual DOM). A new test loads
the real stylesheet into jsdom and asserts `getComputedStyle(li).display ===
"flex"`, so this can't silently regress again.

**2. A mode where columns don't all collapse when you branch.**
Added `inactiveColumnMode: "expanded"` to the canvas layout config. With it,
every surface stays a full editor (nothing compacts to a card when you add a
column) — ideal on a wide screen. `pickDisplayMode` already routed inactive
surfaces through `inactiveColumnMode`, so the new value flows straight through.
The canvas and paper demos expose it via a **"Keep columns expanded"** toggle.

**3. Make the example boxes expandable for a big monitor.**
`DemoFrame` gained an **⛶ Expand** button that lifts the demo into an
(almost) full-viewport overlay (Escape or the backdrop closes it), so the
horizontally-scrolling canvas can use the whole screen. Demo stages are also
vertically `resize`-able.

## Tests (+2; 100 total)

- task-list CSS: the real stylesheet makes a task `<li>` a flex row (computed
  style), with label + content children;
- `pickDisplayMode` returns `"expanded"` for every inactive surface when
  `inactiveColumnMode: "expanded"`.

## Gate — all green

```text
build · typecheck · lint · test · format · docs build
editor 68 · canvas 27 · docs 5
```
