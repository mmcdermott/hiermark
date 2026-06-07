import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import * as Y from "yjs";

import {
  AnnotationLayer,
  annotationLayerKey,
  type AnnotationLayerContext,
} from "./annotations/plugin";
import { createHocuspocusCollab, flushAndDestroy } from "./collab/hocuspocus";
import { BlockGutter, blockGutterKey, type BlockGutterContext } from "./extensions/block-gutter";
import {
  createHamEditorExtensions,
  type HamCollabBinding,
} from "./extensions/createHamEditorExtensions";
import { stripStableIds } from "./markdown/stable-id";
import { getHamSurfaceSnapshot } from "./snapshot/getHamSurfaceSnapshot";
import type {
  HamBlockId,
  HamBranchChildSummary,
  HamBranchRequestEvent,
  HamCollaborationProvider,
  HamEditorHandle,
  HamEditorProps,
  HamEditorSavePayload,
  HamSurfaceSnapshot,
} from "./types";

// react re-exports `useCallback`; alias to keep imports terse and lint-clean.
const useStable = useCallback;

function findBlockPos(doc: Editor["state"]["doc"], blockId: HamBlockId): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if ((node.attrs?.dataBlockId as string | null) === blockId) {
      found = pos;
      return false;
    }
    return undefined;
  });
  return found;
}

function activeBlockIdAt(state: EditorState): HamBlockId | null {
  const $head = state.selection.$head;
  for (let d = $head.depth; d > 0; d--) {
    const id = $head.node(d).attrs?.dataBlockId as string | null;
    if (id) return id;
  }
  return null;
}

/**
 * The editor view itself. Mounted directly for local editing, or by the collab
 * gate (post-sync) with a `collab` binding to a shared Y.Doc.
 */
function HamEditorInner<AnnotationData = unknown>(
  props: HamEditorProps<AnnotationData> & { collab?: HamCollabBinding },
) {
  const collab = props.collab;
  const {
    surfaceId,
    value,
    title,
    editable = true,
    rootBlockId = "blk_root",
    branchPolicy = "any-nonempty-block",
    className,
    onReady,
    onChange,
    onSnapshotChange,
    onBranchRequest,
    onOpenBranchChild,
    onActiveBlockChange,
  } = props;

  // The gutter reads its data/handlers through a stable getter (never a cloned
  // ref object — Tiptap deep-clones extension options).
  const ctxRef = useRef<BlockGutterContext | null>(null);
  const annoCtxRef = useRef<AnnotationLayerContext | null>(null);
  const lastActiveBlock = useRef<HamBlockId | null>(null);
  // Read the latest onReady via a ref so the handle is published exactly once
  // per editor — a new onReady closure each render must not re-fire it.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const snapshotOf = useStable(
    (editor: Editor): HamSurfaceSnapshot =>
      getHamSurfaceSnapshot(editor, {
        surfaceId,
        rootBlockId,
        ...(title !== undefined ? { title } : {}),
      }),
    [surfaceId, rootBlockId, title],
  );

  const buildSavePayload = useStable(
    (editor: Editor): HamEditorSavePayload => ({
      surfaceId,
      content: { tiptapJson: editor.getJSON(), markdown: editor.getMarkdown() },
      snapshot: snapshotOf(editor),
    }),
    [surfaceId, snapshotOf],
  );

  const extensions = useMemo(
    () => [
      ...createHamEditorExtensions(collab ? { collab } : {}),
      BlockGutter.configure({ getContext: () => ctxRef.current }),
      AnnotationLayer.configure({ getContext: () => annoCtxRef.current }),
    ],
    // Extensions are intentionally built once; surface/collab identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialContent = useMemo(
    () =>
      // In collab mode the Y.Doc is the source of truth — start empty and seed
      // only if the synced doc is empty (below). Otherwise seed from `value`.
      collab
        ? { content: "" }
        : value.kind === "markdown"
          ? { content: value.markdown, contentType: "markdown" as const }
          : { content: value.json as object },
    // Treat value as the initial content; the host owns subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions,
    editable,
    autofocus: typeof props.autofocus === "boolean" ? props.autofocus : false,
    immediatelyRender: true,
    ...initialContent,
    onUpdate({ editor }) {
      onChange?.({
        surfaceId,
        content: { kind: "tiptap-json", json: editor.getJSON() },
      });
      onSnapshotChange?.(snapshotOf(editor));
    },
    onSelectionUpdate({ editor }) {
      const id = activeBlockIdAt(editor.state);
      if (id !== lastActiveBlock.current) {
        lastActiveBlock.current = id;
        onActiveBlockChange?.(id);
      }
    },
  });

  // Branch handler: capture the snapshot synchronously (spec §5.7), then emit.
  const handleBranch = useStable(
    (blockId: HamBlockId, nativeEvent: Event) => {
      if (!editor) return;
      const surfaceSnapshot = snapshotOf(editor);
      const blockSnapshot = surfaceSnapshot.blocks[blockId];
      if (!blockSnapshot) return;
      const event: HamBranchRequestEvent = {
        surfaceId,
        blockId,
        blockSnapshot,
        surfaceSnapshot,
        textPreview: blockSnapshot.textPreview,
        save: async () => buildSavePayload(editor),
        nativeEvent,
      };
      onBranchRequest?.(event);
    },
    [editor, surfaceId, snapshotOf, buildSavePayload, onBranchRequest],
  );

  const handleOpenChild = useStable(
    (child: HamBranchChildSummary, blockId: HamBlockId) => {
      onOpenBranchChild?.({
        surfaceId,
        blockId,
        edgeId: child.edgeId,
        childSurfaceId: child.surfaceId,
      });
    },
    [surfaceId, onOpenBranchChild],
  );

  // Keep the gutter context current and force a decoration rebuild when the
  // branch children / active block / handlers change.
  useEffect(() => {
    ctxRef.current = {
      branchPolicy,
      childrenByBlockId: props.branchChildren ?? {},
      activeBlockId: props.activeBlockId ?? null,
      editable,
      onBranch: handleBranch,
      onOpenChild: handleOpenChild,
    };
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(blockGutterKey, true));
    }
  }, [
    editor,
    branchPolicy,
    props.branchChildren,
    props.activeBlockId,
    editable,
    handleBranch,
    handleOpenChild,
  ]);

  // Keep the annotation context current and rebuild the annotation decorations.
  useEffect(() => {
    annoCtxRef.current = props.annotations
      ? {
          registry: props.annotations as AnnotationLayerContext["registry"],
          context: props.annotationContext ?? {},
          surfaceId,
          rootBlockId,
        }
      : null;
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(annotationLayerKey, true));
    }
  }, [editor, props.annotations, props.annotationContext, surfaceId, rootBlockId]);

  // Build and publish the imperative handle once the editor exists.
  useEffect(() => {
    if (!editor || !onReadyRef.current) return;
    const handle: HamEditorHandle = {
      surfaceId,
      focusBlock(blockId, opts) {
        const pos = findBlockPos(editor.state.doc, blockId);
        if (pos == null) return;
        editor
          .chain()
          .focus()
          .setTextSelection(pos + 1)
          .run();
        if (opts?.scroll) this.scrollBlockIntoView(blockId);
      },
      scrollBlockIntoView(blockId, opts) {
        const el = editor.view.dom.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
        el?.scrollIntoView(opts ?? { block: "nearest" });
      },
      getSnapshot: () => snapshotOf(editor),
      getMarkdown: () => editor.getMarkdown(),
      getJSON: () => editor.getJSON(),
      save: async () => buildSavePayload(editor),
      collapseBlock() {
        /* fold support arrives in Phase 4 */
      },
      expandBlock() {
        /* fold support arrives in Phase 4 */
      },
      getUnsafeTiptapEditor: () => editor,
    };
    onReadyRef.current(handle);
  }, [editor, surfaceId, snapshotOf, buildSavePayload]);

  // Collaboration seed-if-empty (spec §5.14): the gate mounts this only after
  // the provider has synced, so `editor.isEmpty` reflects the server's state. We
  // seed the initial markdown only when the synced doc is empty, and never emit
  // an update (which would trigger a save of content we just loaded).
  useEffect(() => {
    if (!editor || !collab) return;
    if (value.kind !== "markdown") return; // json seeding into a Y.Doc is unsupported
    if (editor.isEmpty) {
      editor.commands.setContent(stripStableIds(value.markdown).trim(), {
        emitUpdate: false,
        // contentType is added by @tiptap/markdown's SetContentOptions augmentation
        contentType: "markdown",
      } as Parameters<typeof editor.commands.setContent>[1]);
    }
    // Seed exactly once per editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, collab]);

  // Reflect editable changes.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div
      className={["ham-editor", className].filter(Boolean).join(" ")}
      data-surface-id={surfaceId}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * Collaboration gate (spec §5.14): owns the Y.Doc, opens the transport via the
 * runtime, and **delays mounting the editor until the provider has synced** — so
 * ProseMirror never binds to the Y.Doc before the server's state arrives (which
 * would merge an empty default paragraph into the real content). Flushes and
 * destroys the provider on unmount.
 */
function CollabHamEditor<AnnotationData = unknown>(props: HamEditorProps<AnnotationData>) {
  const config = props.collaboration!;
  const [ydoc] = useState<Y.Doc>(() => (config.ydoc as Y.Doc | undefined) ?? new Y.Doc());
  const runtime = useMemo(
    () => config.runtime ?? createHocuspocusCollab(config, ydoc),
    // Build the runtime once for this doc/config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ydoc],
  );

  const [provider, setProvider] = useState<HamCollaborationProvider | null>(null);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: HamCollaborationProvider | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const p = await runtime.connect();
        if (cancelled) return void p.destroy();
        created = p;
        setProvider(p);
        if (p.synced) setSynced(true);
        else
          p.on("synced", () => {
            if (!cancelled) setSynced(true);
          });
        // Fall through to seeding if initial sync never arrives.
        if (config.initialSyncTimeoutMs) {
          timer = setTimeout(() => {
            if (!cancelled) setSynced(true);
          }, config.initialSyncTimeoutMs);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "collaboration failed");
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setProvider(null);
      setSynced(false);
      if (created) flushAndDestroy(created);
    };
  }, [runtime, config.initialSyncTimeoutMs]);

  if (error) {
    const ErrorState = props.slots?.ErrorState;
    return ErrorState ? (
      <ErrorState surfaceId={props.surfaceId} error={new Error(error)} />
    ) : (
      <div className="ham-editor ham-editor-error" data-surface-id={props.surfaceId}>
        Collaboration error: {error}
      </div>
    );
  }
  if (!provider || !synced) {
    const LoadingState = props.slots?.LoadingState;
    return LoadingState ? (
      <LoadingState surfaceId={props.surfaceId} />
    ) : (
      <div className="ham-editor ham-editor-loading" data-surface-id={props.surfaceId}>
        Connecting…
      </div>
    );
  }
  return (
    <HamEditorInner
      {...props}
      collab={{ ydoc, provider, ...(config.user ? { user: config.user } : {}) }}
    />
  );
}

/**
 * Renders and edits one surface: a collaborative-capable, block-centric markdown
 * document rooted at a stable block. Routes to the collaboration gate when
 * `collaboration.enabled`, otherwise renders the local editor directly.
 */
export function HamEditor<AnnotationData = unknown>(props: HamEditorProps<AnnotationData>) {
  if (props.collaboration?.enabled) {
    return <CollabHamEditor {...props} />;
  }
  return <HamEditorInner {...props} />;
}
