import type { DemoCanvasState } from "./demoHost";
import type { HamExampleAnnotationContext } from "@ham/editor";

export const annotationContext: HamExampleAnnotationContext = {
  references: {
    vaswani2017: { title: "Attention Is All You Need", year: 2017 },
    eq2024: { title: "EQ-based forecasting on eICU", year: 2024 },
  },
  people: {
    alice: { name: "Alice Researcher" },
    bob: { name: "Bob Engineer" },
  },
};

export const annotatedMarkdown = `# Related work

The transformer was introduced by @vaswani2017 and remains the backbone of
modern forecasting. See https://arxiv.org/abs/1706.03762 for the original paper.
Ask @alice to double-check the eICU cohort.

## Tasks

- [ ] summarize @vaswani2017
- [x] import the .bib file
- [ ] reproduce the EQ baseline ($AUROC > 0.85$)
`;

/** A project overview with two branchable sections — the canvas starting point. */
export const overviewCanvas: DemoCanvasState = {
  surfaces: {
    s_root: {
      id: "s_root",
      rootBlockId: "blk_root",
      title: "Project overview",
      content: {
        kind: "markdown",
        markdown:
          "# EQ-based forecasting\n\nWe show that EQ-based forecasting beats the baseline on eICU.\n\n## Background\n\nClinical forecasting is hard; calibration matters.\n\n## Experiment plan\n\n- [ ] pull the eICU cohort\n- [ ] train the EQ model\n- [ ] evaluate calibration\n\nHover a block and click the + on its right to branch it into its own surface.",
      },
    },
  },
  branchEdges: [],
};

/**
 * A pre-grown tree (root → a sibling group of three + a second branch → a
 * grandchild) so the styling gallery shows connectors and the add-sibling rail
 * immediately, without having to branch first.
 */
const child = (id: string, title: string, body: string): DemoCanvasState["surfaces"][string] => ({
  id,
  rootBlockId: `${id}_root`,
  title,
  content: { kind: "markdown", markdown: `# ${title}\n\n${body}` },
});

// Tiptap-JSON block helpers so anchor blocks carry STABLE ids matching the edges
// below — that's what makes block-anchored connectors, hover, and the group-header
// provenance preview resolve to real blocks (a markdown seed gets random ids).
const heading = (level: number, text: string, dataBlockId?: string) => ({
  type: "heading",
  attrs: { level, ...(dataBlockId ? { dataBlockId } : {}) },
  content: [{ type: "text", text }],
});
const para = (text: string, dataBlockId?: string) => ({
  type: "paragraph",
  ...(dataBlockId ? { attrs: { dataBlockId } } : {}),
  content: [{ type: "text", text }],
});

export const galleryCanvas: DemoCanvasState = {
  surfaces: {
    s_root: {
      id: "s_root",
      rootBlockId: "blk_root",
      title: "Roadmap",
      content: {
        kind: "tiptap-json",
        json: {
          type: "doc",
          content: [
            heading(1, "Product roadmap"),
            para("Where the project is heading this year."),
            heading(2, "Q1 goals", "blk_q1"),
            para("Ship the core editor and canvas."),
            heading(2, "Q2 goals", "blk_q2"),
            para("Collaboration and offline sync."),
          ],
        },
      },
    },
    s_q1a: child("s_q1a", "Editor MVP", "Block ids, snapshots, the branch gutter."),
    s_q1b: child("s_q1b", "Canvas MVP", "Columns, active path, reorder."),
    s_q1c: child("s_q1c", "Docs site", "Live demos and an API reference."),
    s_q2a: {
      id: "s_q2a",
      rootBlockId: "s_q2a_root",
      title: "Realtime",
      content: {
        kind: "tiptap-json",
        json: {
          type: "doc",
          content: [
            heading(1, "Realtime"),
            para("Yjs-backed collaborative surfaces.", "blk_q2a_body"),
          ],
        },
      },
    },
    s_deep: child("s_deep", "CRDT notes", "Why Yjs, and how snapshots reconcile."),
  },
  // Three siblings off the Q1 heading (a visible add-sibling rail), one off Q2,
  // and a grandchild so there are three columns of connectors. fromBlockId values
  // match the stable dataBlockId attrs seeded above.
  branchEdges: [
    { id: "e_q1a", fromSurfaceId: "s_root", fromBlockId: "blk_q1", toSurfaceId: "s_q1a", order: 0 },
    { id: "e_q1b", fromSurfaceId: "s_root", fromBlockId: "blk_q1", toSurfaceId: "s_q1b", order: 1 },
    { id: "e_q1c", fromSurfaceId: "s_root", fromBlockId: "blk_q1", toSurfaceId: "s_q1c", order: 2 },
    { id: "e_q2a", fromSurfaceId: "s_root", fromBlockId: "blk_q2", toSurfaceId: "s_q2a", order: 0 },
    {
      id: "e_deep",
      fromSurfaceId: "s_q2a",
      fromBlockId: "blk_q2a_body",
      toSurfaceId: "s_deep",
      order: 0,
    },
  ],
};

/** A single-paragraph paper, to grow by progressive decomposition. */
export const paperCanvas: DemoCanvasState = {
  surfaces: {
    s_paper: {
      id: "s_paper",
      rootBlockId: "blk_paper",
      title: "Paper (thesis)",
      content: {
        kind: "markdown",
        markdown:
          "# Thesis\n\nWe show that EQ-based forecasting beats the baseline on eICU.\n\nBranch this paragraph into Intro / Method / Results, then branch each of those again. The canvas lays the argument out as *levels left → right, sections top → down*.",
      },
    },
  },
  branchEdges: [],
};
