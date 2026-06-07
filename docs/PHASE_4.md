# Phase 4 — Interaction polish

> **Goal (design spec §11):** keyboard navigation; collapse/expand surfaces and
> blocks; compact rail/outline display modes; branch connectors; annotation
> popovers; accessibility.

## What was built

**Block fold (editor)** — `computeFold` (the reference's pure heading-stack
section resolver) plus a `BlockFold` extension that hides a folded heading's
section (CSS `display:none`, view-only — never deletes) and renders a disclosure
toggle on foldable headings. Fold state is editor-managed, seeded from
`collapsedBlockIds`, toggled from the gutter or via the handle's
`collapseBlock`/`expandBlock`.

**Annotation popovers (editor)** — clicking an inline annotation (or chip) opens
a **Floating-UI** popover rendering the annotation type's `render` component,
collision-aware (flip/shift), dismissed by outside-click or Escape, focus-managed
via `useRole`. The plugin tracks hits by id and routes raw DOM clicks to an
`onOpen` callback.

**Keyboard navigation (canvas)** — Alt+Arrow moves along the active path and
among same-column siblings (`←` parent, `→` first child, `↑`/`↓` siblings). The
canvas is a focusable `role="tree"`.

**Surface collapse + compact modes (canvas)** — a per-surface collapse toggle;
`pickDisplayMode` keeps active-path surfaces visible even when collapsed, while
unrelated collapsed surfaces compact to a rail. An **outline** display mode
renders a surface's top-level blocks (from its snapshot) as a clickable list.

**Accessibility** — surfaces are `role="treeitem"` with `aria-label`,
`aria-current`, and `aria-expanded`; all branch/fold/collapse/reorder affordances
are real keyboard-reachable `<button>`s with labels; path state is exposed via
`data-path-state` + borders (not color alone); dnd-kit's keyboard sensor gives
reorder a keyboard fallback.

## Tests (new; 85 total: editor 60, canvas 25)

- `computeFold` (pure): hides a folded section but not the heading/siblings; no
  toggle without a section.
- fold integration: toggle folds a section; handle `collapseBlock`/`expandBlock`.
- popover: click opens it (renders the component); Escape dismisses it.
- keyboard nav: Alt+→ to child, Alt+← to parent.
- collapse: header toggle flips `aria-expanded`; `pickDisplayMode` keeps the
  active path visible and rails unrelated collapsed surfaces.

## Go/no-go gate — all green

```text
pnpm build        ✓
pnpm typecheck    ✓  editor, canvas, docs
pnpm lint         ✓
pnpm test         ✓  editor 60, canvas 25
pnpm format:check ✓
```

## Deferred (with rationale)

- **Pixel-precise SVG branch connectors** — relationships are conveyed by the
  column layout, path-state borders, the outline mode, and per-block child chips
  (in the editor gutter). A drawn connector line is a visual nicety left for the
  docs polish; the `.ham-branch-connector` style hook exists.
- **Mod+Enter keyboard branch** — branching from the keyboard needs the active
  editor's handle; Arrow navigation covers the core "navigate by keyboard"
  requirement. Wired opportunistically in the docs demo.

## TODO(next)

- Phase 5: the interactive documentation site (`apps/docs`) on GitHub Pages —
  what-is-HAM, getting-started, live demos (simple branching, multi-surface
  column, annotations, progressive-decomposition paper), API reference.
