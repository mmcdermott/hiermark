import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { ComponentType } from "react";

import type {
  HamActivePath,
  HamBranchEdge,
  HamCanvasLayoutConfig,
  HamConnectorRenderProps,
} from "../types";
import {
  connectorState,
  findByAttr,
  geometryFor,
  visibleEdges,
  type EdgeGeometry,
  type HamHoverTarget,
} from "./connectors";

/** Default connector: a themed bezier path classed by its active-path state. */
export function DefaultConnector({ path, state, edge }: HamConnectorRenderProps) {
  return (
    <path
      className={`ham-branch-connector ham-branch-connector-${state}`}
      d={path}
      fill="none"
      data-edge-id={edge.id}
    />
  );
}

interface OverlayProps<EdgeMeta = unknown> {
  rootRef: RefObject<HTMLDivElement | null>;
  edges: HamBranchEdge<EdgeMeta>[];
  activePath: HamActivePath;
  layout: HamCanvasLayoutConfig;
  hovered: HamHoverTarget | null;
  /** Identity changes whenever columns / snapshots reshape, forcing a re-measure. */
  reshapeKey: string;
  /** Only the EdgeMeta-typed Connector slot is relevant to the overlay. */
  slots?: { Connector?: ComponentType<HamConnectorRenderProps<EdgeMeta>> } | undefined;
}

/**
 * One SVG overlay drawing a path per branch edge, from each source block's DOM
 * rect to its child surface card. Mounted as the last child of `.ham-canvas`
 * (which is `position: relative`), sized to the scroll-content box so paths
 * live in content coordinates and scroll with the columns for free.
 */
export function HamConnectorsOverlay<EdgeMeta = unknown>({
  rootRef,
  edges,
  activePath,
  layout,
  hovered,
  reshapeKey,
  slots,
}: OverlayProps<EdgeMeta>) {
  const mode = layout.showConnectors;
  const curvature = layout.connectorCurvature ?? 0.5;

  const shown = useMemo(
    () => visibleEdges(mode, edges, activePath, hovered),
    [mode, edges, activePath, hovered],
  );

  const [geom, setGeom] = useState<EdgeGeometry<EdgeMeta>[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const raf = useRef(0);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const scroll = { left: root.scrollLeft, top: root.scrollTop };
    const out: EdgeGeometry<EdgeMeta>[] = [];
    for (const edge of shown) {
      const card = findByAttr(root, "data-surface-id", edge.fromSurfaceId);
      // Anchor to the source block when its editor is mounted, else the card.
      const fromEl = (card && findByAttr(card, "data-block-id", edge.fromBlockId)) ?? card;
      const toEl = findByAttr(root, "data-surface-id", edge.toSurfaceId);
      if (!fromEl || !toEl) continue;
      const g = geometryFor(
        fromEl.getBoundingClientRect(),
        toEl.getBoundingClientRect(),
        rootRect,
        scroll,
        curvature,
      );
      out.push({ edge, ...g, state: connectorState(edge, activePath) });
    }
    setGeom(out);
    setSize({
      w: Math.max(root.scrollWidth, root.clientWidth),
      h: Math.max(root.scrollHeight, root.clientHeight),
    });
  }, [rootRef, shown, curvature, activePath]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(measure);
  }, [measure]);

  // Re-measure synchronously after any layout-affecting change (edges shown,
  // columns reshaped, active path moved) before the browser paints.
  useLayoutEffect(() => {
    if (mode !== "off") measure();
  }, [mode, measure, reshapeKey]);

  // Observe geometry sources: the root and every anchor element. Observing the
  // anchors (not just the root) is what makes typing-into-a-block move its line
  // without a scroll/resize event. Re-subscribe when the layout reshapes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode === "off" || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    root.querySelectorAll("[data-surface-id],[data-block-id]").forEach((el) => ro.observe(el));
    const onScroll = () => schedule();
    // Capture phase so a column's own vertical scroll (layout.columnScroll), which
    // doesn't bubble, also re-measures — otherwise lines lag a scrolled column.
    root.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      root.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf.current);
    };
  }, [rootRef, mode, schedule, reshapeKey]);

  if (mode === "off") return null;
  const Connector = slots?.Connector ?? DefaultConnector;
  return (
    <svg
      className="ham-connectors"
      width={size.w || undefined}
      height={size.h || undefined}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {geom.map((g) => (
        <Connector
          key={g.edge.id}
          edge={g.edge}
          path={g.path}
          from={g.from}
          to={g.to}
          state={g.state}
        />
      ))}
    </svg>
  );
}
