import { HamCanvas } from "@ham/canvas";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { paperCanvas } from "../lib/examples";

export function PaperDemo() {
  const canvas = useDemoCanvas(paperCanvas);
  return (
    <DemoFrame
      title="Progressive decomposition — draft a paper by branching"
      onReset={canvas.reset}
    >
      <HamCanvas
        rootSurfaceId="s_paper"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
      />
    </DemoFrame>
  );
}
