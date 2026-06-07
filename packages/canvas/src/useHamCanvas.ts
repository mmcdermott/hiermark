import { useCallback, useMemo, useRef, useState } from "react";
import type { HamBlockId, HamBranchRequestEvent, HamSurfaceSnapshot } from "@ham/editor";

import { resolveBehavior, resolveLayout } from "./defaults";
import { getHamActivePath } from "./topology/getHamActivePath";
import { projectHamColumns } from "./topology/projectHamColumns";
import {
  areSameAnchorSiblings,
  buildReorderEvent,
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
    afterEdgeId?: string,
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
  // Keep a live ref so callbacks don't capture stale edges.
  const edgesRef = useRef(props.branchEdges);
  edgesRef.current = props.branchEdges;

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

  const branchFromBlock = useCallback(
    async (event: HamBranchRequestEvent) => {
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
    [props.handlers, withPending, activate],
  );

  const addSibling = useCallback(
    async (fromSurfaceId: HamSurfaceId, fromBlockId: HamBlockId, afterEdgeId?: string) => {
      if (!props.handlers.createSiblingSurface) return;
      await withPending(fromSurfaceId, async () => {
        const result = await props.handlers.createSiblingSurface!({
          fromSurfaceId,
          fromBlockId,
          ...(afterEdgeId ? { insertAfterEdgeId: afterEdgeId } : {}),
        });
        if (result?.activate !== false && result?.surface) activate(result.surface.id, null);
      });
    },
    [props.handlers, withPending, activate],
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
      const edges = edgesRef.current;
      const incomingEdgeId = edges.find((e) => e.toSurfaceId === surfaceId)?.id;
      // Collect descendants for the host to validate against its delete policy.
      const descendantSurfaceIds: HamSurfaceId[] = [];
      const queue = [surfaceId];
      const seen = new Set<HamSurfaceId>([surfaceId]);
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of edges.filter((x) => x.fromSurfaceId === cur)) {
          if (!seen.has(e.toSurfaceId)) {
            seen.add(e.toSurfaceId);
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
        if (activeSurfaceId === surfaceId) {
          const parent = edges.find((e) => e.toSurfaceId === surfaceId)?.fromSurfaceId;
          activate(parent ?? props.rootSurfaceId, null);
        }
      });
    },
    [
      props.handlers,
      behavior.deleteSurfacePolicy,
      withPending,
      activeSurfaceId,
      activate,
      props.rootSurfaceId,
    ],
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
