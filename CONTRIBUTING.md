# Contributing to Hiermark

Thanks for helping! Hiermark is a pnpm monorepo with two publishable packages
(`@hiermark/editor`, `@hiermark/canvas`) and a docs/playground app (`apps/docs`).

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

Any change to `@hiermark/editor` / `@hiermark/canvas` needs a changeset:

```bash
pnpm changeset     # pick the packages + bump type, write a summary
```

Commit the generated `.changeset/*.md` with your PR. On merge to `main` the
release workflow opens a **Version Packages** PR that bumps versions and
updates changelogs; merging _that_ PR releases the new versions. Because the
bump lands as a committed PR before it is tagged, `main` is never stale.
`@hiermark/docs` is never published.

Publishing uses **npm trusted publishing (OIDC)** — no `NPM_TOKEN` secret.
Until it is armed, releases are **tag-only** (git tags + GitHub Releases, no
npm), so `main` stays green before the npm org exists. To arm npm publishing:

1. Create the `hiermark` npm org, and add a trusted publisher for each package
   on npmjs.com (Settings → Trusted Publishers) pointing at
   `mmcdermott/hiermark` and the `Release` workflow.
2. Set the repository variable `NPM_PUBLISH=true`
   (`gh variable set NPM_PUBLISH --body true`).

See `.github/workflows/release.yml`.

## PRs

- Branch off `main`; keep PRs focused and CI green.
- Sync with `main` via merge, not rebase, on long-lived branches.
- Reference issues with closing keywords (`Closes #n`) when applicable.
