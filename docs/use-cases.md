# Research Lab Manager — Example Use Cases

A plain-language tour of what the product is _for_, written as design input for
pulling the internal packages out and building them in isolation. Each scenario
notes which internal capability (and therefore which candidate package) it leans
on, so the package boundaries can be drawn around real usage rather than the
current incidental structure.

## The one-sentence model

Everything is one **document tree**. A "document" is a piece of prose (markdown);
any **block** inside it (a paragraph, a heading and its section, a checklist) can
be **branched** into a child document that elaborates it. The same tree is shown
two ways — a free-form **overview** and a depth-ranked **hierarchical summary** —
and edited with the same collaborative editor. Sidecar structure (tasks,
citations, links, provenance) rides alongside the markdown and reconciles to it
by stable key.

---

## 1. Draft a paper by progressive decomposition (the Hierarchical Summary)

A researcher starts a new paper as a single paragraph: "We show that EQ-based
forecasting beats the baseline on eICU." They **decompose** that summary into its
parts — Intro, Method, Results — each a child document one level deeper. Each of
those decomposes again (Method → Data, Model, Eval). The **Levels view** lays the
tree out as _levels left→right, sections top→down_, so you can read the whole
argument at any altitude. When the leaves are written, **Final Text** assembles
them (in order, with headings) into a complete draft, in markdown or LaTeX.

_Leans on:_ the pure tree model + topology ops (`doc-tree`), the levels/grid
layout (`doc-grid` + layout), the HSM assemble/outline transforms (`hsm-format`).

## 2. Run a project from an overview document

A project has an **overview** document. From any paragraph or heading the
researcher branches a **sub-document** — "expand this experiment", "spin out
related work" — and it appears in the next column. They navigate the resulting
**breadth × depth** grid, dragging cards to reparent or reorder them. The overview
and the HSM are the _same_ machinery with different presentation (no "Level N"
labels, roomier cards, any-block branching vs. root-only).

_Leans on:_ block-anchored branching + provenance edges, the shared grid/card with
per-view presentation props, drag-to-reparent/reorder topology ops.

## 3. Branch an idea from a specific block (provenance)

When the researcher branches "Assess EQ performance on eICU" into its own
document, the system records _where it came from_ — a `branches_from` edge anchored
to that source block. Later, a heading that owns a whole subsection can itself be
branched, taking its section's internal-children structure along (conceptually —
the relationships are recorded, not the text copied). This is what later powers
"show me everything that descended from this paragraph."

_Leans on:_ the anchored-graph data model (documents + edges with block/span
anchors), heading-based block containment.

## 4. Turn prose checklists into tracked work

Anywhere in any document, the researcher types `- [ ] pull the eICU cohort`. It
becomes a **tracked task** with assignee, due date, priority, and status — without
leaving the prose. Tasks are **project-global and deduped by text**: the same line
in three documents is one task, and checking it off once checks it off
everywhere; deleting it from one document does _not_ delete it while another
document still has it. A tasks panel aggregates them.

_Leans on:_ the markdown reconciler (checklist → task, by stable key) and the
task sidecar model. This is the canonical example of "markdown is canonical for
what markdown expresses; sidecars own the rest, reconciled by key, never
delete-and-rebuild."

## 5. Cite the literature inline

The researcher imports a `.bib` file, then writes `@vaswani2017` in the prose. In
the editor it renders as a **citation pill** with autocomplete and a hover card;
in read mode it's a clickable link to the source. A references panel lists the
bibliography and flags unknown keys.

_Leans on:_ the editor's entity-decoration framework (recognizer × placement),
the citation entity, and the references layer.

## 6. Write math and rich structure

Equations (`$...$`, `$$...$$`) render with KaTeX; tables, nested lists, and task
lists all round-trip through the same canonical markdown. The editor and the
read-mode renderer agree on the grammar.

_Leans on:_ the markdown engine (canonical grammar + projection) and the editor's
math/markdown extensions.

## 7. Collaborate live

Two lab members open the same document and edit it at once — cursors, merges, and
offline reconnect handled by a CRDT. The relational projection (blocks, tasks,
citations) stays in sync with the collaborative content.

_Leans on:_ the editor's collaboration adapter (today Hocuspocus/Yjs, behind an
injected interface) and the two-sources-of-truth reconciliation (CRDT content vs.
relational projection).

## 8. Navigate long documents by folding

A long section can be **collapsed** at its heading and expanded again — folding is
view-only (it hides, never deletes), keyed to the block so it survives edits
elsewhere. This is the editor-side payoff of heading-based block containment.

_Leans on:_ block containment (heading-stack sectioning) + the editor fold
extension.

## 9. Organize across the lab

Documents live under **projects** and **submissions** within a **lab** (the unit of
access). A lab member sees the lab's projects, each project's overview + its
hierarchical summaries, references, and tasks.

_Leans on:_ the app shell + lab/project/submission scoping (application layer, not
a reusable package).

---

## On the horizon (informs the package seams now)

- **git-sync round-trip** — export the document tree to plain markdown files,
  edit them in a checkout, and re-import without losing block/task/branch
  identity. This is the forcing function for making stable IDs _markdown-portable_
  (today block identity flows through the editor out-of-band; task identity already
  round-trips).
- **LLM tools over the graph** — agents that read/write the document graph, search
  it, and propose decompositions or summaries.
- **Calibration in-workflow** — the original "research calibration tracker" concept
  (forecasts/outcomes) folded into the same document/task model.

---

## What this implies for the package split

The scenarios cluster into a few stable capabilities that want to be built and
tested in isolation:

1. **Pure document topology** — the tree/graph types and immutable ops, with edge
   identity and anchor metadata preserved (scenarios 1–3). _No React, no DB._
2. **The canonical markdown engine** — projection, reconciliation, stable-id
   grammar, checklist/citation/resource extraction (scenarios 4–6). _Pure._
3. **The collaborative block editor** — Tiptap + entity-decoration framework +
   block id/gutter/fold extensions, with collaboration and persistence behind
   injected adapters so it doesn't hard-depend on Hocuspocus (scenarios 5–8).
4. **The grid / canvas** — the levels/overview layout + interaction (select,
   branch, reparent, reorder, collapse), driven by props, ideally with accessible
   interaction primitives (scenarios 1–2, 8).
5. **HSM transforms** — outline + final-text assembly over the tree (scenario 1).

The application (lab/project/submission shell, auth, API routes, the relational
projection) sits on top and wires these together. The current packages
(`@rlm/doc-tree`, `@rlm/markdown-engine`, `@rlm/hsm-format`, `@rlm/doc-grid`,
`@rlm/editor`) are a first cut at this split; the open seams to close when
extracting them for isolated builds are: tree-vs-graph (preserve edge/anchor
identity through the boundary), provider-agnostic collaboration, and a
graph/edge-oriented grid API rather than a plain-tree one.
