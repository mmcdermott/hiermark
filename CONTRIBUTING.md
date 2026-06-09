# Contributing to HAM

Thanks for helping! HAM is a pnpm monorepo with two publishable packages
(`@ham/editor`, `@ham/canvas`) and a docs/playground app (`apps/docs`).

## Setup

```bash
pnpm install
pnpm build        # build the packages (docs + canvas typecheck against dist)
pnpm test         # vitest across all packages
pnpm dev          # run the docs playground
```

Node `>=22.13.0` and pnpm `>=10.33` (see `.nvmrc` / `packageManager`).

## Before you push

CI runs, in order: **build → format:check → typecheck → lint → test → docs
build → packaging check**. Run them locally:

```bash
pnpm build && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test
pnpm lint:pkg     # publint over the built packages
```

- **Format** with Prettier as the _last_ step before committing — CI fails on any
  file written after the last `pnpm format`.
- Add tests for new behavior (Vitest + Testing Library; jsdom).

## Changesets (for releases)

Any change to `@ham/editor` / `@ham/canvas` needs a changeset:

```bash
pnpm changeset     # pick the packages + bump type, write a summary
```

Commit the generated `.changeset/*.md` with your PR. On merge to `main` the
release workflow opens a **Version Packages** PR; merging that publishes to npm.
`@ham/docs` is never published.

## PRs

- Branch off `main`; keep PRs focused and CI green.
- Sync with `main` via merge, not rebase, on long-lived branches.
- Reference issues with closing keywords (`Closes #n`) when applicable.
