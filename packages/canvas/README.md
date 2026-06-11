# @ham/canvas

A 2D **canvas of linked markdown surfaces** for HAM — editable
[`@ham/editor`](https://www.npmjs.com/package/@ham/editor) surfaces laid out in
depth-banded columns and connected by per-block branch edges (levels left → right,
sections top → down).

```bash
pnpm add @ham/canvas @ham/editor react react-dom
```

> **ESM + CJS.** Ships dual builds; React 18.3+ or 19 is a peer dependency.

```tsx
import { HamCanvas } from "@ham/canvas";
import "@ham/editor/styles.css";
import "@ham/canvas/styles.css";

<HamCanvas
  rootSurfaceId="s_root"
  surfaces={surfaces} // your data
  branchEdges={branchEdges} // your data
  handlers={handlers} // create/save/delete surfaces — you own persistence
/>;
```

## Highlights

- **The canvas owns layout; you own the data.** `surfaces` + `branchEdges` are
  the tree; `handlers` is how the canvas asks you to create / save / reorder /
  delete surfaces when a block is branched.
- **Display modes** — the active path expands to full editors; inactive columns
  condense to cards / outlines / rails / hidden, all configurable.
- **Connectors** — an SVG overlay draws each branch edge from its source block to
  its child surface, with hover and active-path emphasis.
- **Slots everywhere** — replace the surface frame, header, preview, body,
  connector, add-sibling button, group/column headers, and empty states.
- **Accessible** — ARIA tree semantics, a live status region, and reduced-motion
  support.

The headless `useHamCanvas` hook exposes the same orchestration if you want to
build your own renderer. See the [live docs](https://mmcdermott.github.io/ham/).
Released under the MIT license.
