import { useMemo, useState } from "react";
import { HamCanvas, type HamCanvasProps, type HamConnectorRenderProps } from "@ham/canvas";
import { createExampleAnnotationRegistry } from "@ham/editor";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { annotationContext, galleryCanvas } from "../lib/examples";

type Registry = HamCanvasProps["annotationRegistry"];
const useRegistry = () => useMemo(() => createExampleAnnotationRegistry() as Registry, []);

/**
 * Focus / sidebar: editing one document collapses the others to a narrow rail of
 * titles — you keep "where this one lives" (its ancestors and siblings) in view
 * while the active surface fills the rest. inactiveColumnMode "rail" +
 * activeColumnMode "expanded" (the active column flex-grows to fill).
 */
export function FocusSidebarDemo() {
  const canvas = useDemoCanvas(galleryCanvas);
  const registry = useRegistry();
  // Controlled active so the example opens already focused on a deep document,
  // and clicking a sidebar title re-focuses.
  const [active, setActive] = useState("s_deep");

  return (
    <DemoFrame
      title="Focus / sidebar — the others collapse to titles"
      onReset={canvas.reset}
      height={460}
    >
      <HamCanvas
        key={canvas.resetToken}
        rootSurfaceId="s_root"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        annotationRegistry={registry}
        annotationContext={annotationContext}
        activeSurfaceId={active}
        onActiveChange={({ surfaceId }) => setActive(surfaceId)}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
        layout={{
          appearance: "card",
          inactiveColumnMode: "rail",
          activeColumnMode: "expanded",
          showConnectors: "active",
        }}
      />
    </DemoFrame>
  );
}

/**
 * Flat manuscript: a warm, serif theme where the levels flow as one continuous
 * document — flat appearance, per-column scroll, group headers, no card chrome.
 */
export function FlatManuscriptDemo() {
  const canvas = useDemoCanvas(galleryCanvas);
  const registry = useRegistry();
  return (
    <DemoFrame
      title="Flat manuscript — levels as one continuous document"
      onReset={canvas.reset}
      height={460}
    >
      <HamCanvas
        key={canvas.resetToken}
        className="theme-manuscript"
        rootSurfaceId="s_root"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        annotationRegistry={registry}
        annotationContext={annotationContext}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
        layout={{
          appearance: "flat",
          inactiveColumnMode: "expanded",
          columnScroll: true,
          showGroupHeaders: true,
          showConnectors: "off",
        }}
      />
    </DemoFrame>
  );
}

/** Bold, themed connector for the topology map. */
function MapConnector({ path, state }: HamConnectorRenderProps) {
  const stroke = state === "active" ? "#2bb673" : state === "ancestor" ? "#37a0c4" : "#9aa6b2";
  return (
    <path
      d={path}
      fill="none"
      stroke={stroke}
      strokeWidth={state === "active" ? 3 : 2}
      strokeLinecap="round"
    />
  );
}

/**
 * Topology map: a cool, chrome-light bird's-eye view of the whole tree — plain
 * appearance, every surface as a compact outline, and bold connectors drawn for
 * every edge (a custom Connector slot).
 */
export function TopologyMapDemo() {
  const canvas = useDemoCanvas(galleryCanvas);
  const registry = useRegistry();
  return (
    <DemoFrame
      title="Topology map — the whole tree at a glance"
      onReset={canvas.reset}
      height={460}
    >
      <HamCanvas
        key={canvas.resetToken}
        className="theme-map"
        rootSurfaceId="s_root"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        annotationRegistry={registry}
        annotationContext={annotationContext}
        slots={{ Connector: MapConnector }}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
        layout={{
          appearance: "plain",
          inactiveColumnMode: "outline",
          showConnectors: "all",
          connectorCurvature: 0.8,
        }}
      />
    </DemoFrame>
  );
}
