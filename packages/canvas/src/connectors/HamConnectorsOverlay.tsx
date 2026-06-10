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
  /**
   * Changes only when the *set* of anchor elements changes (columns, display
   * modes, edge endpoints) — not the active path. Drives the ResizeObserver
   * re-subscription so moving the cursor doesn't re-observe every anchor.
   */
  geometryKey: string;
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
  geometryKey,
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

  // Volatile measure inputs flow through a ref so `measure` (and `schedule`)
  // keep ONE identity: the ResizeObserver effect below depends on `schedule`,
  // and a hover/active-path churned identity used to re-subscribe every anchor
  // on each cursor move — exactly what geometryKey exists to prevent.
  const measureInputsRef = useRef({ shown, curvature, activePath });
  measureInputsRef.current = { shown, curvature, activePath };

  const measure = useCallback(() => {
    const { shown, curvature, activePath } = measureInputsRef.current;
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const scroll = { left: root.scrollLeft, top: root.scrollTop };

    // Index the anchor elements ONCE per pass (was findByAttr per edge — an
    // O(edges · N) querySelectorAll+scan; this makes a measure pass linear).
    const surfaceEls = new Map<string, HTMLElement>();
    // Blocks are keyed by `surfaceId\0blockId` — block ids are surface-scoped
    // (e.g. every surface has a `blk_root`), so a global key would collide.
    const blockEls = new Map<string, HTMLElement>();
    const chipEls = new Map<string, HTMLElement>(); // child surfaceId → chip
    root.querySelectorAll<HTMLElement>("[data-surface-id]").forEach((el) => {
      const id = el.getAttribute("data-surface-id");
      if (id && !surfaceEls.has(id)) surfaceEls.set(id, el);
    });
    root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      const blockId = el.getAttribute("data-block-id");
      const sid = el.closest("[data-surface-id]")?.getAttribute("data-surface-id");
      if (!blockId || !sid) return;
      const key = `${sid}\0${blockId}`;
      if (!blockEls.has(key)) blockEls.set(key, el);
    });
    root.querySelectorAll<HTMLElement>("[data-ham-branch-child]").forEach((el) => {
      const id = el.getAttribute("data-ham-branch-child");
      if (id && !chipEls.has(id)) chipEls.set(id, el);
    });

    const out: EdgeGeometry<EdgeMeta>[] = [];
    for (const edge of shown) {
      // Prefer the branch-child chip (the "bubble" naming the child) as the
      // anchor, then the source block, then the card — so the line springs from
      // the chip's edge rather than the block's far right edge.
      const fromEl =
        chipEls.get(edge.toSurfaceId) ??
        blockEls.get(`${edge.fromSurfaceId}\0${edge.fromBlockId}`) ??
        surfaceEls.get(edge.fromSurfaceId);
      const toEl = surfaceEls.get(edge.toSurfaceId);
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      // A display:none anchor measures 0×0 at the viewport origin — drawing
      // to it smears a degenerate bezier across the canvas. Skip until shown.
      if (
        (fromRect.width === 0 && fromRect.height === 0) ||
        (toRect.width === 0 && toRect.height === 0)
      ) {
        continue;
      }
      const g = geometryFor(fromRect, toRect, rootRect, scroll, curvature);
      out.push({ edge, ...g, state: connectorState(edge, activePath) });
    }
    setGeom(out);
    setSize({
      w: Math.max(root.scrollWidth, root.clientWidth),
      h: Math.max(root.scrollHeight, root.clientHeight),
    });
  }, [rootRef]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(measure);
  }, [measure]);

  // Re-measure synchronously after any layout-affecting change (edges shown,
  // columns reshaped, active path moved, hover set changed) before paint.
  useLayoutEffect(() => {
    if (mode !== "off") measure();
  }, [mode, measure, reshapeKey, shown]);

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
    // geometryKey (not reshapeKey) — re-subscribe only when the anchor set
    // changes, not on every cursor/active-path move.
  }, [rootRef, mode, schedule, geometryKey]);

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
