---
"@hiermark/editor": minor
"@hiermark/canvas": minor
---

Annotations (and hosts) can now write back to the block they're anchored to (#90).

Annotations were read-only: a render component got `{ hit, context, close }` with no
way to mutate the block it recognized, so a task chip's "Done" toggle could only
update sidecar state — which then lost to the canonical markdown on save. Writes now
go through the editor as one transaction, so they sync via Yjs and survive save.

**@hiermark/editor**

- `HiermarkEditorHandle.updateBlock(blockId, edit)` — apply a surgical, identity-
  preserving edit to a block by id (`{ setAttrs }`), as one transaction. The way host
  UI (e.g. a tasks panel) mutates canonical block state. `dataBlockId` is protected,
  so branch edges and anchored annotations survive.
- `HiermarkAnnotationRenderProps.update(edit)` — a write-back pre-scoped to the hit:
  `{ setAttrs }` targets the hit's block, `{ replaceText }` its inline range.
- New `HiermarkBlockEdit` / `HiermarkAnnotationEdit` types.
- The bundled example task annotation's chip now renders a working "Done" checkbox
  that flips the source `- [ ]` ⇄ `- [x]` via `update`.

**@hiermark/canvas**

- `HiermarkCanvasHandle.getSurfaceEditor(surfaceId)` — the live editor handle for a
  surface (null when it isn't mounted), so host UI outside the canvas can reach the
  active surface's editor to write back. Re-exports `HiermarkEditorHandle`.

Deliberately not included: a declarative `apply` inverse of `recognize`, a dedicated
checklist-toggle method, a raw `Editor` on the render props, and full-block markdown
replacement — one scoped `setAttrs`/`replaceText` primitive covers the use cases
without widening the surface or re-leaking Tiptap.
