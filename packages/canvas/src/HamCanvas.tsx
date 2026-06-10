import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  HamEditor,
  type HamBranchChildSummary,
  type HamEditorHandle,
  type HamSurfaceSnapshot,
} from "@ham/editor";

import { resolveBehavior, resolveLayout } from "./defaults";
import { devWarn } from "./devWarn";
import { useHamCanvas } from "./useHamCanvas";
import { HamConnectorsOverlay } from "./connectors/HamConnectorsOverlay";
import type { HamHoverTarget } from "./connectors/connectors";
import { siblingEdgeOrder } from "./topology/siblingOrder";
import type {
  HamAddSiblingButtonProps,
  HamCanvasColumn,
  HamCanvasItem,
  HamCanvasProps,
  HamGroupHeaderProps,
  HamSurfaceId,
} from "./types";

/**
 * Default add-sibling affordance — a quiet `+` in the gap between sibling
 * surfaces (and below the last). Mirrors the editor's branch button: same glyph,
 * `onMouseDown` preventDefault (so it doesn't steal focus), quiet-until-hover.
 */
function DefaultAddSiblingButton({ isAppend, onAddSibling }: HamAddSiblingButtonProps) {
  const label = isAppend ? "Add a sibling branch" : "Insert a sibling branch here";
  return (
    <div className="ham-add-sibling-rail">
      <button
        type="button"
        className="ham-add-sibling"
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          onAddSibling();
        }}
      >
        +
      </button>
    </div>
  );
}

/** Branch policy used when `behavior.enableBranchCreation` is false — nothing
 * is branchable, so the editor renders no gutter affordances. Module-level so
 * its identity is stable across renders. */
const NO_BRANCH = "off" as const;

/** Smooth scroll, unless the user prefers reduced motion (then jump). */
function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** How much width each display mode wants, low → high. A column sizes to its
 * widest surface's mode (via the `data-col-mode` attribute + CSS). */
const DISPLAY_MODE_RANK: Record<HamCanvasItem["displayMode"], number> = {
  hidden: 0,
  rail: 1,
  outline: 2,
  card: 3,
  expanded: 4,
};

/**
 * Default sibling-group provenance header — a breadcrumb naming the parent
 * surface (and anchor block, if known) a group of surfaces branches from.
 */
function DefaultGroupHeader({
  parentSurface,
  parentSurfaceId,
  anchorPreview,
  onActivateParent,
}: HamGroupHeaderProps) {
  const parent = parentSurface?.title ?? parentSurfaceId;
  return (
    <button type="button" className="ham-group-header" onClick={onActivateParent} title={parent}>
      <span className="ham-group-header-arrow">↳</span>
      <span className="ham-group-header-parent">{parent}</span>
      {anchorPreview ? <span className="ham-group-header-anchor"> · {anchorPreview}</span> : null}
    </button>
  );
}

function childrenForSurface(
  surfaceId: HamSurfaceId,
  props: HamCanvasProps,
  activeSurfaceSet: Set<HamSurfaceId>,
): Record<string, HamBranchChildSummary[]> {
  const out: Record<string, HamBranchChildSummary[]> = {};
  for (const edge of props.branchEdges) {
    if (edge.fromSurfaceId !== surfaceId) continue;
    const summary: HamBranchChildSummary = {
      edgeId: edge.id,
      surfaceId: edge.toSurfaceId,
      order: edge.order,
      ...(props.surfaces[edge.toSurfaceId]?.title
        ? { title: props.surfaces[edge.toSurfaceId]!.title }
        : {}),
      active: activeSurfaceSet.has(edge.toSurfaceId),
    };
    (out[edge.fromBlockId] ??= []).push(summary);
  }
  return out;
}

interface ItemProps {
  item: HamCanvasItem;
  canvas: ReturnType<typeof useHamCanvas>;
  props: HamCanvasProps;
  sortable: boolean;
  depth: number;
  /** 1-based position among this column's surfaces (ARIA tree). */
  posinset: number;
  /** Total surfaces in this column (ARIA tree). */
  setsize: number;
}

function SurfaceItem({ item, canvas, props, sortable, depth, posinset, setsize }: ItemProps) {
  const surface = item.surface;
  const hasChildren = props.branchEdges.some((e) => e.fromSurfaceId === surface.id);
  const collapsed = canvas.collapsedSurfaceIds.has(surface.id);
  const edgeId = item.incomingEdge?.id ?? surface.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: edgeId,
    disabled: !sortable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const pending = canvas.pendingSurfaceIds.has(surface.id);
  const activeSurfaceSet = useMemo(
    () => new Set(canvas.activePath.surfaceIds),
    [canvas.activePath.surfaceIds],
  );

  // Debounced persistence through the host's saveSurface handler.
  const handleRef = useRef<HamEditorHandle | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSurfaceRef = useRef(props.handlers.saveSurface);
  saveSurfaceRef.current = props.handlers.saveSurface;
  const onOperationErrorRef = useRef(props.onOperationError);
  onOperationErrorRef.current = props.onOperationError;
  // Serialize saves so the host never receives overlapping/out-of-order writes:
  // only one save is in flight at a time, and any save requested while one is
  // running coalesces into exactly one follow-up with the latest content (so the
  // newest snapshot always wins, fixing the unmount/remount + double-timer race).
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const unmountedRef = useRef(false);
  const runSave = () => {
    const handle = handleRef.current;
    const save = saveSurfaceRef.current;
    if (!handle || !save) return;
    if (savingRef.current) {
      pendingRef.current = true; // coalesce: re-save once the in-flight one settles
      return;
    }
    savingRef.current = true;
    pendingRef.current = false;
    void handle
      .save()
      .then((payload) => save(payload))
      .catch((error: unknown) =>
        onOperationErrorRef.current?.({ type: "save-surface", surfaceId: surface.id, error }),
      )
      .finally(() => {
        savingRef.current = false;
        // Re-save the latest content if more edits arrived mid-save — but not
        // after unmount (the editor handle is being torn down).
        if (pendingRef.current && !unmountedRef.current) runSave();
      });
  };
  const scheduleSave = () => {
    if (!saveSurfaceRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(runSave, 800);
  };
  // Flush any pending edit on unmount so edits aren't lost when the surface
  // leaves the projection (navigation/reshape), not only when the timer fires.
  // If a save is already in flight it has captured ~current content, so we let it
  // finish rather than chain another through the unmounting editor.
  useEffect(
    () => () => {
      unmountedRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (!savingRef.current) runSave();
    },
    // runSave reads everything via refs; safe to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const frameClass = [
    "ham-surface",
    `ham-surface-${item.pathState}`,
    `ham-surface-mode-${item.displayMode}`,
    pending ? "ham-surface-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Slots (spec §6.11): the canvas keeps the outer treeitem <div> (ref/role/aria/dnd)
  // and lets a slot own the chrome inside. Omitted slots fall back to defaults.
  const Frame = props.slots?.SurfaceFrame;
  const HeaderSlot = props.slots?.SurfaceHeader;
  const PreviewSlot = props.slots?.SurfacePreview;
  const behavior = resolveBehavior(props.behavior);
  const onActivate = () => canvas.actions.activate(surface.id, null);
  // Affordances honor the behavior flags, not just handler presence.
  const canDelete =
    !!item.incomingEdge && !!props.handlers.deleteSurface && behavior.enableSurfaceDeletion;
  const canAddSiblingFromHeader =
    !!item.incomingEdge &&
    !!props.handlers.createSiblingSurface &&
    behavior.enableSiblingBranchCreation;

  const previewNode = PreviewSlot ? (
    <PreviewSlot item={item} onActivate={onActivate} />
  ) : (
    <button type="button" className="ham-surface-preview" onClick={onActivate}>
      {previewText(surface.content)}
    </button>
  );

  const defaultHeader = (
    // A plain div (not <header>) — a card header is not a page `banner` landmark.
    <div className="ham-surface-header">
      <button
        type="button"
        className="ham-surface-collapse"
        aria-label={collapsed ? "Expand surface" : "Collapse surface"}
        aria-expanded={collapsed ? "false" : "true"}
        onClick={() => canvas.actions.toggleCollapsed(surface.id)}
      >
        {collapsed ? "▸" : "▾"}
      </button>
      {sortable && (
        <button
          type="button"
          className="ham-surface-drag"
          aria-label="Reorder surface"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
      )}
      <span className="ham-surface-title">{surface.title ?? "Untitled"}</span>
      <span className="ham-surface-spacer" />
      {pending && (
        <span className="ham-surface-spinner" role="status" aria-label="Saving…" title="Saving…" />
      )}
      {item.pathState !== "active" && (
        <button type="button" className="ham-surface-open" onClick={onActivate}>
          Open
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="ham-surface-delete"
          aria-label="Delete surface"
          onClick={() => void canvas.actions.removeSurface(surface.id)}
        >
          ×
        </button>
      )}
    </div>
  );

  const header = HeaderSlot ? (
    <HeaderSlot
      item={item}
      onActivate={onActivate}
      {...(canDelete ? { onDelete: () => void canvas.actions.removeSurface(surface.id) } : {})}
      {...(canAddSiblingFromHeader
        ? {
            onAddSibling: () =>
              void canvas.actions.addSibling(
                item.incomingEdge!.fromSurfaceId,
                item.incomingEdge!.fromBlockId,
              ),
          }
        : {})}
    />
  ) : (
    defaultHeader
  );

  const bodyContent: ReactNode =
    item.displayMode === "expanded" ? (
      <HamEditor
        // Host-provided editor defaults flow through first; the canvas-owned
        // wiring below (content, branch handlers, snapshot) always wins.
        {...props.editorDefaults}
        surfaceId={surface.id}
        rootBlockId={surface.rootBlockId}
        value={surface.content}
        {...(surface.title !== undefined ? { title: surface.title } : {})}
        editable={!surface.readonly}
        activeBlockId={canvas.activeBlockId}
        branchChildren={childrenForSurface(surface.id, props, activeSurfaceSet)}
        // Disabling branch creation hides every gutter affordance (the action
        // is guarded too); otherwise use the configured policy.
        branchPolicy={behavior.enableBranchCreation ? behavior.branchPolicy : NO_BRANCH}
        {...(props.annotationRegistry ? { annotations: props.annotationRegistry } : {})}
        {...(props.annotationContext !== undefined
          ? { annotationContext: props.annotationContext }
          : {})}
        onReady={(handle) => {
          handleRef.current = handle;
          // Seed the snapshot cache immediately so this surface's child
          // column orders by document preorder before any edit.
          canvas.actions.updateSnapshot(surface.id, handle.getSnapshot());
        }}
        onChange={scheduleSave}
        onBranchRequest={(event) => void canvas.actions.branchFromBlock(event)}
        onSnapshotChange={(snapshot) => canvas.actions.updateSnapshot(surface.id, snapshot)}
        onActiveBlockChange={(blockId) => canvas.actions.activate(surface.id, blockId)}
        onOpenBranchChild={(e) => canvas.actions.activate(e.childSurfaceId, null)}
      />
    ) : (
      // Inactive cards (outline / card / rail). A SurfaceBody slot can replace
      // this without touching the editor mount above.
      (() => {
        const defaultBody: ReactNode =
          item.displayMode === "outline" ? (
            <OutlineBody
              surfaceId={surface.id}
              snapshot={canvas.snapshotsBySurfaceId[surface.id]}
              fallbackPreview={previewNode}
              onActivate={onActivate}
            />
          ) : item.displayMode === "rail" ? null : (
            previewNode
          );
        const BodySlot = props.slots?.SurfaceBody;
        return BodySlot ? (
          <BodySlot
            item={item}
            mode={item.displayMode}
            {...(canvas.snapshotsBySurfaceId[surface.id]
              ? { snapshot: canvas.snapshotsBySurfaceId[surface.id] }
              : {})}
            onActivate={onActivate}
            defaultBody={defaultBody}
          />
        ) : (
          defaultBody
        );
      })()
    );

  // Rail surfaces collapse to just their header — no body wrapper at all, so the
  // card is header-height (not the editor's min-surface-height).
  const body =
    bodyContent === null ? null : (
      <div
        className="ham-surface-body"
        // Activate a surface when the user interacts with its body. In expanded
        // mode several editors are mounted at once, and clicking back into one
        // at its existing cursor position won't fire onActiveBlockChange (the
        // block id is unchanged), so focus-based activation is what keeps the
        // active surface correct. No-op when this surface is already active.
        onMouseDownCapture={() => {
          if (item.pathState !== "active") canvas.actions.activate(surface.id, null);
        }}
        onFocusCapture={() => {
          if (item.pathState !== "active") canvas.actions.activate(surface.id, null);
        }}
      >
        {bodyContent}
      </div>
    );

  const inner: ReactNode = (
    <>
      {header}
      {body}
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={frameClass}
      data-surface-id={surface.id}
      data-path-state={item.pathState}
      role="treeitem"
      aria-level={depth + 1}
      aria-setsize={setsize}
      aria-posinset={posinset}
      aria-label={surface.title ?? "Untitled surface"}
      aria-current={item.pathState === "active" ? "true" : undefined}
      aria-expanded={hasChildren ? (collapsed ? "false" : "true") : undefined}
      aria-busy={pending || undefined}
    >
      {Frame ? (
        <Frame item={item} mode={item.displayMode}>
          {inner}
        </Frame>
      ) : (
        inner
      )}
    </div>
  );
}

/** Compact outline of a surface's top-level blocks (or a preview fallback). */
function OutlineBody({
  surfaceId,
  snapshot,
  fallbackPreview,
  onActivate,
}: {
  surfaceId: string;
  snapshot: HamSurfaceSnapshot | undefined;
  /** Rendered when the snapshot isn't available yet (honors a SurfacePreview slot). */
  fallbackPreview: ReactNode;
  onActivate: () => void;
}) {
  if (!snapshot) return <>{fallbackPreview}</>;
  const top = snapshot.blocks[snapshot.rootBlockId]?.childIds ?? [];
  return (
    <ul className="ham-surface-outline" aria-label={`Outline of ${surfaceId}`}>
      {top.map((id) => {
        const block = snapshot.blocks[id];
        if (!block) return null;
        return (
          <li key={id} className={`ham-outline-item ham-outline-${block.type}`}>
            <button type="button" className="ham-outline-link" onClick={onActivate}>
              {block.textPreview || "(empty)"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Recursively collect text from a Tiptap/ProseMirror JSON document so a card
 * preview isn't blank when a surface was persisted as `tiptap-json`. */
function tiptapText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(tiptapText).join(" ");
  return "";
}

function previewText(content: { kind: string; markdown?: string; json?: unknown }): string {
  const clean = (s: string) =>
    s
      .replace(/[#>*_`-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  if (content.kind === "markdown" && content.markdown) return clean(content.markdown);
  if (content.kind === "tiptap-json" && content.json !== undefined)
    return clean(tiptapText(content.json));
  return "";
}

/** Group a column's items by their (parentSurface, anchorBlock) so each sibling set is a sortable context. */
function groupColumn(column: HamCanvasColumn): { key: string; items: HamCanvasItem[] }[] {
  const groups = new Map<string, HamCanvasItem[]>();
  for (const item of column.items) {
    const key = item.incomingEdge
      ? `${item.incomingEdge.fromSurfaceId}::${item.incomingEdge.fromBlockId}`
      : `__root__::${item.surface.id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
}

/**
 * Renders a 2D canvas of editable surfaces linked by branch edges. The active
 * surface mounts a full {@link HamEditor}; others render compact previews.
 * Same-anchor siblings can be reordered with dnd-kit; branch/add-sibling/delete
 * flow through the host handlers.
 */
export function HamCanvas<SurfaceMeta = unknown, EdgeMeta = unknown>(
  props: HamCanvasProps<SurfaceMeta, EdgeMeta>,
) {
  const canvas = useHamCanvas(props);
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => resolveLayout(props.layout), [props.layout]);
  const behavior = useMemo(() => resolveBehavior(props.behavior), [props.behavior]);

  // Hover target for connector "hover" mode, tracked via delegation on the root
  // so it costs nothing in the other modes.
  const [hovered, setHovered] = useState<HamHoverTarget | null>(null);
  // True while a surface is being dragged (fades connectors — see root class).
  const [dragging, setDragging] = useState(false);
  const onPointerOver = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (layout.showConnectors !== "hover") return;
    const target = event.target as HTMLElement;
    const surfaceEl = target.closest<HTMLElement>("[data-surface-id]");
    if (!surfaceEl) return;
    const surfaceId = surfaceEl.getAttribute("data-surface-id")!;
    const blockId =
      target.closest<HTMLElement>("[data-block-id]")?.getAttribute("data-block-id") ?? null;
    setHovered((prev) =>
      prev && prev.surfaceId === surfaceId && prev.blockId === blockId
        ? prev
        : { surfaceId, blockId },
    );
  };
  // Drop a stale hover target if its surface leaves the projection (collapsed,
  // hidden, or deleted) while the pointer is still inside the canvas — otherwise
  // `hover` connectors would keep referencing a gone surface.
  useEffect(() => {
    if (!hovered) return;
    const present = canvas.columns.some((c) =>
      c.items.some((i) => i.surface.id === hovered.surfaceId),
    );
    if (!present) setHovered(null);
  }, [canvas.columns, hovered]);

  // A compact signature of the projected layout — connectors re-measure whenever
  // columns reshape, the active path moves, or edges change.
  // Geometry key: changes only when the set/position of DOM anchors changes
  // (columns, display modes, which surfaces connect). Drives the connector
  // ResizeObserver re-subscription — NOT the active path, so moving the cursor
  // doesn't re-observe every anchor.
  const geometryKey = useMemo(
    () =>
      canvas.columns
        .map((c) => c.items.map((i) => `${i.surface.id}:${i.displayMode}`).join(","))
        .join("|") +
      `#${props.branchEdges.map((e) => `${e.id}:${e.fromSurfaceId}>${e.toSurfaceId}`).join(",")}`,
    [canvas.columns, props.branchEdges],
  );
  // Full reshape key: geometry + the active path (which changes which edges show
  // and their state coloring) — drives the connector re-measure.
  const reshapeKey = useMemo(
    () => `${geometryKey}#${canvas.activeSurfaceId}:${canvas.activeBlockId ?? ""}`,
    [geometryKey, canvas.activeSurfaceId, canvas.activeBlockId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Canvas-level undo/redo for sibling reorders — the one topology op that's
  // losslessly reversible through the existing handler (re-apply the prior
  // order), with no host "restore" capability required. Branch-create / delete
  // undo would need a host re-create seam, so they're out of scope here.
  type ReorderHistory = { fromSurfaceId: HamSurfaceId; fromBlockId: string; order: string[] };
  const undoStack = useRef<ReorderHistory[]>([]);
  const redoStack = useRef<ReorderHistory[]>([]);

  const applyHistory = (from: "undo" | "redo") => {
    const src = from === "undo" ? undoStack : redoStack;
    const dst = from === "undo" ? redoStack : undoStack;
    const entry = src.current.pop();
    if (!entry) return false;
    // Record the inverse on the opposite stack before re-applying.
    dst.current.push({
      fromSurfaceId: entry.fromSurfaceId,
      fromBlockId: entry.fromBlockId,
      order: siblingEdgeOrder(props.branchEdges, entry.fromSurfaceId, entry.fromBlockId),
    });
    void canvas.actions.reorderSiblings(entry.fromSurfaceId, entry.fromBlockId, entry.order);
    return true;
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const edges = props.branchEdges;
    const activeEdge = edges.find((e) => e.id === active.id);
    const overEdge = edges.find((e) => e.id === over.id);
    if (!activeEdge || !overEdge) return;
    // Same-anchor only (spec §8.3).
    if (
      activeEdge.fromSurfaceId !== overEdge.fromSurfaceId ||
      activeEdge.fromBlockId !== overEdge.fromBlockId
    ) {
      return;
    }
    const group = siblingEdgeOrder(edges, activeEdge.fromSurfaceId, activeEdge.fromBlockId);
    const from = group.indexOf(String(active.id));
    const to = group.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const ordered = arrayMove(group, from, to);
    // Record the pre-reorder order for undo; a fresh user action invalidates redo.
    undoStack.current.push({
      fromSurfaceId: activeEdge.fromSurfaceId,
      fromBlockId: activeEdge.fromBlockId,
      order: group,
    });
    redoStack.current = [];
    void canvas.actions.reorderSiblings(activeEdge.fromSurfaceId, activeEdge.fromBlockId, ordered);
  };

  // Find a surface card by id without interpolating the id into a selector
  // (surface ids may contain CSS-special characters that would throw).
  const surfaceEl = useCallback((surfaceId: HamSurfaceId): HTMLElement | undefined => {
    const root = rootRef.current;
    if (!root) return undefined;
    return [...root.querySelectorAll<HTMLElement>("[data-surface-id]")].find(
      (e) => e.getAttribute("data-surface-id") === surfaceId,
    );
  }, []);

  const scrollSurfaceIntoView = useCallback(
    (surfaceId: HamSurfaceId) => {
      // Bring the activated surface to the START (left) of the canvas, so its
      // subtree to the right comes into view — clicking an editor pulls it to the
      // window start rather than leaving it mid-scroll.
      surfaceEl(surfaceId)?.scrollIntoView({
        behavior: scrollBehavior(),
        inline: "start",
        block: "nearest",
      });
    },
    [surfaceEl],
  );

  // "Descend into depth": bring a surface's child surfaces into view in the next
  // column (the first child by order). With columnScroll the child group rises
  // to the top of its column; otherwise it's nudged into view minimally.
  const columnScroll = layout.columnScroll;
  const revealChildren = useCallback(
    (surfaceId: HamSurfaceId) => {
      const first = props.branchEdges
        .filter((e) => e.fromSurfaceId === surfaceId)
        .sort((a, b) => a.order - b.order)[0];
      if (!first) return;
      surfaceEl(first.toSurfaceId)?.scrollIntoView({
        behavior: scrollBehavior(),
        block: columnScroll ? "start" : "nearest",
        inline: "nearest",
      });
    },
    [props.branchEdges, surfaceEl, columnScroll],
  );

  // Live snapshots read via a ref so the block-reveal can walk the block tree
  // without re-firing the scroll on every (debounced) snapshot update.
  const snapshotsRef = useRef(canvas.snapshotsBySurfaceId);
  snapshotsRef.current = canvas.snapshotsBySurfaceId;

  // Reveal the branch anchored at the *selected block* — or, if that block has no
  // branch of its own, the nearest ancestor block in its document that does (so
  // selecting a paragraph under a branched heading scrolls that heading's child
  // surface into view). Falls back to the surface's first child.
  const revealBranchFromBlock = useCallback(
    (surfaceId: HamSurfaceId, blockId: HamSurfaceId | null) => {
      const fromEdges = props.branchEdges.filter((e) => e.fromSurfaceId === surfaceId);
      if (!fromEdges.length) return;
      const snap = snapshotsRef.current[surfaceId];
      let bid: string | null = blockId;
      let target: (typeof fromEdges)[number] | undefined;
      const seen = new Set<string>();
      while (bid && !seen.has(bid)) {
        seen.add(bid);
        target = fromEdges.find((e) => e.fromBlockId === bid);
        if (target) break;
        bid = snap?.blocks[bid]?.parentId ?? null;
      }
      const chosen = target ?? [...fromEdges].sort((a, b) => a.order - b.order)[0];
      if (!chosen) return;
      surfaceEl(chosen.toSurfaceId)?.scrollIntoView({
        behavior: scrollBehavior(),
        block: columnScroll ? "start" : "nearest",
        inline: "nearest",
      });
    },
    [props.branchEdges, surfaceEl, columnScroll],
  );

  // Auto-scroll the active surface to the start, then reveal the selected block's
  // branch (or an ancestor block's) so moving the cursor guides you toward what
  // that block branches into. Fires on block changes too, not just surface ones.
  useEffect(() => {
    if (!layout.autoScroll) return;
    scrollSurfaceIntoView(canvas.activeSurfaceId);
    revealBranchFromBlock(canvas.activeSurfaceId, canvas.activeBlockId);
  }, [
    canvas.activeSurfaceId,
    canvas.activeBlockId,
    layout.autoScroll,
    scrollSurfaceIntoView,
    revealBranchFromBlock,
  ]);

  // Publish the imperative canvas handle once (live data via a ref).
  const liveRef = useRef({ canvas, scrollSurfaceIntoView, revealChildren });
  liveRef.current = { canvas, scrollSurfaceIntoView, revealChildren };
  const handlePublished = useRef(false);
  const onReady = props.onReady;
  useEffect(() => {
    if (handlePublished.current || !onReady) return;
    handlePublished.current = true;
    onReady({
      focusSurface: (id) => {
        liveRef.current.canvas.actions.activate(id, null);
        liveRef.current.scrollSurfaceIntoView(id);
      },
      focusBlock: (id, blockId) => {
        liveRef.current.canvas.actions.activate(id, blockId);
        liveRef.current.scrollSurfaceIntoView(id);
      },
      scrollSurfaceIntoView: (id) => liveRef.current.scrollSurfaceIntoView(id),
      revealChildren: (id) => liveRef.current.revealChildren(id),
      getActivePath: () => liveRef.current.canvas.activePath,
      getColumns: () => liveRef.current.canvas.columns,
    });
  }, [onReady]);

  const reorderEnabled = behavior.enableSurfaceReorder && !!props.handlers.reorderBranchSiblings;
  const canAddSibling =
    behavior.enableSiblingBranchCreation && !!props.handlers.createSiblingSurface;
  const AddSib = props.slots?.AddSiblingButton ?? DefaultAddSiblingButton;
  const ColumnHeader = props.slots?.ColumnHeader;
  const EmptyColumn = props.slots?.EmptyColumn;
  const EmptyCanvas = props.slots?.EmptyCanvas;
  const hasSurfaces = canvas.columns.some((c) => c.items.length > 0);
  const firstDetachedDepth = canvas.columns.find((c) => c.detached)?.depth ?? null;
  const pendingCount = canvas.pendingSurfaceIds.size;
  if (!props.surfaces[props.rootSurfaceId]) {
    devWarn(
      "root-missing",
      `rootSurfaceId "${props.rootSurfaceId}" is not in \`surfaces\` — the canvas will render empty.`,
    );
  }
  const GroupHeader = layout.showGroupHeaders
    ? (props.slots?.GroupHeader ?? DefaultGroupHeader)
    : undefined;

  // Keyboard navigation across surfaces/columns (spec §9.1). Alt+Arrows move
  // along the path and among same-column siblings.
  const navigate = (dir: "left" | "right" | "up" | "down") => {
    const cols = canvas.columns;
    const active = canvas.activeSurfaceId;
    let colIdx = -1;
    let itemIdx = -1;
    cols.forEach((c, ci) =>
      c.items.forEach((it, ii) => {
        if (it.surface.id === active) {
          colIdx = ci;
          itemIdx = ii;
        }
      }),
    );
    if (colIdx < 0) return;
    if (dir === "left") {
      const parent = canvas.activePath.surfaceIds.at(-2);
      if (parent) canvas.actions.activate(parent, null);
    } else if (dir === "right") {
      // Descend along the *active block's* first outgoing edge when a block is
      // focused (items in the next column are already in sortOutgoing order, so
      // the first match is that edge's child); otherwise fall back to the first
      // child of the active surface. Avoids jumping to an unrelated sibling group.
      const next = cols[colIdx + 1]?.items ?? [];
      const activeBlock = canvas.activeBlockId;
      const child =
        (activeBlock
          ? next.find((it) => it.parentSurfaceId === active && it.anchorBlockId === activeBlock)
          : undefined) ?? next.find((it) => it.parentSurfaceId === active);
      if (child) canvas.actions.activate(child.surface.id, null);
    } else if (dir === "down") {
      const next = cols[colIdx]?.items[itemIdx + 1];
      if (next) canvas.actions.activate(next.surface.id, null);
    } else if (dir === "up") {
      const prev = cols[colIdx]?.items[itemIdx - 1];
      if (prev) canvas.actions.activate(prev.surface.id, null);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!behavior.enableKeyboardNavigation) return;
    // Don't steal keys (Alt+Arrow word-nav, Cmd+Z editor-undo) from a focused
    // editor / input — those own their own undo + navigation.
    const target = event.target as HTMLElement;
    if (
      target.isContentEditable ||
      target.closest(".ham-editor, input, textarea, [contenteditable='true']")
    ) {
      return;
    }
    // Cmd/Ctrl+Z undo / Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo for sibling reorders,
    // when the focus is on the canvas chrome (not an editor, handled above).
    if (reorderEnabled && (event.metaKey || event.ctrlKey) && !event.altKey) {
      const k = event.key.toLowerCase();
      if (k === "z" && !event.shiftKey) {
        if (applyHistory("undo")) event.preventDefault();
        return;
      }
      if ((k === "z" && event.shiftKey) || k === "y") {
        if (applyHistory("redo")) event.preventDefault();
        return;
      }
    }
    if (!event.altKey) return;
    const dir = (
      {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      } as const
    )[event.key];
    if (dir) {
      event.preventDefault();
      navigate(dir);
      return;
    }
    // Alt+C collapses/expands the active surface (non-destructive, reversible).
    if (event.code === "KeyC" && canvas.activeSurfaceId) {
      event.preventDefault();
      canvas.actions.toggleCollapsed(canvas.activeSurfaceId);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setDragging(true)}
      onDragEnd={(e) => {
        setDragging(false);
        onDragEnd(e);
      }}
      onDragCancel={() => setDragging(false)}
    >
      {/* Announce async create/delete/save activity. Kept OUTSIDE role="tree"
          so the tree owns only group/treeitem children (axe aria-required-children). */}
      <div className="ham-sr-only" aria-live="polite" role="status">
        {pendingCount > 0
          ? `${pendingCount} operation${pendingCount > 1 ? "s" : ""} in progress`
          : ""}
      </div>
      {!hasSurfaces &&
        (EmptyCanvas ? (
          <EmptyCanvas rootSurfaceId={props.rootSurfaceId} />
        ) : (
          <div className="ham-canvas-empty" role="note">
            No surfaces to show.
          </div>
        ))}
      <div
        ref={rootRef}
        className={[
          "ham-canvas",
          `ham-appearance-${layout.appearance}`,
          layout.columnScroll ? "ham-columns-scroll" : "",
          // While a surface is dragged, connectors can't track it live, so fade
          // them to signal they're momentarily stale (re-snap on drop).
          dragging ? "ham-dragging" : "",
          props.className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--ham-column-gap": `${layout.columnGap}px`,
            "--ham-surface-gap": `${layout.surfaceGap}px`,
            "--ham-column-width": `${layout.columnWidth}px`,
            "--ham-expanded-column-width": `${layout.expandedColumnWidth}px`,
            "--ham-rail-column-width": `${layout.railColumnWidth}px`,
            "--ham-min-surface-height": `${layout.minSurfaceHeight}px`,
            ...(layout.maxSurfaceHeight != null
              ? { "--ham-max-surface-height": `${layout.maxSurfaceHeight}px` }
              : {}),
            padding: layout.padding,
          } as CSSProperties
        }
        tabIndex={0}
        // role="tree" only when it actually owns treeitems (an empty tree is
        // invalid); the empty placeholder is rendered as a sibling above.
        role={hasSurfaces ? "tree" : undefined}
        aria-label={hasSurfaces ? "Canvas of linked surfaces" : undefined}
        onKeyDown={onKeyDown}
        onMouseOver={onPointerOver}
        onMouseLeave={() => hovered && setHovered(null)}
      >
        {canvas.columns.map((column) => {
          // The active column widens to expandedColumnWidth when activeColumnMode
          // is "expanded" (so the focused level gets more room).
          const isActiveColumn =
            layout.activeColumnMode === "expanded" &&
            column.items.some((i) => i.surface.id === canvas.activeSurfaceId);
          // A column is only as wide as its widest surface needs — so rail/outline
          // columns become a narrow sidebar instead of full-width empty boxes.
          const colMode = column.items.reduce<HamCanvasItem["displayMode"]>(
            (m, i) => (DISPLAY_MODE_RANK[i.displayMode] > DISPLAY_MODE_RANK[m] ? i.displayMode : m),
            "hidden",
          );
          const columnEl = (
            <div
              className={
                "ham-column" +
                (isActiveColumn ? " ham-column-active" : "") +
                (column.detached ? " ham-column-detached" : "")
              }
              key={column.depth}
              data-depth={column.depth}
              data-col-mode={colMode}
              {...(column.detached ? { "data-detached": "true" } : {})}
              role="group"
              aria-label={
                column.detached
                  ? "Detached surfaces (not linked to root)"
                  : `Column ${column.depth + 1}`
              }
            >
              {ColumnHeader && <ColumnHeader depth={column.depth} count={column.items.length} />}
              {column.items.length === 0 && EmptyColumn ? (
                <EmptyColumn depth={column.depth} />
              ) : (
                groupColumn(column).map((group) => {
                  const sortable = reorderEnabled && group.items.length > 1;
                  const anchor = group.items[0]?.incomingEdge;
                  // A rail of insert points renders only for real sibling groups
                  // (anchored to a parent block) when sibling creation is enabled.
                  const showInserters = canAddSibling && !!anchor;
                  const inserter = (
                    afterEdgeId: string | undefined,
                    insertOrder: number,
                    isAppend: boolean,
                  ) => (
                    <AddSib
                      key={`add-${group.key}-${insertOrder}`}
                      fromSurfaceId={anchor!.fromSurfaceId}
                      fromBlockId={anchor!.fromBlockId}
                      {...(afterEdgeId ? { afterEdgeId } : {})}
                      insertOrder={insertOrder}
                      siblingCount={group.items.length}
                      isAppend={isAppend}
                      onAddSibling={() =>
                        void canvas.actions.addSibling(anchor!.fromSurfaceId, anchor!.fromBlockId, {
                          insertOrder,
                          ...(afterEdgeId ? { afterEdgeId } : {}),
                        })
                      }
                    />
                  );
                  return (
                    <SortableContext
                      key={group.key}
                      items={group.items.map((i) => i.incomingEdge?.id ?? i.surface.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {GroupHeader && anchor && (
                        <GroupHeader
                          parentSurfaceId={anchor.fromSurfaceId}
                          {...(props.surfaces[anchor.fromSurfaceId]
                            ? { parentSurface: props.surfaces[anchor.fromSurfaceId]! }
                            : {})}
                          anchorBlockId={anchor.fromBlockId}
                          {...(canvas.snapshotsBySurfaceId[anchor.fromSurfaceId]?.blocks[
                            anchor.fromBlockId
                          ]?.textPreview
                            ? {
                                anchorPreview:
                                  canvas.snapshotsBySurfaceId[anchor.fromSurfaceId]!.blocks[
                                    anchor.fromBlockId
                                  ]!.textPreview,
                              }
                            : {})}
                          count={group.items.length}
                          onActivateParent={() =>
                            canvas.actions.activate(anchor.fromSurfaceId, anchor.fromBlockId)
                          }
                        />
                      )}
                      {showInserters && inserter(undefined, 0, false)}
                      {group.items.map((item, i) => (
                        <Fragment key={item.surface.id}>
                          <SurfaceItem
                            item={item as HamCanvasItem}
                            canvas={canvas}
                            props={props as HamCanvasProps}
                            sortable={sortable}
                            depth={column.depth}
                            posinset={
                              column.items.findIndex((it) => it.surface.id === item.surface.id) + 1
                            }
                            setsize={column.items.length}
                          />
                          {showInserters &&
                            inserter(
                              item.incomingEdge!.id,
                              item.incomingEdge!.order + 1,
                              i === group.items.length - 1,
                            )}
                        </Fragment>
                      ))}
                    </SortableContext>
                  );
                })
              )}
            </div>
          );
          // Mark the boundary between the reachable tree and detached orphans.
          if (column.detached && column.depth === firstDetachedDepth) {
            return (
              <Fragment key={`detached-${column.depth}`}>
                <div className="ham-detached-divider" aria-hidden="true">
                  <span>Not linked to root</span>
                </div>
                {columnEl}
              </Fragment>
            );
          }
          return columnEl;
        })}
        {/* Purely decorative cross-column lines — hide from the a11y tree. */}
        <div aria-hidden="true" style={{ display: "contents" }}>
          <HamConnectorsOverlay
            rootRef={rootRef}
            edges={props.branchEdges}
            activePath={canvas.activePath}
            layout={layout}
            hovered={hovered}
            reshapeKey={reshapeKey}
            geometryKey={geometryKey}
            slots={props.slots}
          />
        </div>
      </div>
    </DndContext>
  );
}
