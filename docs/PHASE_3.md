# Phase 3 — Collaboration (Yjs / Hocuspocus)

> **Goal (design spec §11):** Hocuspocus/Yjs client integration with initial-sync
> gating, flush-on-unmount, collaborative carets; local non-collab mode preserved.

## What was built

**Two-component sync gate** — `HamEditor` now routes:

- **local mode** (no `collaboration.enabled`) → renders the editor directly, as
  before;
- **collab mode** → a `CollabHamEditor` gate that owns the `Y.Doc`, opens the
  transport via the runtime, and **delays mounting the editor until the provider
  reports `synced`** (with `LoadingState`/`ErrorState` slots). This is the
  load-bearing pattern: ProseMirror never binds to the `Y.Doc` before the
  server's persisted state arrives, so an empty default paragraph can't merge
  into the real content (the accumulating-blank-line bug). Race guards
  (`cancelled`/`created`), the `synced`-getter-vs-event dual path, and an
  optional `initialSyncTimeoutMs` fallback are all handled.

**`createHocuspocusCollab`** — builds a Hocuspocus-backed runtime
(`{ ydoc, connect() }`) from `HamCollaborationConfig`; the editor owns the
`Y.Doc`. A `HamCollaborationConfig.runtime` injection point lets hosts supply a
custom transport or tests a no-network double. `flushAndDestroy` drains unsynced
changes before destroying the provider, with a hard 3s cap.

**Collaboration extensions** — `createHamEditorExtensions({ collab })` adds
`Collaboration` (bound to the `Y.Doc`) and, when the provider exposes awareness,
`CollaborationCaret`; StarterKit's undo/redo is disabled (Yjs owns history).

**Seed-if-empty** — after the gate confirms sync, the editor seeds the initial
markdown **only if the synced doc is empty**, with `emitUpdate: false` so the
seed doesn't trigger a save of content just loaded.

## Tests (3 new; 54 editor total)

Using an injected runtime + a shared `Y.Doc` (no network):

- **two editors sharing a `Y.Doc` converge** on the same content; the second
  editor adopts the shared content and does not seed its own markdown;
- **no duplicated initial content** when a second editor seeds the same markdown
  into an already-populated doc (the pre-sync gate + isEmpty guard);
- **block ids stay unique** after collaborative edits.

## Go/no-go gate — all green

```text
pnpm build        ✓
pnpm typecheck    ✓  editor, canvas, docs
pnpm lint         ✓
pnpm test         ✓  editor 54, canvas 21
pnpm format:check ✓
```

## Deferred (with rationale)

- **A bundled Hocuspocus server** — HAM owns only the client; the server stays
  host-owned (spec §15.5). The one durable server-side rule (load/persist raw
  `Uint8Array`, never a `Y.Doc`) is documented on `createHocuspocusCollab`.
- **Live cursor rendering test** — carets need a provider awareness instance;
  convergence is tested via the shared `Y.Doc`. The caret extension is wired and
  activates whenever the provider exposes `awareness`.
- **Per-surface collaboration in the canvas** — the editor is collab-capable; a
  host opts a surface into collaboration via `editorDefaults`/per-surface config.
  Wired in the docs demo (Phase 5) where useful.

## TODO(next)

- Phase 4: keyboard navigation, block/surface collapse (fold), rail/outline
  compact modes, branch connectors, annotation popovers, accessibility.
