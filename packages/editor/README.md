# @ham/editor

One collaborative, block-centric **markdown surface** for HAM — a Tiptap 3 /
ProseMirror editor with stable block ids, tree snapshots, a generic annotation
layer, math, syntax-highlighted code, image upload, links, and a raw-markdown
source mode. Pairs with [`@ham/canvas`](https://www.npmjs.com/package/@ham/canvas).

```bash
pnpm add @ham/editor react react-dom
```

> **ESM + CJS.** Ships dual builds; React 19 is a peer dependency.

```tsx
import { HamEditor } from "@ham/editor";
import "@ham/editor/styles.css";

<HamEditor
  surfaceId="s1"
  rootBlockId="blk_root"
  value={{ kind: "markdown", markdown: "# Hello\n\nStart writing…" }}
  onSnapshotChange={(snap) => console.log(snap.blockOrder)}
/>;
```

## Highlights

- **Stable block ids** on every structural block; a tree-shaped `snapshot`
  (headings contain the blocks beneath them) drives branching and annotations.
- **Annotations** — a registry of recognizers emits typed hits (citations,
  mentions, URLs, tasks) rendered as inline pills / chips / a `@`-type-ahead,
  without ever changing the markdown.
- **Rich content** — inline + display KaTeX math (click to edit the LaTeX),
  highlighted code blocks (copy + language picker + soft-wrap), GFM tables, and
  images uploaded through a host `onImageUpload` handler.
- **Links** — click a link or press `Mod-k` to edit it; dangerous schemes are
  stripped (a built-in `Sanitize` extension).
- **Source mode** — `handle.setMode("source")` swaps to a raw-markdown textarea
  and re-parses, preserving block ids.
- **Collaboration** — opt-in Yjs/Hocuspocus binding with visible remote cursors,
  bounded reconnect, and lifecycle callbacks.
- **Theming** — every visual is a CSS variable you can override.

See the [live docs](https://mmcdermott.github.io/ham/) for runnable examples and
the full API. Released under the MIT license.
