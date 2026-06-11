# Phase 6 — Editor/canvas interaction & UI fixes

> User-reported rendering/interaction bugs, plus a deep multi-agent UI review
> (12 confirmed findings, all root-caused to the items below).

## What was fixed

**1. Task checkboxes rendered on a separate line from their text.**
Tiptap ships no task-list CSS. Added flex styling so `li[data-type="taskItem"]`
lays its checkbox inline with the content, with `data-checked` strike-through and
nested-list indentation.

**2. Couldn't create a checklist by typing markdown.**
`- ` is claimed by StarterKit's bullet-list rule before `[ ]` can convert, and
the built-in task rule only matches a bare `[ ] `. Added `TaskInputRules`: typing
`[ ]`, `[]`, or `[x]` + space makes a task; when the cursor is inside a bullet
item (the `- [ ] ` case), it lifts the item out first and converts it. Checked
state is honored.

**3. Branch button was on the LEFT; slots were never wired.**
The branch affordance now lives in a **right-side, full-height** gutter (children
appear to the right, so the button does too). The gutter is a React-portal
overlay, so `HiermarkEditorSlots.BlockBranchButton` / `BranchChildChip` are wired —
pass any component; the default is a full-height `+`. A faint resting state plus
hover/active reveal improves discoverability.

**4. Fold/collapse not working; disclosure triangles clipped.**
The fold toggle and gutter previously sat in negative space that `.hiermark-surface {
overflow: hidden }` clipped. The editor now reserves real left/right gutters
(`padding`) so the fold triangle (left) and branch button (right) render fully
and remain clickable. Surface collapse continues to work via the header toggle.

**5. (Found by review) KaTeX stylesheet never imported** — inline/block math was
unstyled. `styles.css` now `@import`s `katex/dist/katex.min.css`; added general
content styles (headings, lists, blockquote, code).

## Tests (+5; 96 total)

`tests/gutter-and-tasks.test.tsx`:

- typing `[ ]` creates a task; `- [ ]` (bullet → task) converts; `[x]` is checked;
- the branch button renders inside the right-side gutter overlay;
- a custom `BlockBranchButton` slot replaces the default.

## Go/no-go gate — all green

```text
pnpm build · pnpm typecheck · pnpm lint · pnpm test · pnpm format:check
pnpm -F @hiermark/docs build   (KaTeX CSS + fonts bundled)
editor 65 · canvas 26 · docs 5
```
