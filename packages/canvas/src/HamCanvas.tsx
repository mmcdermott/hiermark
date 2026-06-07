import { useEffect, useMemo, useRef } from "react";
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
import { HamEditor, type HamBranchChildSummary, type HamEditorHandle } from "@ham/editor";

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
}

function SurfaceItem({ item, canvas, props, sortable }: ItemProps) {
  const surface = item.surface;
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
      aria-current={item.pathState === "active" ? "true" : undefined}
    >
      <header className="ham-surface-header">
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

      <div className="ham-surface-body">
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
        ) : (
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
    if (!layout.autoScroll) return;
    const els = document.querySelectorAll<HTMLElement>(".ham-canvas [data-surface-id]");
    const el = [...els].find((e) => e.getAttribute("data-surface-id") === canvas.activeSurfaceId);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [canvas.activeSurfaceId, layout.autoScroll]);

  const reorderEnabled = behavior.enableSurfaceReorder && !!props.handlers.reorderBranchSiblings;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div
        className={["ham-canvas", props.className].filter(Boolean).join(" ")}
        style={{ gap: layout.columnGap, padding: layout.padding }}
      >
        {canvas.columns.map((column) => (
          <div className="ham-column" key={column.depth} data-depth={column.depth}>
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
