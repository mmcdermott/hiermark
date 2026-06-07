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

## 📖 Documentation & live demos

**→ [mmcdermott.github.io/ham](https://mmcdermott.github.io/ham/)** — an
interactive documentation site (in `apps/docs`) with live, editable demos of the
editor, the canvas, progressive paper decomposition, and real-time
collaboration. It is the best way to see what HAM is and how to use it.

## Packages

| Package       | Description                                                       |
| ------------- | ----------------------------------------------------------------- |
| `@ham/editor` | One collaborative, block-centric markdown surface (Tiptap 3).     |
| `@ham/canvas` | A 2D canvas of surfaces connected by block-anchored branch edges. |

## Features

- **Stable block ids** on every structural block (split/paste-safe, never remapped).
- **Tree-shaped surface snapshots** from the live editor (heading + list containment).
- **Block-anchored branching** — branch any block into a child surface; multiple
  surfaces per column; ordered siblings; drag-to-reorder.
- **Pluggable annotation layer** — recognizer × placement registry with
  deterministic conflict resolution; bundled task / citation / mention / URL
  recognizers and Floating-UI popovers.
- **Heading fold**, keyboard navigation, compact rail/outline modes, and
  accessibility (tree roles, keyboard-reachable affordances).
- **Real-time collaboration** via Yjs / Hocuspocus, with a sync-gated mount that
  never duplicates initial content.
- **Host-owned persistence** — the packages call handlers; your app stores or
  rejects each operation.

## Development

```bash
pnpm install        # install the workspace
pnpm build          # build both packages (tsup -> dist/)
pnpm test           # run the full test suite (vitest)
pnpm typecheck      # type-check every package
pnpm dev            # run the docs site (Vite); run `pnpm build` first
```

Requires Node ≥ 22.13 and pnpm ≥ 10.33. Each phase of work is documented in
[`docs/PHASE_*.md`](./docs); the authoritative design is
[`docs/design-spec.md`](./docs/design-spec.md).

## License

[MIT](./LICENSE) © Matthew McDermott
