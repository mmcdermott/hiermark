import { useState } from "react";
import { HamCanvas } from "@ham/canvas";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { paperCanvas } from "../lib/examples";

export function PaperDemo() {
  const canvas = useDemoCanvas(paperCanvas);
  const [expandAll, setExpandAll] = useState(true);

  return (
    <DemoFrame
      title="Progressive decomposition — draft a paper by branching"
      onReset={canvas.reset}
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
        rootSurfaceId="s_paper"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
        layout={{ inactiveColumnMode: expandAll ? "expanded" : "card" }}
      />
    </DemoFrame>
  );
}
