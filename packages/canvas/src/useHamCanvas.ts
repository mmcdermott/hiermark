import { useCallback, useMemo, useRef, useState } from "react";
import type { HamBlockId, HamBranchRequestEvent, HamSurfaceSnapshot } from "@ham/editor";

import { resolveBehavior, resolveLayout } from "./defaults";
import { devWarn } from "./devWarn";
import { getHamActivePath } from "./topology/getHamActivePath";
import { buildProjectionContext, projectColumnsFromContext } from "./topology/projectHamColumns";
import {
  areSameAnchorSiblings,
  buildReorderEvent,
  computeSiblingInsert,
  siblingEdges,
} from "./topology/reorderBranchSiblings";
import type {
  HamActivePath,
  HamCanvasColumn,
  HamCanvasOperationType,
  HamCanvasProps,
  HamSurfaceId,
} from "./types";

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
  /**
   * Resolves `true` when the host handler committed the reorder, `false` when
   * it rejected (the error went to `onOperationError`) — so callers (e.g. the
   * canvas undo stack) can keep their bookkeeping consistent.
   */
  reorderSiblings(
    fromSurfaceId: HamSurfaceId,
    fromBlockId: HamBlockId,
    orderedEdgeIds: string[],
  ): Promise<boolean>;
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
  // Pending ops are COUNTED per surface (not a Set) so two overlapping ops on
  // one surface don't clear its pending state when the first settles.
  const [pendingCounts, setPendingCounts] = useState<Record<HamSurfaceId, number>>({});
  const pendingSurfaceIds = useMemo(() => new Set(Object.keys(pendingCounts)), [pendingCounts]);
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

  const onOperationError = props.onOperationError;
  const updateSnapshot = useCallback(
    (surfaceId: HamSurfaceId, snapshot: HamSurfaceSnapshot) => {
      setSnapshots((prev) =>
        prev[surfaceId] === snapshot ? prev : { ...prev, [surfaceId]: snapshot },
      );
      const run = props.handlers.updateSurfaceSnapshot;
      if (!run) return;
      // Route sync throws AND async rejections to onOperationError — a host
      // persisting snapshots must never produce an unhandled rejection.
      void Promise.resolve()
        .then(() => run({ surfaceId, snapshot }))
        .catch((error: unknown) =>
          onOperationError?.({ type: "update-snapshot", surfaceId, error }),
        );
    },
    [props.handlers, onOperationError],
  );

  const toggleCollapsed = useCallback((surfaceId: HamSurfaceId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(surfaceId)) next.delete(surfaceId);
      else next.add(surfaceId);
      return next;
    });
  }, []);

  const withPending = useCallback(
    async (
      surfaceId: HamSurfaceId,
      type: HamCanvasOperationType,
      run: () => Promise<void>,
    ): Promise<boolean> => {
      setPendingCounts((prev) => ({ ...prev, [surfaceId]: (prev[surfaceId] ?? 0) + 1 }));
      try {
        await run();
        return true;
      } catch (error) {
        // Surface the rejection rather than letting it become an unhandled
        // promise rejection; the host owns recovery.
        onOperationError?.({ type, surfaceId, error });
        return false;
      } finally {
        setPendingCounts((prev) => {
          const remaining = (prev[surfaceId] ?? 0) - 1;
          const next = { ...prev };
          if (remaining <= 0) delete next[surfaceId];
          else next[surfaceId] = remaining;
          return next;
        });
      }
    },
    [onOperationError],
  );

  const addSibling = useCallback(
    async (
      fromSurfaceId: HamSurfaceId,
      fromBlockId: HamBlockId,
      opts?: { insertOrder?: number; afterEdgeId?: string },
    ) => {
      if (!props.handlers.createSiblingSurface) return;
      // The behavior flag is enforced at the ACTION layer (not only in
      // rendering), so a gutter affordance, custom slot, or imperative call
      // can't bypass a host that disabled sibling creation.
      if (!behavior.enableSiblingBranchCreation) {
        onOperationError?.({
          type: "create-sibling",
          surfaceId: fromSurfaceId,
          blocked: true,
          reason: "behavior.enableSiblingBranchCreation is false",
        });
        return;
      }
      // The canvas is the single source of order truth: resolve where the new
      // sibling lands and which existing siblings shift, so every host gets
      // "insert between" correct without re-deriving it.
      const group = siblingEdges(edgesRef.current, fromSurfaceId, fromBlockId);
      const afterEdgeId = opts?.afterEdgeId;
      // Append must clear the group's MAX order, not its length — sibling
      // orders are sparse after any delete, and length lands mid-group.
      const appendOrder = group.length ? Math.max(...group.map((e) => e.order)) + 1 : 0;
      const insertOrder =
        opts?.insertOrder ??
        (afterEdgeId
          ? (group.find((e) => e.id === afterEdgeId)?.order ?? appendOrder - 1) + 1
          : appendOrder);
      const { shiftedSiblingOrders } = computeSiblingInsert(group, insertOrder);
      await withPending(fromSurfaceId, "create-sibling", async () => {
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
    [props.handlers, behavior.enableSiblingBranchCreation, onOperationError, withPending, activate],
  );

  const branchFromBlock = useCallback(
    async (event: HamBranchRequestEvent) => {
      // A block that already has a branch child presents an "add sibling"
      // affordance — route it to the sibling path (append) when the host
      // supports it, so the two affordances hit the handlers the design
      // intends. addSibling itself enforces enableSiblingBranchCreation.
      if (event.mode === "add-sibling" && props.handlers.createSiblingSurface) {
        if (!behavior.enableSiblingBranchCreation) {
          onOperationError?.({
            type: "create-sibling",
            surfaceId: event.surfaceId,
            blocked: true,
            reason: "behavior.enableSiblingBranchCreation is false",
          });
          return;
        }
        await addSibling(event.surfaceId, event.blockId);
        return;
      }
      // Respect the behavior flag even if a stray affordance fired.
      if (!behavior.enableBranchCreation) return;
      const createSurfaceFromBlock = props.handlers.createSurfaceFromBlock;
      if (!createSurfaceFromBlock) {
        devWarn(
          "no-create-handler",
          "a branch was requested but handlers.createSurfaceFromBlock is not set — provide it or set behavior.enableBranchCreation to false.",
        );
        return;
      }
      await withPending(event.surfaceId, "create-branch", async () => {
        const result = await createSurfaceFromBlock({
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
    [
      props.handlers,
      behavior.enableBranchCreation,
      behavior.enableSiblingBranchCreation,
      onOperationError,
      withPending,
      activate,
      addSibling,
    ],
  );

  const reorderSiblings = useCallback(
    async (
      fromSurfaceId: HamSurfaceId,
      fromBlockId: HamBlockId,
      orderedEdgeIds: string[],
    ): Promise<boolean> => {
      if (!props.handlers.reorderBranchSiblings) return false;
      // Strict guard (spec §8.3): only same-anchor siblings may be reordered.
      if (!areSameAnchorSiblings(edgesRef.current, orderedEdgeIds)) return false;
      const orderedSurfaceIds = orderedEdgeIds.map(
        (id) => edgesRef.current.find((e) => e.id === id)!.toSurfaceId,
      );
      return withPending(fromSurfaceId, "reorder-siblings", async () => {
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
      // Enforce the protective built-in policy package-side (spec §8.4) so a
      // host can't accidentally delete a subtree behind the default policy.
      if (
        behavior.deleteSurfacePolicy === "prevent-if-has-children" &&
        descendantSurfaceIds.length
      ) {
        onOperationError?.({
          type: "delete-surface",
          surfaceId,
          blocked: true,
          reason: 'deleteSurfacePolicy is "prevent-if-has-children" and this surface has children',
        });
        return;
      }
      await withPending(surfaceId, "delete-surface", async () => {
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
    [
      props.handlers,
      behavior.deleteSurfacePolicy,
      withPending,
      activate,
      props.rootSurfaceId,
      onOperationError,
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

  // Two-stage projection so snapshot churn (a debounced snapshot per keystroke)
  // doesn't re-run the index / active-path / display-mode work. `topologyInput`
  // and the context memo are snapshot-free — stable across snapshot-only
  // updates — and the columns memo re-runs only the BFS + sibling-ordering pass
  // (which is all the snapshot actually drives) when a snapshot changes.
  const topologyInput = useMemo(
    () => ({
      rootSurfaceId: props.rootSurfaceId,
      surfaces: props.surfaces,
      branchEdges: props.branchEdges,
      activeSurfaceId,
      activeBlockId,
      collapsedSurfaceIds,
      layout,
    }),
    [
      props.rootSurfaceId,
      props.surfaces,
      props.branchEdges,
      activeSurfaceId,
      activeBlockId,
      collapsedSurfaceIds,
      layout,
    ],
  );

  const projectionContext = useMemo(
    () => buildProjectionContext<SurfaceMeta, EdgeMeta>(topologyInput),
    [topologyInput],
  );

  const columns = useMemo(
    () =>
      projectColumnsFromContext<SurfaceMeta, EdgeMeta>(projectionContext, {
        ...topologyInput,
        snapshotsBySurfaceId: snapshots,
      }),
    [projectionContext, topologyInput, snapshots],
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
