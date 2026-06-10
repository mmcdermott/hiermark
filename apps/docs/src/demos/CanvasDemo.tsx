import { useMemo, useState } from "react";
import { HamCanvas, type HamCanvasProps } from "@ham/canvas";
import { createExampleAnnotationRegistry } from "@ham/editor";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { annotationContext, overviewCanvas } from "../lib/examples";

type Registry = HamCanvasProps["annotationRegistry"];

const SOURCE = `import { HamCanvas } from "@ham/canvas";
import "@ham/canvas/styles.css";

// The canvas owns layout; you own the data. \`surfaces\` + \`branchEdges\` are the
// tree, and \`handlers\` is how the canvas asks you to create/save surfaces when a
// block is branched. useDemoCanvas() here is a tiny in-memory host for the demo.
<HamCanvas
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
      title="@ham/canvas — branch a block into a new surface"
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
      <HamCanvas
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
