import { useCallback, useMemo, useRef, useState } from "react";
import type { HamBlockId, HamBranchRequestEvent, HamSurfaceSnapshot } from "@ham/editor";

import { resolveBehavior, resolveLayout } from "./defaults";
import { getHamActivePath } from "./topology/getHamActivePath";
import { projectHamColumns } from "./topology/projectHamColumns";
import {
  areSameAnchorSiblings,
  buildReorderEvent,
  computeSiblingInsert,
  siblingEdges,
} from "./topology/reorderBranchSiblings";
import type { HamActivePath, HamCanvasColumn, HamCanvasProps, HamSurfaceId } from "./types";

export interface HamCanvasActions {
  activate(surfaceId: HamSurfaceId, blockId?: HamBlockId | null): void;
  updateSnapshot(surfaceId: HamSurfaceId, snapshot: HamSurfaceSnapshot): void;
  toggleCollapsed(surfaceId: HamSurfaceId): void;
  branchFromBlock(event: HamBranchRequestEvent): Promise<void>;
  addSibling(
    fromSurfaceId: HamSurfaceId,
    fromBlockId: HamBlockId,
    opts?: { insertOrder?: number; afterEdgeId?: string },
  ): Promise<void>;
  reorderSiblings(
    fromSurfaceId: HamSurfaceId,
    fromBlockId: HamBlockId,
    orderedEdgeIds: string[],
  ): Promise<void>;
  removeSurface(surfaceId: HamSurfaceId): Promise<void>;
}

export interface UseHamCanvasResult<SurfaceMeta = unknown, EdgeMeta = unknown> {
  columns: HamCanvasColumn<SurfaceMeta, EdgeMeta>[];
  activePath: HamActivePath;
  activeSurfaceId: HamSurfaceId;
  activeBlockId: HamBlockId | null;
  collapsedSurfaceIds: Set<HamSurfaceId>;
  snapshotsBySurfaceId: Record<HamSurfaceId, HamSurfaceSnapshot | undefined>;
  /** Surfaces with an in-flight topology operation (pessimistic UI). */
  pendingSurfaceIds: Set<HamSurfaceId>;
  actions: HamCanvasActions;
}

/**
 * Headless orchestrator for the canvas: owns the active selection, the
 * per-surface snapshot cache (used to order child columns by source-block
 * preorder), collapse state, and the pessimistic topology operations. The host
 * still owns `surfaces`/`branchEdges` (passed as props); topology handlers are
 * awaited before the result is reflected — the host updates the props.
 */
export function useHamCanvas<SurfaceMeta = unknown, EdgeMeta = unknown>(
  props: HamCanvasProps<SurfaceMeta, EdgeMeta>,
): UseHamCanvasResult<SurfaceMeta, EdgeMeta> {
  const layout = useMemo(() => resolveLayout(props.layout), [props.layout]);
  const behavior = useMemo(() => resolveBehavior(props.behavior), [props.behavior]);

  const [internalActiveSurface, setInternalActiveSurface] = useState<HamSurfaceId>(
    props.activeSurfaceId ?? props.rootSurfaceId,
  );
  const [internalActiveBlock, setInternalActiveBlock] = useState<HamBlockId | null>(
    props.activeBlockId ?? null,
  );
  const activeSurfaceId = props.activeSurfaceId ?? internalActiveSurface;
  const activeBlockId =
    props.activeBlockId !== undefined ? props.activeBlockId : internalActiveBlock;

  const [snapshots, setSnapshots] = useState<Record<HamSurfaceId, HamSurfaceSnapshot | undefined>>(
    {},
  );
  const [collapsedSurfaceIds, setCollapsed] = useState<Set<HamSurfaceId>>(new Set());
  const [pendingSurfaceIds, setPending] = useState<Set<HamSurfaceId>>(new Set());
  const onActiveChange = props.onActiveChange;
  // Keep live refs so async callbacks don't read stale edges / active id.
  const edgesRef = useRef(props.branchEdges);
  edgesRef.current = props.branchEdges;
  const activeRef = useRef(activeSurfaceId);
  activeRef.current = activeSurfaceId;

  const activate = useCallback(
    (surfaceId: HamSurfaceId, blockId: HamBlockId | null = null) => {
      setInternalActiveSurface(surfaceId);
      setInternalActiveBlock(blockId);
      onActiveChange?.({ surfaceId, blockId });
    },
    [onActiveChange],
  );

  const updateSnapshot = useCallback(
    (surfaceId: HamSurfaceId, snapshot: HamSurfaceSnapshot) => {
      setSnapshots((prev) =>
        prev[surfaceId] === snapshot ? prev : { ...prev, [surfaceId]: snapshot },
      );
      void props.handlers.updateSurfaceSnapshot?.({ surfaceId, snapshot });
    },
    [props.handlers],
  );

  const toggleCollapsed = useCallback((surfaceId: HamSurfaceId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(surfaceId)) next.delete(surfaceId);
      else next.add(surfaceId);
      return next;
    });
  }, []);

  const withPending = useCallback(async (surfaceId: HamSurfaceId, run: () => Promise<void>) => {
    setPending((prev) => new Set(prev).add(surfaceId));
    try {
      await run();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(surfaceId);
        return next;
      });
    }
  }, []);

  const addSibling = useCallback(
    async (
      fromSurfaceId: HamSurfaceId,
      fromBlockId: HamBlockId,
      opts?: { insertOrder?: number; afterEdgeId?: string },
    ) => {
      if (!props.handlers.createSiblingSurface) return;
      // The canvas is the single source of order truth: resolve where the new
      // sibling lands and which existing siblings shift, so every host gets
      // "insert between" correct without re-deriving it.
      const group = siblingEdges(edgesRef.current, fromSurfaceId, fromBlockId);
      const afterEdgeId = opts?.afterEdgeId;
      const insertOrder =
        opts?.insertOrder ??
        (afterEdgeId
          ? (group.find((e) => e.id === afterEdgeId)?.order ?? group.length - 1) + 1
          : group.length); // default: append
      const { shiftedSiblingOrders } = computeSiblingInsert(group, insertOrder);
      await withPending(fromSurfaceId, async () => {
        const result = await props.handlers.createSiblingSurface!({
          fromSurfaceId,
          fromBlockId,
          ...(afterEdgeId ? { insertAfterEdgeId: afterEdgeId } : {}),
          order: insertOrder,
          ...(Object.keys(shiftedSiblingOrders).length ? { shiftedSiblingOrders } : {}),
        });
        if (result?.activate !== false && result?.surface) activate(result.surface.id, null);
      });
    },
    [props.handlers, withPending, activate],
  );

  const branchFromBlock = useCallback(
    async (event: HamBranchRequestEvent) => {
      // A block that already has a branch child presents an "add sibling"
      // affordance — route it to the sibling path (append) when the host
      // supports it, so the two affordances hit the handlers the design intends.
      if (event.mode === "add-sibling" && props.handlers.createSiblingSurface) {
        await addSibling(event.surfaceId, event.blockId);
        return;
      }
      await withPending(event.surfaceId, async () => {
        const result = await props.handlers.createSurfaceFromBlock({
          sourceSurfaceId: event.surfaceId,
          sourceBlockId: event.blockId,
          sourceBlockSnapshot: event.blockSnapshot,
          sourceSurfaceSnapshot: event.surfaceSnapshot,
          suggestedTitle: event.textPreview,
          saveSourceSurface: event.save,
        });
        if (result?.activate !== false && result?.surface) {
          activate(result.surface.id, null);
        }
      });
    },
    [props.handlers, withPending, activate, addSibling],
  );

  const reorderSiblings = useCallback(
    async (fromSurfaceId: HamSurfaceId, fromBlockId: HamBlockId, orderedEdgeIds: string[]) => {
      if (!props.handlers.reorderBranchSiblings) return;
      // Strict guard (spec §8.3): only same-anchor siblings may be reordered.
      if (!areSameAnchorSiblings(edgesRef.current, orderedEdgeIds)) return;
      const orderedSurfaceIds = orderedEdgeIds.map(
        (id) => edgesRef.current.find((e) => e.id === id)!.toSurfaceId,
      );
      await withPending(fromSurfaceId, async () => {
        await props.handlers.reorderBranchSiblings!({
          fromSurfaceId,
          fromBlockId,
          orderedEdgeIds,
          orderedSurfaceIds,
        });
      });
    },
    [props.handlers, withPending],
  );

  const removeSurface = useCallback(
    async (surfaceId: HamSurfaceId) => {
      if (!props.handlers.deleteSurface) return;
      const edgesBefore = edgesRef.current;
      const parentSurfaceId = edgesBefore.find((e) => e.toSurfaceId === surfaceId)?.fromSurfaceId;
      const incomingEdgeId = edgesBefore.find((e) => e.toSurfaceId === surfaceId)?.id;
      // Collect the deleted subtree (surface + descendants) for the host to
      // validate against its delete policy, and to drive re-activation/eviction.
      const descendantSurfaceIds: HamSurfaceId[] = [];
      const removedSet = new Set<HamSurfaceId>([surfaceId]);
      const queue = [surfaceId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of edgesBefore.filter((x) => x.fromSurfaceId === cur)) {
          if (!removedSet.has(e.toSurfaceId)) {
            removedSet.add(e.toSurfaceId);
            descendantSurfaceIds.push(e.toSurfaceId);
            queue.push(e.toSurfaceId);
          }
        }
      }
      await withPending(surfaceId, async () => {
        await props.handlers.deleteSurface!({
          surfaceId,
          ...(incomingEdgeId ? { incomingEdgeId } : {}),
          descendantSurfaceIds,
          policy: behavior.deleteSurfacePolicy,
        });
        // If the (live) active surface was deleted or orphaned by this delete,
        // re-activate the deleted surface's parent so it doesn't vanish.
        if (removedSet.has(activeRef.current)) {
          activate(parentSurfaceId ?? props.rootSurfaceId, null);
        }
        // Evict the snapshot cache for everything the host removed (prevents a
        // stale snapshot corrupting ordering if a surface id is later reused).
        setSnapshots((prev) => {
          const next = { ...prev };
          delete next[surfaceId];
          for (const d of descendantSurfaceIds) delete next[d];
          return next;
        });
      });
    },
    [props.handlers, behavior.deleteSurfacePolicy, withPending, activate, props.rootSurfaceId],
  );

  const activePath = useMemo(
    () =>
      getHamActivePath({
        rootSurfaceId: props.rootSurfaceId,
        activeSurfaceId,
        activeBlockId,
        branchEdges: props.branchEdges,
      }),
    [props.rootSurfaceId, activeSurfaceId, activeBlockId, props.branchEdges],
  );

  const columns = useMemo(
    () =>
      projectHamColumns<SurfaceMeta, EdgeMeta>({
        rootSurfaceId: props.rootSurfaceId,
        surfaces: props.surfaces,
        branchEdges: props.branchEdges,
        snapshotsBySurfaceId: snapshots,
        activeSurfaceId,
        activeBlockId,
        collapsedSurfaceIds,
        layout,
      }),
    [
      props.rootSurfaceId,
      props.surfaces,
      props.branchEdges,
      snapshots,
      activeSurfaceId,
      activeBlockId,
      collapsedSurfaceIds,
      layout,
    ],
  );

  const actions = useMemo<HamCanvasActions>(
    () => ({
      activate,
      updateSnapshot,
      toggleCollapsed,
      branchFromBlock,
      addSibling,
      reorderSiblings,
      removeSurface,
    }),
    [
      activate,
      updateSnapshot,
      toggleCollapsed,
      branchFromBlock,
      addSibling,
      reorderSiblings,
      removeSurface,
    ],
  );

  return {
    columns,
    activePath,
    activeSurfaceId,
    activeBlockId,
    collapsedSurfaceIds,
    snapshotsBySurfaceId: snapshots,
    pendingSurfaceIds,
    actions,
  };
}

/** Re-exported for advanced consumers building custom canvases. */
export { siblingEdges, buildReorderEvent };
