# HAM Roadmap

This is the forward-looking work plan for the HAM monorepo — the two generic React
packages (`@ham/editor`, `@ham/canvas`) and, beyond them, the research-lab-manager
product that consumes them.

## Where things stand

- **`@ham/editor`** — a Tiptap 3 markdown surface with stable block ids, tree
  snapshots, a branch gutter (with a **bubble-up** affordance policy + an `"off"` switch),
  a generic annotation layer (citations / mentions / URLs / tasks + an `@`-type-ahead),
  inline + display KaTeX math (markdown-aligned `$…$`/`$$…$$` input rules + **click-to-edit
  LaTeX**), syntax-highlighted code blocks (lowlight) with a copy button + language picker,
  image upload via a host handler, Yjs/Hocuspocus collaboration with visible remote cursors,
  and a raw-markdown source mode.
- **`@ham/canvas`** — a 2D canvas of surfaces linked by per-block branch edges:
  depth-banded projection (split into a snapshot-free context + a cheap ordering pass),
  active-path display modes (compact cards collapse to content; rail = header-only), SVG
  connectors (decoupled re-subscription vs. re-measure; hover shows parent+child; anchored to
  the child chip), drag-reorder, scroll-to-reveal on selection, and pessimistic topology
  operations through host handlers.
- **`apps/docs`** — a Vite SPA doubling as a live playground, with concept guides and
  "</> Source"-toggle demos. Deployed to GitHub Pages.
- **Tests:** ~192 green (editor 122, canvas 65, docs 5), all jsdom. CI is a single
  ubuntu / Node 22 job: build → format → typecheck → lint → test → docs build.

> **Recently shipped (UX / bug-fix batch).** Code-block language dropdown fix; single-`$`
> inline + `$$` block math input rules and a click-to-edit LaTeX popover; the **bubble-up**
> branch-affordance policy (single nested branch point bubbles up; default) plus `"off"` and a
> whole-document affordance; compact-card sizing (no min-height in outline/rail; rail collapses
> to its header) and scroll-only-on-overflow; hover connectors in **both** directions and
> anchored to the child chip; **scroll-to-reveal** (select a block → its branch scrolls into
> view; click an editor → it aligns to the canvas start); the docs now disable branch
> buttons on standalone editors and surface "Edit as markdown" (source mode) as a general
> capability; and **source-mode edits now preserve block ids** (content+position alignment on
> re-parse), so branch edges / annotations survive editing the raw markdown.

The packages are intentionally **generic**. Application concepts — a document/project
model, citation records, tasks reconciliation, LLM actions, final-text/LaTeX assembly,
history — are **host-owned** and live in the consumer app, not the packages. That scope
boundary shapes the two tracks below.

## How to read this

- **Track A** hardens the libraries toward a publishable `v1.0`.
- **Track B** builds the actual product on top of them.
- Each item is tagged `[priority · effort]`:
  - Priority: **P0** blocking/correctness · **P1** high value · **P2** nice · **P3** speculative.
  - Effort: **S** hours · **M** ~a day · **L** several days · **XL** multi-week.
- File references point at the exact code to change.

---

## P0 — Correctness & blockers (do these first)

These are latent correctness bugs and adopter-blockers that should land before new
features, in either track.

- ~~**Serialize the per-surface debounced save**~~ `[P0 · M]` — **✅ DONE.** `SurfaceItem`
  now serializes saves (`savingRef`/`pendingRef`): only one host `saveSurface` is in flight at
  a time, and saves requested mid-flight coalesce into exactly one follow-up with the latest
  content (newest snapshot wins). The unmount flush no longer chains a save through the
  tearing-down editor. _(Deep-review rank 8.)_
- ~~**Make source-mode round-trips id-preserving**~~ `[P0 · L]` — **✅ DONE.** Switching to
  rich now captures the pre-edit block identities and, after the markdown re-parse, restores
  ids onto matching blocks via content+position alignment (`snapshot/blockIdentity.ts`:
  `collectBlockIdentities` + `planBlockIdRestore`, wired in `HamEditor.tsx` `applyModeRef`):
  an exact (type+text) pass for unchanged/reordered blocks, then a positional-by-type pass for
  edited-in-place blocks — so branch edges / annotations survive. (Chose content alignment over
  embedding `<!-- ham:block= -->` comments to keep the source textarea clean; the comment
  grammar still serves the separate git-export item in A2.)
- ~~**Gate `immediatelyRender` for SSR**~~ `[P0 · S]` — **✅ DONE.** `useEditor` now sets
  `immediatelyRender: typeof window !== "undefined"`, so it renders synchronously in the
  browser but defers on the server (no Next.js/Remix hydration crash).
- ~~**Harden image/link `src` validation (stored-XSS)**~~ `[P0 · M]` — **✅ DONE.** StarterKit's
  Link is configured with a protocol allowlist (`http`/`https`/`mailto`) + `isAllowedUri` +
  `rel="noopener noreferrer nofollow"`, and a new **`Sanitize`** extension
  (`extensions/sanitize.ts`) strips dangerous link `href`s / image `src`s
  (`javascript:`/`vbscript:`/`file:`/`data:text/html`) from **every** path — initial seed
  (`onCreate`), typing, paste, markdown parse, `setContent`, collab — with an optional
  `isAllowedImageSrc` host policy.

---

## Track A — Library hardening (toward `@ham/*` v1.0)

### A1 · Collaboration robustness

- ~~**Sync-failure recovery: bounded retry + connecting state + status callbacks**~~
  `[P1 · M]` — **✅ DONE.** `CollabHamEditor` now retries a failed `connect()` with
  exponential backoff (1s/2s/4s, `maxRetries` default 3), exposes `onStatusChange`
  (connecting → connected → synced / timedout / error), `onError(Error)`, and `onRetry(n)`,
  and renders a **Retry** affordance (plus a `retry` arg to the `ErrorState` slot). _(Rank 7.)_
- ~~**Expose unsynced-changes + flush result**~~ `[P2 · S]` — **✅ DONE.**
  `onUnsyncedChangesChange(count)` is wired to the provider's `unsyncedChanges` event, and
  `flushAndDestroy` now returns `Promise<{ flushed; pendingChanges? }>` surfaced via the new
  `onBeforeUnmount(result)` config hook. _(Rank 13.)_

### A2 · Editor content features

- **Image resize handles** `[P1 · M]` — **✅ DONE.** The Image extension's built-in resize is
  enabled (`resize: { enabled: true, minWidth: 48 }`): drag handles on a selected image, with
  `width`/`height` persisted as schema attrs (kept in JSON / collaboration; markdown export stays
  size-agnostic by design). The node view keeps a real `<img>`, so click-to-edit alt + the gutter
  still resolve the node.
- **Block-level Figure node with caption** `[P1 · L]` — _deferred (deliberate)._ A separate
  `figure`/`figcaption` schema node would let images be block ids / branchable / captioned, but a
  caption has no clean markdown representation and would regress the round-trip fidelity just
  hardened (footnotes/HTML excluded for the same reason). The image **title** (editable via the
  alt/title popover) serves as the caption-equivalent and round-trips as `![alt](src "title")`.
  Revisit only if a host needs true block-figure semantics.
- **Image alt-text / title editor** `[P1 · M]` — **✅ DONE.** `ImageEditor` extension +
  `ImagePopover`: clicking any image opens a Floating-UI popover to edit its alt text
  (accessibility-critical) and title, written straight back to the node attrs (and so to
  `![alt](src "title")` markdown). Wired by default in `HamEditor`; the cursor hints images
  are interactive. _Resize handles / caption still want the block Figure node below._
- ~~**Link mark + inline link editor**~~ `[P1 · M]` — **✅ DONE.** `LinkEditor` extension +
  `LinkPopover`: clicking a link (or `Mod-k` over a selection) opens a Floating-UI popover to
  set/edit/remove the href (`setLink`/`unsetLink`); links open via the popover, not navigation
  (`openOnClick:false`), and carry safe `rel`.
- **Markdown round-trip fidelity audit** `[P1 · L]` — **✅ DONE** (matrix).
  `tests/markdown-roundtrip.test.tsx` pins `markdown → editor → getMarkdown` fidelity across the
  supported set: headings, strong/em/`code`/strikethrough, links, images, bullet/ordered/**task**
  lists (incl. nesting), blockquotes, fenced code **with language**, GFM **tables** (cells are
  padded to column width — still valid GFM), and inline/block **math** (HAM single-`$`). All
  survive. _Known out-of-scope (no schema node / marked extension, so they drop or flatten):
  footnotes `[^1]`, definition lists, and raw-HTML blocks — documented on the Markdown docs page.
  Adding those nodes is a separate opt-in._
- **Block-id markdown export (git-sync identity)** `[P2 · M]` — `getMarkdown()` emits plain
  markdown with no block-id comments (only task ids are injected). Add an opt-in export mode
  that injects `<!-- ham:block=<id> -->` per block so a persisted file carries identity for a
  true git round-trip. _(Shares machinery with the P0 source-mode fix; unblocks Track B
  git-sync.)_
- **Code block polish** `[P2 · S–M]` — _partly done:_ the language picker now derives from the
  _configured_ lowlight instance (a host using `createLowlight(all)` gets every grammar), and a
  **soft-wrap** toggle was added. Still open: line numbers + a host-visible copy success/failure
  callback.
- **Annotations on atom blocks** `[P2 · M]` — `buildBlockTextIndex` indexes only inline text,
  so citations/mentions inside tables, code, and images can't be placed (hits silently drop).
  Add block-level (chip/gutter) placement keyed to the block id for atom blocks.
- **Paste sanitization** `[P2 · M]` — only image files are intercepted on paste; HTML from
  Word/Docs/web flows through unsanitized. Add a `transformPasted` step that strips foreign
  styles, normalizes to the HAM schema, and optionally interprets pasted markdown.
- **IME composition + source-textarea ergonomics** `[P2 · M]` — no `isComposing` guards exist,
  so the annotation type-ahead and task input rules can misfire mid-composition for CJK/IME
  users; the source-mode textarea also steals Tab. Add composition guards and Tab-to-indent.
- **Optional formatting toolbar / bubble menu** `[P2 · M]` — **✅ DONE.** `BubbleToolbar` shows
  a floating bold / italic / strikethrough / inline-code toolbar over a non-empty text selection
  (Floating-UI virtual-element anchored to the selection rect; `aria-pressed` reflects active
  marks; hidden in code blocks, source mode, and when not editable). On by default; opt out with
  `bubbleMenu={false}`. _(Marks only — links/images keep their dedicated click popovers.)_
- **Per-block / collab-safe source edit** `[P2 · L]` — source mode is disabled under collab
  (a full re-parse would clobber the Y.Doc). A per-block source editor that splices only one
  block's slice back (preserving its id) works under collab and avoids the whole-doc re-stamp.
  _(Depends on the P0 id-preserving fix.)_
- **Annotation decoration extension seam** `[P3 · M]` — placements are hardcoded in
  `annotations/plugin.ts`; add an optional `decorate(hit, ctx)` hook so a type can supply its
  own inline/block decoration or widget without forking `AnnotationLayer`.

### A3 · Canvas features & interaction

- ~~**`SurfaceBody` renderer slot**~~ `[P2 · M]` — **✅ DONE** (replaces an inactive card's body;
  the active surface keeps its editor). Original note: the inactive-surface body was hardcoded
  (`HamCanvas.tsx:291` expanded→editor / outline→OutlineBody / else→preview) with no slot, so a
  host wanting a richer inactive card (thumbnail, metadata, charts) must reimplement
  `SurfaceFrame` and its activation wiring. Add an optional `SurfaceBody` slot mirroring the
  existing slot pattern. _(Rank 15 remainder.)_
- **Complete keyboard nav & a11y** `[P1 · M]` — **✅ DONE** (core). Sibling treeitems carry
  `aria-setsize`/`aria-posinset`; an `aria-live` status region announces async ops; **Alt+Right
  now follows the active block's first outgoing edge** (`anchorBlockId` match in sortOutgoing
  order, falling back to the surface's first child) so it no longer jumps to an unrelated sibling
  group; and **Alt+C** toggles collapse of the active surface (non-destructive). _Destructive
  single-keystroke bindings (delete/branch/add-sibling) intentionally deferred — they want a
  confirm affordance rather than a bare Alt+key, tracked separately._
- **Loading / error / empty states** `[P1 · M]` — _mostly done:_ an empty canvas renders a
  placeholder (+ an `EmptyCanvas` slot); a polite `aria-live` status region announces pending
  ops; and each surface now carries **`aria-busy`** plus a **visible header spinner** while an
  async op is in flight (not just the prior dimming). A built-in per-surface _error_ badge is
  deliberately left to the host via the `onOperationError` seam — a library-imposed retry chip
  would presume recovery semantics the host owns.
- **Render orphan / duplicate-incoming surfaces** `[P2 · M]` — **✅ DONE** (orphans).
  `projectColumnsFromContext` now BFSes surfaces unreachable from the root (seeded from their
  local roots, with a cycle-only fallback so nothing is dropped) into trailing `detached: true`
  columns; the canvas renders a "Not linked to root" divider before them, so orphaned data is
  never silently invisible. _Duplicate-incoming-edge warning still open (the projection visits
  each surface once; `validateHamTopology` already detects the case for hosts that call it)._
- **Harden drag-reorder** `[P2 · M]` — the reorder path has zero test coverage; invalid
  cross-anchor drops are a silent no-op, and connectors only fade (don't track) during a drag.
  Add clear rejection feedback, better in-drag connector behavior, and reorder tests (incl. the
  keyboard sensor).
- ~~**`prefers-reduced-motion`**~~ `[P2 · S]` — **✅ DONE.** Auto-scroll uses `behavior:"auto"`
  under reduced-motion, and a `@media (prefers-reduced-motion: reduce)` block disables card /
  connector / add-sibling transitions.
- **Connector routing: overlap avoidance + labels** `[P2 · L]` — many edges from one block
  overlap into a smear and edges can pass through intermediate cards. Add per-edge fan-out at the
  source, optional orthogonal routing for multi-column spans, and a label anchor on
  `HamConnectorRenderProps`.
- **Canvas-level undo for topology ops** `[P2 · L]` — **✅ DONE** (reorder). The canvas keeps an
  undo/redo stack for **sibling reorders** — the one op losslessly reversible through the existing
  handler (re-apply the captured order via `siblingEdgeOrder`), no host "restore" capability
  required. **Cmd/Ctrl+Z** undoes, **Cmd/Ctrl+Shift+Z** (or Ctrl+Y) redoes, when the canvas chrome
  (not an editor) is focused. _Branch-create / delete undo are out of scope here — they'd need a
  host re-create seam, since the host owns persistence._

### A4 · Performance at scale

- ~~**Sub-quadratic connector measurement**~~ `[P1 · S]` — **✅ DONE.** `measure()` indexes the
  surface / block / chip anchors into Maps ONCE per pass (block ids keyed `surfaceId\0blockId`,
  since they're surface-scoped) instead of a per-edge querySelectorAll scan. Original: — `measure()` calls `findByAttr` twice per
  edge, each a full `querySelectorAll` + linear scan → O(E·N) per pass on every scroll/resize/RO
  tick. Build one `Map<surfaceId|blockId, Element>` per pass. _(Cheap, high-value hot-path fix.)_
- **Virtualize columns & surfaces** `[P1 · XL]` — every inactive surface mounts a `SurfaceItem`
  (a full editor in expanded mode). Add vertical virtualization within a column (and ideally
  horizontal column windowing), keeping the active path always rendered and letting connectors
  clamp to off-screen anchors. _(Depends on the connector-measure fix.)_
- **Pan / zoom + zoom-to-fit** `[P2 · L]` — no scale transform exists. Add a zoom layer and divide
  measured rects by the scale factor; add `+`/`-`/ctrl-wheel handlers.
- **Touch / trackpad gestures** `[P2 · M]` — hover connectors and the add-sibling rail are
  mouse-only; add pointer/tap equivalents and trackpad pan/pinch. _(Depends on zoom.)_
- **Minimap / overview navigator** `[P2 · L]` — add an optional small-scale tree overview that
  highlights the active path and click-jumps.

### A5 · Package extension points (surfaced by consumer needs)

- **Pure markdown subpath (`@ham/editor/markdown`)** `[P1 · S]` — **✅ DONE** (issue #50). A host's
  server reconciler / collab worker / git-sync CLI must run the editor's grammar + stable-id/hash
  helpers — definition drift there is a data-loss bug — but importing them from the package root
  pulled the whole React/Tiptap stack into a Node graph. The `markdown/*` files are already
  import-pure, so this is just an export seam: a new `src/markdown/index.ts` barrel, a tsup
  `markdown` entry (→ `dist/markdown.{js,cjs,d.ts,d.cts}`), and a `"./markdown"` `exports`
  condition. The package root now re-exports _from_ that barrel, so client and server share one
  source. A test statically asserts no `src/markdown/` file imports react/tiptap/katex/etc., so the
  subpath can't silently regain a browser dep.
- ~~**Controlled `value` / revision swap**~~ `[P2 · M]` — **✅ DONE.** A `revision` prop re-applies
  `value` after mount (history restore / server push), preserving matching block ids; ignored
  under collab. Original: — `value` is mount-time only; history/restore
  and server-driven revision swaps currently need remount-by-key or the imperative `setContent`.
  Add a first-class controlled-value (or `defaultValue`) prop. _(The type doc already anticipates
  this.)_
- **Whole-surface "decompose" edge + Levels layout mode** `[P3 · M]` — the HSM decompose action
  branches from the _whole_ document (a `fromBlockId`-null edge) and wants a depth-level-grouped
  layout; `HamBranchEdge` requires `fromBlockId` and the layout is fixed left-to-right. Decide
  whether the flagship HSM view reuses `@ham/canvas` (needs these small additions) or is a parallel
  renderer reusing only the topology helpers.

### A6 · Testing & quality

- ~~**Coverage measurement + baseline gate**~~ `[P1 · M]` — **✅ DONE.** `@vitest/coverage-v8` with
  per-package thresholds (editor ~84/74/80/88, canvas ~80/69/73/83) gated in a CI coverage step.
  Original: — no `@vitest/coverage-v8`, no thresholds.
  Enable v8 coverage in the three vitest configs, run `--coverage` in CI, and gate (start
  informational). Target the pure utils first: `markdown/hash.ts`, `stable-id.ts`, `containment.ts`,
  `annotations/conflict.ts` + `recognize.ts`, `topology/*`, `connectors/connectors.ts`. _(Rank 19.)_
- **Failure-mode tests for canvas handlers + collab** `[P1 · M]` — _partly done:_ a
  createSurfaceFromBlock-rejection test (onOperationError + pending clears) + the collab
  retry/flush tests landed. More handler-rejection cases remain. Original: — handler rejections
  (create/sibling/reorder/delete/save) and the collab gate's failure paths (connect rejection,
  flush timeout, unsync-then-sync) are untested; add `mockRejectedValueOnce` cases asserting
  `onOperationError`, pending-state clearing, and no double-call. _(Ranks 17 + the collab subset;
  guards the P0 save and A1 collab work.)_
- **Branch-edge ordering edge cases** `[P2 · M]` — stale `insertAfterEdgeId`, concurrent same-position
  inserts, hosts ignoring `shiftedSiblingOrders`, and non-dense order gaps after deletions.
  _(Rank 18.)_
- **Real-browser smoke layer (Playwright)** `[P2 · L]` — jsdom can't validate layout, connector
  measurement, contenteditable selection, KaTeX/lowlight rendering, or real drag. Add a handful of
  browser smoke flows against the built docs site. _(Ranks 20 + the e2e gap; guards the caret-visibility
  feature.)_
- **Accessibility (axe) assertions** `[P2 · M]` — **✅ DONE.** `vitest-axe` runs over a populated
  editor surface and a branched canvas (+ the empty state) in `tests/a11y.test.tsx`. The first run
  found and we **fixed four real violations**: the editor's `contenteditable` had no accessible
  name (added `aria-label` + the `ariaLabel` prop + `aria-multiline`); the surface used
  `role="treeitem"` on a `<section>` (→ `<div>`); `role="tree"` owned non-tree children (the
  status region / empty placeholder moved out as siblings, decorative connectors + the detached
  divider `aria-hidden`, and `role="tree"` gated to non-empty); and each card header was an
  implicit `banner` landmark (`<header>` → `<div>`).
- ~~**Public-API type tests**~~ `[P3 · M]` — **✅ DONE** (export-presence guard + `expectTypeOf`
  on key public types in public-api.test.ts). Original: — add `expectTypeOf`/`tsd` over the ~80 exports (and consider
  type-checking against the built `.d.ts`) so a signature change can't ship silently.
- **Large-doc / collab stress** `[P3 · L]` — the editor structural-stress half landed
  (`scale.test.tsx`); still open: collab convergence on a large Y.Doc and round-trip on pathological
  generated content (deep nesting, big tables, unicode). _(Rank 21 remainder.)_

### A7 · Packaging & release

- ~~**Release pipeline with Changesets**~~ `[P1 · M]` — **✅ DONE** (`.changeset/`, root
  `changeset`/`version`/`release` scripts, `release.yml` via `changesets/action`). Original: — no `.changeset`, CHANGELOG, or publish workflow;
  both packages are publishable but stuck at 0.1.0. Add `@changesets/cli` + a `version`/`publish`
  Action; note that canvas depends on editor via `workspace:^`, which Changesets rewrites on publish
  (a manual `npm publish` would ship a broken canvas tarball).
- ~~**CJS build or explicit ESM-only**~~ `[P1 · M]` — **✅ DONE** (dual ESM+CJS via tsup; `main`
  now points at `.cjs`, per-condition `import`/`require` types). Original: — tsup emits ESM only, but `"main"` points at the
  ESM file and there's no `require` export condition — a CJS interop trap. Either add a `cjs` format +
  `require` condition or drop `main` and document ESM-only.
- ~~**Packaging validation in CI**~~ `[P1 · S]` — **✅ publint** gate added to CI (passes; an attw
  types-resolution nicety for native-node16 CJS remains, documented). Original: — add `publint` + `@arethetypeswrong/cli` against
  `packages/*`; they immediately flag the `main`/`require`/types-resolution issues above.
- ~~**Provenance + `publishConfig.access: public`**~~ `[P2 · S]` — **✅ DONE** (both packages). Original: — scoped packages need `access: public`
  on first publish; add `--provenance` under the trusted OIDC publish job. _(After the release pipeline.)_
- ~~**Per-package READMEs + CONTRIBUTING**~~ `[P2 · S]` — **✅ DONE**. Original: — `files:["dist"]` means the npm tarball ships with
  no README (blank package page); add minimal per-package READMEs and a CONTRIBUTING covering the
  changeset workflow.
- **CI matrix + bundle-size budgets + automated deps** `[P2 · S each]` — **✅ DONE.** CI runs a
  **Node 22 + 24 matrix**; **Dependabot** (npm + actions) + **CODEOWNERS** were added; and
  **`size-limit`** budgets now gate each package's published ESM bundle in CI (`.size-limit.json`,
  `pnpm size` — editor 25.9 kB / 30 kB cap, canvas 13.9 kB / 18 kB cap, both gzipped) so a
  dependency or feature that bloats the bundle fails the build.

### A8 · Docs & developer experience

- **Generated API reference** `[P1 · L]` — **✅ DONE.** TypeDoc (`typedoc.json` +
  `tsconfig.typedoc.json`) generates a full HTML reference for both packages' source into
  `apps/docs/public/api` (gitignored; built in CI via the `docs:api` script before the Vite
  build, so it ships at `/api` and can't drift). The hand-written `ApiReference.tsx` stays as a
  curated overview and links to the generated reference.
- ~~**"Limitations & known issues" page**~~ `[P1 · S]` — **✅ DONE** (the new "Production notes"
  docs page). Original: — state the current constraints honestly (SSR,
  dark mode, mobile/touch, host-run collab server, host-owned image storage, gutter-annotation
  placement). Cheap; sets correct expectations.
- ~~**Collab-server setup recipe**~~ `[P1 · M]` — **✅ DONE** (Hocuspocus server + client recipe on
  the Production notes page, incl. the Uint8Array + JWT contracts). Original: — the single biggest "how do I actually run this" gap:
  a minimal `@hocuspocus/server` with `onAuthenticate` + persistence and the client `createHocuspocusCollab`
  wiring, end to end.
- ~~**Design-token reference + dark mode**~~ `[P1 · M]` — **✅ DONE.** Both packages ship a dark
  theme (OS `prefers-color-scheme` + `[data-theme="dark"]`/`"light"`); the docs have a token table
  - a live theme toggle. Original: — theming is advertised but the token set is
    undocumented and there's zero `prefers-color-scheme`/`[data-theme]` support. Document the tokens and
    ship a dark theme + a docs theme toggle.
- ~~**Dev-time warnings / opt-in debug logging**~~ `[P2 · M]` — **✅ DONE** (a `devWarn` one-time
  NODE_ENV-gated warner in both packages, flagging collab-without-transport, json-seed-under-collab,
  and a missing root surface). Original: — there are zero `console.warn`s in either
  package, so misconfigurations fail silently (collab without a runtime, images pasted with no upload
  handler, invalid topology, duplicate ids). Add `NODE_ENV`-guarded warnings + an optional debug flag.
- **Starter template (StackBlitz / degit)** `[P2 · M]` — no runnable starter exists; `demoHost.ts` is a
  ready-made basis for the host-handler scaffold.
- **CHANGELOG + versioning/migration page** `[P2 · M]` — pairs with A7's Changesets.
- **Accessibility audit page + docs search + perf/scale page + i18n/RTL + telemetry hooks** `[P2–P3]` —
  a formal WCAG audit page; client-side docs search + linking the in-repo `design-spec`/`PHASE_*` docs;
  a measured "performance at scale" page with a 200+-surface stress demo; an i18n/RTL story and an
  optional generic `onEvent` telemetry hook.

---

## Track B — The product: research-lab-manager (consumer app)

None of this exists yet — `apps/docs` is a demo whose state lives in-memory. This is the original
goal: a lab-management / hierarchical-summary app built **on top of** the generic packages, consuming
them via data + handlers. Items are in dependency order; the reference implementation to port from is
`HAM_PLAYBOOK.md` + the spec's "host-owned" list (§3.3) and `docs/use-cases.md`.

### Foundations (P0)

- **App shell (web + API) mounting `HamCanvas` with real handlers** `[P0 · L]` — the spine: render
  `<HamCanvas>` against server-loaded state and wire `createSurfaceFromBlock` / `createSiblingSurface` /
  `reorderBranchSiblings` / `deleteSurface` / `saveSurface` to API routes (reference: a Next.js app).
- **Persistence: surfaces + polymorphic branch-edge graph + block reconciler** `[P0 · XL]` — the host DB
  and the `saveSurface(HamEditorSavePayload)` reconciler. Port the Prisma model (Document/Surface with
  `rootBlockId` + `yjsState`; a single polymorphic Edge table; Block with `@@unique([documentId,
clientBlockId])`), consuming the editor's exported markdown helpers (`stripStableIds`,
  `inferContainmentFromMarkdown`, `parseChecklist`, `extractResourceLinks`). Define **one** "parenthood"
  helper and reuse it everywhere — the playbook flags definition-drift here as a real data-loss bug.
- **Real Hocuspocus server with JWT auth + `Uint8Array` load contract** `[P0 · L]` — `onLoadDocument`
  must return raw `Uint8Array` (never a reconstructed Y.Doc — copy the cross-realm `instanceof` regression
  test), debounced `onStoreDocument`, and `onAuthenticate` verifying a short-lived per-document JWT then
  re-checking lab membership. Add the token-mint route on the app side.
- **Auth + lab/project/submission domain model + navigable shell** `[P0 · L]` — lab is the unit of access;
  project/submission scoping becomes `SurfaceMeta` the host attaches (the create-handler must **not** assume
  `labId`/`projectId` exist package-side). Build the shell that lists labs/projects and opens an overview
  into the canvas.

### Headline features (P1)

- **Citations / bibliography** `[P1 · L]` — `.bib` import, a reference table, the `search()` that feeds the
  `@`-type-ahead from real entries, hover-card render, a references panel, and unknown-key flagging. Wire via
  `annotationRegistry` + `annotationContext`.
- **Project-global tasks: dedup reconciler + aggregated panel** `[P1 · L]` — checklist lines become
  project-global tasks deduped by text, with cross-document cancel scoping; the host owns the task table, the
  dedup reconciler inside `saveSurface`, and the aggregated panel.
- **HSM Levels view + decompose + final-text (Markdown/LaTeX)** `[P1 · XL]` — the flagship: a levels view, a
  "decompose" action branching a summary into Intro/Method/Results, and Final Text assembling leaf summaries
  into a draft. Port the HSM transforms from the reference (explicitly a _consumer_ of the generic canvas).
- **Export pipeline (full-draft markdown → LaTeX → PDF/DOCX)** `[P1 · L]` — assemble the surface+edge tree in
  branch order and convert; map `@key → \cite{key}` **after** LaTeX-escaping (order matters). _(Depends on HSM.)_

### Extended capabilities (P2–P3)

- **Cross-surface search** `[P2 · M]` — index the canonical markdown the reconciler produces + task/citation
  projections; jump to `(surfaceId, blockId)` via `HamCanvasHandle.focusBlock`.
- **Git-sync round-trip import/export** `[P2 · L]` — export to markdown files with embedded stable ids, edit in
  a checkout, re-import without losing identity. _(Forcing function for, and dependent on, the A2 block-id
  export.)_
- **LLM-assisted actions** `[P2 · L]` — agents that read the document graph and propose decompositions /
  summaries, applied through the same `createSurfaceFromBlock` / `setContent` paths a human uses (packages stay
  LLM-agnostic). Use the latest Claude models. _(Depends on HSM.)_
- **Versioning / history** `[P3 · M]` — periodic/named Yjs snapshots, revision list, diff/restore (restore via
  the A5 controlled-value prop or `setContent`).
- **Permissions & sharing** `[P3 · M]` — per-project roles, invites, read-only share links (`editable=false`),
  enforced at the `onAuthenticate` membership check.

---

## Suggested sequencing

1. **Clear the P0s** (save race, source-mode id orphaning, SSR gate, XSS) — they're correctness/adopter
   blockers and several are small.
2. **A7 release readiness + A6 coverage/failure-mode tests** in parallel — make the packages publishable and
   put a safety net under the changes that follow.
3. **A1 collab robustness + A4 connector-measure fix** — cheap, high-value hardening of the headline features.
4. **Begin Track B foundations** (app shell → persistence → collab server → auth/domain) — the product spine;
   it will exercise the packages and surface the real A5 extension-point needs.
5. **A2 content features (Figure, links, round-trip audit) + Track B headline features** — interleave, since the
   product validates the editor work.
6. **Scale work (A4 virtualization/zoom) and the P2–P3 long tail** as real usage demands it.

_This roadmap was generated from a multi-agent sweep of the repo, the deferred deep-review backlog, the spec/
playbook, and cross-cutting concerns. Effort/priority are estimates — revisit as the product direction firms up._
