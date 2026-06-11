# Phase 0 — Scaffold standalone Hiermark monorepo

> **Goal (from the design spec §11):** a pnpm workspace with `@hiermark/editor` and
> `@hiermark/canvas` packages, a Vite playground, Vitest setup, shared fixtures, a CSS
> build/export, and CI (typecheck, lint, test, build). Acceptance: `pnpm build`
> emits installable package output, and the playground imports packages as
> consumers — not via relative source paths.

## What was built

**Workspace**

- `pnpm-workspace.yaml` globs `packages/*` and `apps/*`; Node pinned to 22.18.0
  (`.nvmrc`); `pnpm@10.33.2`.
- `tsconfig.base.json` — one strict compiler baseline (`strict`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: Bundler`,
  `declaration` + `declarationMap`) extended by every package.
- Root `eslint.config.mjs` (flat config: `@eslint/js` + `typescript-eslint` +
  `react-hooks`), `.prettierrc.json`, `.prettierignore`, `.gitignore`.

**Packages (installable, built artifacts)**

- `@hiermark/editor` and `@hiermark/canvas` each ship a conditional `exports` map pointing
  at `dist/{index.js,index.d.ts}` plus `./styles.css`, with `sideEffects` so the
  stylesheet survives tree-shaking. Built by `tsup` (ESM + `.d.ts` + sourcemaps;
  a small `onSuccess` hook copies `src/styles.css` → `dist/styles.css`).
- Runtime dependencies pinned per spec §4.1 (Tiptap 3, `@tiptap/markdown`, Yjs /
  Hocuspocus, KaTeX, Floating UI, nanoid for the editor; dnd-kit, TanStack
  Virtual, Floating UI, zod for the canvas). React 19 is a peer dependency.
- `@hiermark/canvas` resolves `@hiermark/editor` to **source** for its own typecheck/test
  (tsconfig `paths` + vitest `alias`) so dev needs no prior build; the published
  artifact resolves the sibling via package `exports` (dist). pnpm's topological
  build order guarantees the editor's `.d.ts` exists before the canvas builds.

**Tests**

- Per-package Vitest with `environment: "jsdom"` + a setup file that loads
  jest-dom matchers and shims the layout APIs ProseMirror needs under jsdom
  (`ResizeObserver`, `Range.getClientRects`/`getBoundingClientRect`). A scaffold
  test proves a Tiptap editor mounts headlessly.

**Docs app**

- `apps/docs` — a Vite + React 19 site that imports both packages as a consumer
  and renders their versions. `base: "/hiermark/"` for GitHub Pages. Fleshed out into
  the full interactive docs site in Phase 5.

**Fixtures** — `fixtures/{simple-branching,multi-surface-column,nested-blocks,annotations}.json`
drive both unit tests and docs demos (spec §13).

**CI / CD**

- `.github/workflows/ci.yml` — one job: install (frozen lockfile) → build →
  format check → typecheck → lint → test. Build runs first so any consumer
  (docs app) typechecks against real `dist`.
- `.github/workflows/deploy-docs.yml` — builds packages + docs and deploys to
  GitHub Pages.

## Verified end-to-end

The docs app imports `@hiermark/editor` / `@hiermark/canvas` through their **built `dist`**
(package `exports`), not relative source paths — the Phase-0 acceptance criterion.
`pnpm build` emits `dist/index.js`, `dist/index.d.ts`, and `dist/styles.css` for
both packages.

## Go/no-go gate — all green

```text
pnpm build        ✓  editor + canvas → dist/{index.js,index.d.ts,styles.css}
pnpm typecheck    ✓  editor, canvas, docs
pnpm lint         ✓
pnpm test         ✓  editor (2), canvas (1)
pnpm format:check ✓
pnpm -F @hiermark/docs build  ✓  static site → apps/docs/dist
```

## Deferred (with rationale)

- **Storybook / Playwright** — the spec lists them as options, but a hand-built
  Vite docs SPA (Phase 5) is a more controllable "example static site" and is
  what gets deployed. E2E can be added later if interaction coverage needs it.
- **Changesets / npm publish** — packages are consumed via `workspace:*` for now;
  release automation is deferred until an external consumer needs published npm
  artifacts.

## TODO(next)

- Phase 1: real `@hiermark/editor` (block-id extension, tree-shaped snapshots, branch
  gutter, markdown round-trip, annotation registry).
