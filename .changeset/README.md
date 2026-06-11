# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
Run `pnpm changeset` to record a change; on merge to `main` the release workflow
opens a "Version Packages" PR, and merging that publishes `@hiermark/editor` /
`@hiermark/canvas` to npm. `@hiermark/docs` is ignored (never published).
