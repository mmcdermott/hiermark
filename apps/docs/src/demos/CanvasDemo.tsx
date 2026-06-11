import { useMemo, useState } from "react";
import { HiermarkCanvas, type HiermarkCanvasProps } from "@hiermark/canvas";
import { createExampleAnnotationRegistry } from "@hiermark/editor";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { annotationContext, overviewCanvas } from "../lib/examples";

type Registry = HiermarkCanvasProps["annotationRegistry"];

const SOURCE = `import { HiermarkCanvas } from "@hiermark/canvas";
import "@hiermark/canvas/styles.css";

// The canvas owns layout; you own the data. \`surfaces\` + \`branchEdges\` are the
// tree, and \`handlers\` is how the canvas asks you to create/save surfaces when a
// block is branched. useDemoCanvas() here is a tiny in-memory host for the demo.
<HiermarkCanvas
  rootSurfaceId="s_root"
  surfaces={surfaces}
  branchEdges={branchEdges}
  handlers={handlers}
  behavior={{ deleteSurfacePolicy: "delete-subtree" }}
  layout={{ inactiveColumnMode: "card" }}
/>;`;

export function CanvasDemo() {
  const canvas = useDemoCanvas(overviewCanvas);
  const registry = useMemo(() => createExampleAnnotationRegistry() as Registry, []);
  const [expandAll, setExpandAll] = useState(false);

  return (
    <DemoFrame
      title="@hiermark/canvas — branch a block into a new surface"
      onReset={canvas.reset}
      source={SOURCE}
      controls={
        <label className="demo-toggle">
          <input
            type="checkbox"
            checked={expandAll}
            onChange={(e) => setExpandAll(e.target.checked)}
          />
          Keep columns expanded
        </label>
      }
    >
      <HiermarkCanvas
        key={canvas.resetToken}
        rootSurfaceId="s_root"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        annotationRegistry={registry}
        annotationContext={annotationContext}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
        layout={{ inactiveColumnMode: expandAll ? "expanded" : "card" }}
      />
    </DemoFrame>
  );
}
