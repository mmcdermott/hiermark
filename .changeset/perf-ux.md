---
"@ham/canvas": minor
"@ham/editor": patch
---

Performance + keyboard-UX batch:

- Branch-child summaries are computed in one pass per edge-set change and
  passed with stable identity, instead of a per-rendered-surface scan of every
  edge on every render — which also forced a gutter-decoration rebuild in
  every mounted editor whenever the canvas re-rendered (e.g. on hover). Chips
  now render sorted by edge order.
- The connector overlay's ResizeObserver re-subscribes only when the anchor
  set changes (hover/active-path churn used to re-observe every anchor on each
  cursor move), and edges to display:none anchors (0×0 rects) are skipped
  instead of smearing degenerate beziers across the canvas.
- Focus management: explicit activation affordances (Open, preview, outline)
  hand DOM focus into the activated surface's editor once it mounts; Alt+Arrow
  navigation focuses the activated treeitem (roving tabindex), and Enter on a
  focused treeitem enters its editor — keyboard "navigation" previously
  restyled the canvas while focus stayed stranded on <body>.
- Editor popovers (math/link/image) restore focus to the editor when dismissed
  with Escape, and popover/bubble-toolbar surfaces use theme tokens instead of
  hardcoded white (they were white-on-dark in the shipped dark theme).
