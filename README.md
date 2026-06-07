# HAM — Hierarchical, Annotatable Markdown

> A 2D canvas of linked, editable markdown surfaces with rich annotations and
> block-anchored branching.

HAM is two React + TypeScript packages for building applications around a
**2D canvas of editable markdown surfaces**. Any block inside a surface
(paragraph, heading, checklist item, …) can be _branched_ into a child surface
that elaborates it; child surfaces lay out in the next column to the right,
forming a navigable breadth × depth canvas. A thin, pluggable annotation layer
recognizes and renders structured entities (tasks, citations, links, mentions,
math, …) atop the user's markdown.

```text
@ham/editor   one editable markdown / block-tree surface
@ham/canvas   a 2D grid of many editable surfaces, linked by branch edges
```

The key architectural split:

```text
@ham/editor owns the intra-surface block tree.
@ham/canvas owns the inter-surface 2D topology.
```

## Status

🚧 **Under active development.** See the [design spec](./docs/design-spec.md) and
the staged implementation plan. The packages are not yet published to npm.

## Packages

| Package        | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| `@ham/editor`  | One collaborative, block-centric markdown surface (Tiptap 3).     |
| `@ham/canvas`  | A 2D canvas of surfaces connected by block-anchored branch edges.  |

## Documentation & live demo

A documentation site with live, interactive examples is published via GitHub
Pages (see `apps/docs`). It is the best way to see what HAM is and how to use it.

## Development

```bash
pnpm install        # install the workspace
pnpm build          # build both packages (tsup -> dist/)
pnpm test           # run the full test suite (vitest)
pnpm typecheck      # type-check every package
pnpm dev            # run the docs / playground app (Vite)
```

Requires Node ≥ 22.13 and pnpm ≥ 10.33.

## License

[MIT](./LICENSE) © Matthew McDermott
