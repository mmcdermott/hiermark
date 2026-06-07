import { useMemo } from "react";
import { HamCanvas, type HamCanvasProps } from "@ham/canvas";
import { createExampleAnnotationRegistry } from "@ham/editor";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { annotationContext, overviewCanvas } from "../lib/examples";

type Registry = HamCanvasProps["annotationRegistry"];

export function CanvasDemo() {
  const canvas = useDemoCanvas(overviewCanvas);
  const registry = useMemo(() => createExampleAnnotationRegistry() as Registry, []);

  return (
    <DemoFrame title="@ham/canvas — branch a block into a new surface" onReset={canvas.reset}>
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        annotationRegistry={registry}
        annotationContext={annotationContext}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
      />
    </DemoFrame>
  );
}
