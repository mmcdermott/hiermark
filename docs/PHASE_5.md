# Phase 5 — Documentation site + GitHub Pages

> **Goal:** an example static site (GitHub Pages) that shows what Hiermark is and how
> to use it, with live interactive demos.

## What was built

A Vite + React documentation site in `apps/docs`, deployed to
**[mmcdermott.github.io/ham](https://mmcdermott.github.io/hiermark/)** via the existing
`deploy-docs.yml` workflow. It consumes the packages as a real installed consumer
(through their built `dist`), importing `@hiermark/editor/styles.css` and
`@hiermark/canvas/styles.css`.

**Shell** — a sidebar-navigated, hash-routed single page with three groups:
Guide, Live demos, Reference.

**Pages**

- **What is Hiermark?** — the model, the editor/canvas split, why two views of one tree.
- **Getting started** — install, single-surface usage, the controlled canvas +
  handlers, and collaboration config, all as copy-pasteable snippets.
- **API reference** — the headline exports of each package, tagged by kind.

**Live demos** (each fully interactive)

- **The editor** — one annotated surface: branch gutter, heading fold, and
  clickable citation/mention popovers, with a branch-request log.
- **The canvas** — branch blocks into surfaces, reorder siblings, navigate; backed
  by an in-memory host (`useDemoCanvas`) that implements the real handler contract.
- **Decompose a paper** — progressive decomposition from a single thesis paragraph.
- **Collaboration** — two editors sharing one in-memory Yjs document (a no-server
  runtime injected via `HiermarkCollaborationConfig.runtime`) converging live.

**`useDemoCanvas`** — a reusable in-memory canvas host (surfaces + edges in state,
create/sibling/reorder/delete/save handlers) that doubles as a worked example of
how a host wires Hiermark up.

## Tests (5 smoke tests; 91 total)

A jsdom smoke suite renders the shell and mounts each demo, asserting the editor
mounts with live annotation decorations, the canvas mounts an editable root
surface, and the two collaborative editors converge on the shared document.

## Go/no-go gate — all green

```text
pnpm build               ✓
pnpm typecheck           ✓  editor, canvas, docs
pnpm lint                ✓
pnpm test                ✓  editor 60, canvas 26, docs 5
pnpm format:check        ✓
pnpm -F @hiermark/docs build  ✓  static site → apps/docs/dist
```

## Deferred (with rationale)

- **Bundle code-splitting** — the docs bundle is ~1.2 MB (it includes Tiptap +
  ProseMirror + Yjs + dnd-kit for the live demos). Acceptable for a docs site;
  lazy-loading per-demo chunks is a future optimization.
- **Published npm packages** — consumed via `workspace:*` today; a Changesets
  release pipeline can be added when an external consumer needs npm artifacts.

## Outcome

All six phases of the design spec's implementation plan are complete: two
installable, tested, documented packages with an interactive site — ready to fold
into a host application (e.g. the research-lab-manager) via data mapping and
handlers, without forking package internals.
