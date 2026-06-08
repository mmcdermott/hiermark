import type {
  HamActivePath,
  HamBranchEdge,
  HamCanvasLayoutConfig,
  HamConnectorState,
} from "../types";

export interface HamHoverTarget {
  surfaceId: string;
  blockId?: string | null;
}

export interface EdgeGeometry<EdgeMeta = unknown> {
  edge: HamBranchEdge<EdgeMeta>;
  from: { x: number; y: number };
  to: { x: number; y: number };
  path: string;
  state: HamConnectorState;
}

/**
 * Which edges to draw for a given connector mode. Pure over the topology so it
 * is unit-testable without the DOM. `"active"` shows the active lineage plus any
 * edge whose source *is* the active block ("where do this block's branches go").
 */
export function visibleEdges<E>(
  mode: HamCanvasLayoutConfig["showConnectors"],
  edges: HamBranchEdge<E>[],
  activePath: HamActivePath,
  hovered: HamHoverTarget | null,
): HamBranchEdge<E>[] {
  switch (mode) {
    case "off":
      return [];
    case "all":
      return edges;
    case "active": {
      const onPath = new Set(activePath.edgeIds);
      return edges.filter(
        (e) =>
          onPath.has(e.id) ||
          (e.fromSurfaceId === activePath.activeSurfaceId &&
            !!activePath.activeBlockId &&
            e.fromBlockId === activePath.activeBlockId),
      );
    }
    case "hover":
      if (!hovered) return [];
      return edges.filter(
        (e) =>
          e.fromSurfaceId === hovered.surfaceId &&
          (!hovered.blockId || e.fromBlockId === hovered.blockId),
      );
    default:
      return [];
  }
}

/** Styling state for an edge: on the active lineage, off an ancestor, or muted. */
export function connectorState<E>(
  edge: HamBranchEdge<E>,
  activePath: HamActivePath,
): HamConnectorState {
  if (activePath.edgeIds.includes(edge.id)) return "active";
  if (activePath.surfaceIds.includes(edge.fromSurfaceId)) return "ancestor";
  return "muted";
}

export interface RectLike {
  left: number;
  right: number;
  top: number;
  height: number;
}

/**
 * A horizontal cubic bezier from a source block's right-center to a target
 * card's left-center, in canvas-content coordinates (viewport rect + scroll).
 * Pure given the measured rects, so the path math is testable in isolation.
 */
export function geometryFor(
  fromRect: RectLike,
  toRect: RectLike,
  rootRect: { left: number; top: number },
  scroll: { left: number; top: number },
  curvature: number,
): { from: { x: number; y: number }; to: { x: number; y: number }; path: string } {
  const fx = fromRect.right - rootRect.left + scroll.left;
  const fy = fromRect.top + fromRect.height / 2 - rootRect.top + scroll.top;
  const tx = toRect.left - rootRect.left + scroll.left;
  const ty = toRect.top + toRect.height / 2 - rootRect.top + scroll.top;
  const dx = Math.max(40, (tx - fx) * curvature);
  const path = `M ${fx} ${fy} C ${fx + dx} ${fy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
  return { from: { x: fx, y: fy }, to: { x: tx, y: ty }, path };
}

/** Find an element by exact attribute value without selector interpolation
 * (surface/block ids may contain CSS-special characters). */
export function findByAttr(root: Element, attr: string, value: string): HTMLElement | null {
  const els = root.querySelectorAll<HTMLElement>(`[${attr}]`);
  for (const el of els) if (el.getAttribute(attr) === value) return el;
  return null;
}
