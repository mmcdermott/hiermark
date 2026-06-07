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
          "# EQ-based forecasting\n\nWe show that EQ-based forecasting beats the baseline on eICU.\n\n## Background\n\nClinical forecasting is hard; calibration matters.\n\n## Experiment plan\n\n- [ ] pull the eICU cohort\n- [ ] train the EQ model\n- [ ] evaluate calibration\n\nHover a block and click ↳ to branch it into its own surface.",
      },
    },
  },
  branchEdges: [],
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
