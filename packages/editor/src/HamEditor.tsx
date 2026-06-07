import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";

import {
  AnnotationLayer,
  annotationLayerKey,
  type AnnotationLayerContext,
} from "./annotations/plugin";
import { BlockGutter, blockGutterKey, type BlockGutterContext } from "./extensions/block-gutter";
import { createHamEditorExtensions } from "./extensions/createHamEditorExtensions";
import { getHamSurfaceSnapshot } from "./snapshot/getHamSurfaceSnapshot";
import type {
  HamBlockId,
  HamBranchChildSummary,
  HamBranchRequestEvent,
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
 * Renders and edits one surface: a collaborative-capable, block-centric markdown
 * document rooted at a stable block. In Phase 1 this is the local (non-collab)
 * editor; collaboration is layered on in Phase 3.
 */
export function HamEditor<AnnotationData = unknown>(props: HamEditorProps<AnnotationData>) {
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
      ...createHamEditorExtensions({ collaboration: !!props.collaboration?.enabled }),
      BlockGutter.configure({ getContext: () => ctxRef.current }),
      AnnotationLayer.configure({ getContext: () => annoCtxRef.current }),
    ],
    // Extensions are intentionally built once; surface identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialContent = useMemo(
    () =>
      value.kind === "markdown"
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
