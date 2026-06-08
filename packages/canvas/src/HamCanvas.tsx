import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
import { useHamCanvas } from "./useHamCanvas";
import type { HamCanvasColumn, HamCanvasItem, HamCanvasProps, HamSurfaceId } from "./types";

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
}

function SurfaceItem({ item, canvas, props, sortable, depth }: ItemProps) {
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
  const scheduleSave = () => {
    if (!saveSurfaceRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const handle = handleRef.current;
      const save = saveSurfaceRef.current;
      if (!handle || !save) return;
      void handle.save().then((payload) => save(payload));
    }, 800);
  };
  // Flush any pending edit on unmount so edits aren't lost when the surface
  // leaves the projection (navigation/reshape), not only when the timer fires.
  useEffect(
    () => () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      const handle = handleRef.current;
      const save = saveSurfaceRef.current;
      if (handle && save) void handle.save().then((payload) => save(payload));
    },
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

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={frameClass}
      data-surface-id={surface.id}
      data-path-state={item.pathState}
      role="treeitem"
      aria-level={depth + 1}
      aria-label={surface.title ?? "Untitled surface"}
      aria-current={item.pathState === "active" ? "true" : undefined}
      aria-expanded={hasChildren ? (collapsed ? "false" : "true") : undefined}
    >
      <header className="ham-surface-header">
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
        {item.pathState !== "active" && (
          <button
            type="button"
            className="ham-surface-open"
            onClick={() => canvas.actions.activate(surface.id, null)}
          >
            Open
          </button>
        )}
        {item.incomingEdge && props.handlers.createSiblingSurface && (
          <button
            type="button"
            className="ham-surface-add-sibling"
            aria-label="Add sibling branch"
            onClick={() =>
              void canvas.actions.addSibling(
                item.incomingEdge!.fromSurfaceId,
                item.incomingEdge!.fromBlockId,
                item.incomingEdge!.id,
              )
            }
          >
            +
          </button>
        )}
        {item.incomingEdge && props.handlers.deleteSurface && (
          <button
            type="button"
            className="ham-surface-delete"
            aria-label="Delete surface"
            onClick={() => void canvas.actions.removeSurface(surface.id)}
          >
            ×
          </button>
        )}
      </header>

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
        {item.displayMode === "expanded" ? (
          <HamEditor
            surfaceId={surface.id}
            rootBlockId={surface.rootBlockId}
            value={surface.content}
            {...(surface.title !== undefined ? { title: surface.title } : {})}
            editable={!surface.readonly}
            activeBlockId={canvas.activeBlockId}
            branchChildren={childrenForSurface(surface.id, props, activeSurfaceSet)}
            branchPolicy={resolveBehavior(props.behavior).branchPolicy}
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
        ) : item.displayMode === "outline" ? (
          <OutlineBody
            surfaceId={surface.id}
            snapshot={canvas.snapshotsBySurfaceId[surface.id]}
            fallback={surface.content}
            onActivate={() => canvas.actions.activate(surface.id, null)}
          />
        ) : item.displayMode === "rail" ? null : (
          <button
            type="button"
            className="ham-surface-preview"
            onClick={() => canvas.actions.activate(surface.id, null)}
          >
            {previewText(surface.content)}
          </button>
        )}
      </div>
    </section>
  );
}

/** Compact outline of a surface's top-level blocks (or a text preview fallback). */
function OutlineBody({
  surfaceId,
  snapshot,
  fallback,
  onActivate,
}: {
  surfaceId: string;
  snapshot: HamSurfaceSnapshot | undefined;
  fallback: { kind: string; markdown?: string };
  onActivate: () => void;
}) {
  if (!snapshot) {
    return (
      <button type="button" className="ham-surface-preview" onClick={onActivate}>
        {previewText(fallback)}
      </button>
    );
  }
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

function previewText(content: { kind: string; markdown?: string }): string {
  if (content.kind === "markdown" && content.markdown) {
    return content.markdown
      .replace(/[#>*_`-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  }
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    const group = edges
      .filter(
        (e) =>
          e.fromSurfaceId === activeEdge.fromSurfaceId && e.fromBlockId === activeEdge.fromBlockId,
      )
      .sort((a, b) => a.order - b.order)
      .map((e) => e.id);
    const from = group.indexOf(String(active.id));
    const to = group.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const ordered = arrayMove(group, from, to);
    void canvas.actions.reorderSiblings(activeEdge.fromSurfaceId, activeEdge.fromBlockId, ordered);
  };

  // Auto-scroll the active surface into view. Filter by attribute rather than
  // interpolating the id into a selector (surface ids may contain CSS-special
  // characters that would throw a SyntaxError).
  useEffect(() => {
    if (!layout.autoScroll || !rootRef.current) return;
    const els = rootRef.current.querySelectorAll<HTMLElement>("[data-surface-id]");
    const el = [...els].find((e) => e.getAttribute("data-surface-id") === canvas.activeSurfaceId);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [canvas.activeSurfaceId, layout.autoScroll]);

  const reorderEnabled = behavior.enableSurfaceReorder && !!props.handlers.reorderBranchSiblings;

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
      const child = cols[colIdx + 1]?.items.find((it) => it.parentSurfaceId === active);
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
    if (!behavior.enableKeyboardNavigation || !event.altKey) return;
    // Don't steal Alt+Arrow (word navigation) from a focused editor / input.
    const target = event.target as HTMLElement;
    if (
      target.isContentEditable ||
      target.closest(".ham-editor, input, textarea, [contenteditable='true']")
    ) {
      return;
    }
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
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div
        ref={rootRef}
        className={["ham-canvas", props.className].filter(Boolean).join(" ")}
        style={{ gap: layout.columnGap, padding: layout.padding }}
        tabIndex={0}
        role="tree"
        aria-label="Canvas of linked surfaces"
        onKeyDown={onKeyDown}
      >
        {canvas.columns.map((column) => (
          <div
            className="ham-column"
            key={column.depth}
            data-depth={column.depth}
            role="group"
            aria-label={`Column ${column.depth + 1}`}
          >
            {groupColumn(column).map((group) => {
              const sortable = reorderEnabled && group.items.length > 1;
              return (
                <SortableContext
                  key={group.key}
                  items={group.items.map((i) => i.incomingEdge?.id ?? i.surface.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {group.items.map((item) => (
                    <SurfaceItem
                      key={item.surface.id}
                      item={item as HamCanvasItem}
                      canvas={canvas}
                      props={props as HamCanvasProps}
                      sortable={sortable}
                      depth={column.depth}
                    />
                  ))}
                </SortableContext>
              );
            })}
          </div>
        ))}
      </div>
    </DndContext>
  );
}
