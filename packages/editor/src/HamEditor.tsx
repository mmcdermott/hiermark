import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { createPortal } from "react-dom";
import * as Y from "yjs";

import { AnnotationPopover, type OpenAnnotation } from "./annotations/AnnotationPopover";
import {
  AnnotationLayer,
  annotationLayerKey,
  type AnnotationLayerContext,
} from "./annotations/plugin";
import {
  AnnotationSuggest,
  annotationSuggestKey,
  dismissAnnotationSuggest,
  type AnnotationSuggestContext,
  type AnnotationSuggestState,
} from "./annotations/suggest";
import { SuggestPopover } from "./annotations/SuggestPopover";
import { createHocuspocusCollab, flushAndDestroy } from "./collab/hocuspocus";
import { BlockFold, blockFoldKey, type BlockFoldContext } from "./extensions/block-fold";
import {
  BlockGutter,
  blockGutterKey,
  type BlockGutterContext,
  type GutterEntry,
} from "./extensions/block-gutter";
import { BlockGutterAffordances } from "./components/gutter";
import {
  createHamEditorExtensions,
  type HamCollabBinding,
} from "./extensions/createHamEditorExtensions";
import { uploadHamImages, type ImageUploadContext } from "./extensions/image-upload";
import { stripStableIds } from "./markdown/stable-id";
import { surfaceSnapshotFromDoc } from "./snapshot/getHamSurfaceSnapshot";
import type {
  HamAnnotationSuggestion,
  HamBlockId,
  HamBranchChildSummary,
  HamBranchMode,
  HamBranchRequestEvent,
  HamCollaborationProvider,
  HamCollaborationUser,
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

/** A readable, distinct caret color when the host doesn't supply one. */
const CARET_COLORS = [
  "#6f5cff",
  "#0a7d4f",
  "#c73b3b",
  "#1b6ec2",
  "#b5651d",
  "#9b2fae",
  "#138086",
  "#d4793b",
];
function randomCaretColor(): string {
  return CARET_COLORS[Math.floor(Math.random() * CARET_COLORS.length)]!;
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
  props: HamEditorProps<AnnotationData> & { collab?: HamCollabBinding; seedAllowed?: boolean },
) {
  const collab = props.collab;
  const seededRef = useRef(false);

  // View-only fold state, seeded from collapsedBlockIds (spec §2.4, §8 fold).
  const [foldedSet, setFoldedSet] = useState<Set<HamBlockId>>(
    () => new Set(props.collapsedBlockIds ?? []),
  );
  const foldRef = useRef<BlockFoldContext | null>(null);
  // The annotation popover currently open (Floating UI).
  const [openAnnotation, setOpenAnnotation] = useState<OpenAnnotation | null>(null);
  // The annotation type-ahead (search) state, plus the highlighted candidate.
  const suggestCtxRef = useRef<AnnotationSuggestContext | null>(null);
  const [suggest, setSuggest] = useState<AnnotationSuggestState>({
    active: false,
    trigger: null,
    query: "",
    range: null,
    items: [],
  });
  const [suggestIndex, setSuggestIndex] = useState(0);
  // Mirror of the highlighted index for the keyboard handler — read synchronously
  // so rapid keystrokes (e.g. ArrowDown then Enter) never act on a stale index.
  const suggestIndexRef = useRef(0);

  const {
    surfaceId,
    value,
    title,
    editable = true,
    rootBlockId = "blk_root",
    branchPolicy = "smart",
    className,
    onReady,
    onChange,
    onSnapshotChange,
    onBranchRequest,
    onOpenBranchChild,
    onActiveBlockChange,
    onImageUpload,
    onImageUploadError,
  } = props;

  // The gutter reads its data/handlers through a stable getter (never a cloned
  // ref object — Tiptap deep-clones extension options).
  const ctxRef = useRef<BlockGutterContext | null>(null);
  const [gutterEntries, setGutterEntries] = useState<GutterEntry[]>([]);
  const annoCtxRef = useRef<AnnotationLayerContext | null>(null);
  const lastActiveBlock = useRef<HamBlockId | null>(null);
  // Read the latest onReady via a ref so the handle is published exactly once
  // per editor — a new onReady closure each render must not re-fire it.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // Live image-upload context for the ImageUpload extension + the handle's
  // uploadImages(). Read through a ref so a new handler closure each render is
  // picked up without rebuilding the (build-once) extension list.
  const imageUploadRef = useRef<ImageUploadContext>({
    upload: onImageUpload ?? null,
    surfaceId,
    onError: onImageUploadError,
  });
  imageUploadRef.current = {
    upload: onImageUpload ?? null,
    surfaceId,
    onError: onImageUploadError,
  };
  // Debounce timer for host snapshot emission (see onUpdate).
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    },
    [],
  );

  // One snapshot projection per document, shared across consumers. Every
  // keystroke otherwise re-walks the whole doc 3-4× (onUpdate, the gutter, and
  // the annotation layer each project independently); memoizing by doc identity
  // (PM docs are immutable, so same ref ⇒ same content) collapses that to a
  // single walk per doc — and plain typing produces exactly one doc per stroke.
  const snapshotCacheRef = useRef<{ doc: PMNode; snap: HamSurfaceSnapshot } | null>(null);
  const computeSnapshot = useStable(
    (doc: PMNode): HamSurfaceSnapshot => {
      const cached = snapshotCacheRef.current;
      if (cached && cached.doc === doc) return cached.snap;
      const snap = surfaceSnapshotFromDoc(doc, {
        surfaceId,
        rootBlockId,
        ...(title !== undefined ? { title } : {}),
      });
      snapshotCacheRef.current = { doc, snap };
      return snap;
    },
    [surfaceId, rootBlockId, title],
  );

  const snapshotOf = useStable(
    (editor: Editor): HamSurfaceSnapshot => computeSnapshot(editor.state.doc),
    [computeSnapshot],
  );

  // Branch-edge count per block, so the gutter knows when to switch a block's
  // `+` to an "add sibling" affordance (mode `add-sibling`).
  const branchChildCounts = useMemo(() => {
    const counts: Record<HamBlockId, number> = {};
    const map = props.branchChildren;
    if (map) for (const blockId in map) counts[blockId] = map[blockId]?.length ?? 0;
    return counts;
  }, [props.branchChildren]);

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
      ...createHamEditorExtensions({
        ...(collab ? { collab } : {}),
        imageUpload: { getContext: () => imageUploadRef.current },
      }),
      BlockGutter.configure({ getContext: () => ctxRef.current }),
      BlockFold.configure({ getContext: () => foldRef.current }),
      AnnotationLayer.configure({ getContext: () => annoCtxRef.current }),
      AnnotationSuggest.configure({ getContext: () => suggestCtxRef.current }),
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
      // The open popover anchors to a now-possibly-stale annotation element;
      // close it on edit (it reopens on the next click against fresh decorations).
      setOpenAnnotation(null);
      onChange?.({
        surfaceId,
        content: { kind: "tiptap-json", json: editor.getJSON() },
      });
      // Debounce the host snapshot emission: it drives only the canvas's column
      // ordering (cosmetic), while branch/save capture snapshots synchronously
      // when they actually need them. This keeps a full projection off the
      // keystroke hot path.
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = setTimeout(() => onSnapshotChange?.(snapshotOf(editor)), 300);
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
    (blockId: HamBlockId, mode: HamBranchMode = "branch") => {
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
        mode,
        save: async () => buildSavePayload(editor),
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

  const toggleFold = useStable((blockId: HamBlockId) => {
    setFoldedSet((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  // Keep the fold context current and rebuild fold decorations.
  useEffect(() => {
    foldRef.current = { folded: foldedSet, editable, onToggle: toggleFold };
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(blockFoldKey, true));
    }
  }, [editor, foldedSet, editable, toggleFold]);

  // Keep the gutter context current and force a decoration rebuild when the
  // branch policy / active block / editability change, or when a block's branch
  // children change (which can flip a block's mode to `add-sibling`).
  useEffect(() => {
    ctxRef.current = {
      branchPolicy,
      activeBlockId: props.activeBlockId ?? null,
      editable,
      branchChildCounts,
      computeSnapshot,
      onGutter: setGutterEntries,
    };
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(blockGutterKey, true));
    }
  }, [editor, branchPolicy, props.activeBlockId, editable, branchChildCounts, computeSnapshot]);

  // Keep the annotation context current and rebuild the annotation decorations.
  useEffect(() => {
    annoCtxRef.current = props.annotations
      ? {
          registry: props.annotations as AnnotationLayerContext["registry"],
          context: props.annotationContext ?? {},
          surfaceId,
          rootBlockId,
          computeSnapshot,
          onOpen: (hit, element) => setOpenAnnotation({ hit, element }),
        }
      : null;
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(annotationLayerKey, true));
    }
  }, [editor, props.annotations, props.annotationContext, surfaceId, rootBlockId, computeSnapshot]);

  // Set the highlighted index in both the ref (for the keyboard handler) and
  // React state (for the render) so they can't diverge.
  const setSuggestHighlight = useStable((next: number | ((i: number) => number)) => {
    setSuggestIndex((i) => {
      const v = typeof next === "function" ? next(i) : next;
      suggestIndexRef.current = v;
      return v;
    });
  }, []);

  // Insert a chosen suggestion's literal text over the trigger + query range,
  // then let the recognizers turn it into an annotation (e.g. an @key pill). The
  // range is read from the live plugin state — never a captured (possibly stale)
  // React value.
  const commitSuggestion = useStable(
    (item: HamAnnotationSuggestion) => {
      if (!editor) return;
      const range = annotationSuggestKey.getState(editor.state)?.suggest.range;
      if (!range) return;
      const { from, to } = range;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.insertText(item.insert, from, to);
          return true;
        })
        .run();
    },
    [editor],
  );

  // A STABLE keyboard handler: it reads the live items/range from plugin state
  // and the index from a ref, so it's immune to React-render lag under rapid
  // keystrokes (the plugin forwards keys to it while the popover is open).
  const onSuggestKeyDown = useStable(
    (event: KeyboardEvent): boolean => {
      if (!editor) return false;
      const st = annotationSuggestKey.getState(editor.state)?.suggest;
      if (!st?.active || st.items.length === 0) return false;
      const n = st.items.length;
      if (event.key === "ArrowDown") {
        setSuggestHighlight((i) => (i + 1) % n);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSuggestHighlight((i) => (i - 1 + n) % n);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = st.items[Math.min(suggestIndexRef.current, n - 1)] ?? st.items[0];
        if (item) commitSuggestion(item);
        return true;
      }
      if (event.key === "Escape") {
        dismissAnnotationSuggest(editor);
        return true;
      }
      return false;
    },
    [editor, commitSuggestion, setSuggestHighlight],
  );

  // Keep the type-ahead context current. onState/onKeyDown are stable, so the
  // context is set once per editor — the plugin always sees a fresh handler.
  useEffect(() => {
    suggestCtxRef.current = props.annotations
      ? {
          registry: props.annotations as AnnotationSuggestContext["registry"],
          context: props.annotationContext ?? {},
          onState: (state) => {
            setSuggest(state);
            setSuggestHighlight(0);
          },
          onKeyDown: onSuggestKeyDown,
        }
      : null;
  }, [props.annotations, props.annotationContext, onSuggestKeyDown, setSuggestHighlight]);

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
      setContent(content, opts) {
        const emitUpdate = opts?.emitUpdate ?? true;
        if (content.kind === "markdown") {
          editor.commands.setContent(content.markdown, { contentType: "markdown", emitUpdate });
        } else {
          editor.commands.setContent(content.json as object, { emitUpdate });
        }
      },
      uploadImages: (files) => uploadHamImages(editor.view, imageUploadRef.current, files),
      collapseBlock(blockId) {
        setFoldedSet((prev) => (prev.has(blockId) ? prev : new Set(prev).add(blockId)));
      },
      expandBlock(blockId) {
        setFoldedSet((prev) => {
          if (!prev.has(blockId)) return prev;
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
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
    // A ref guard makes this a true one-time bootstrap regardless of how often
    // the (freshly-constructed) `collab` object changes identity across renders
    // — otherwise a re-render while the doc is empty would *resurrect* content
    // the user just deleted. Seed only after a *real* sync (`seedAllowed`), never
    // on the timeout fallback, so late-arriving server state can't duplicate it.
    if (seededRef.current || !editor || !collab || !props.seedAllowed) return;
    if (value.kind !== "markdown") return; // json seeding into a Y.Doc is unsupported
    seededRef.current = true;
    if (editor.isEmpty) {
      editor.commands.setContent(stripStableIds(value.markdown).trim(), {
        emitUpdate: false,
        // contentType is added by @tiptap/markdown's SetContentOptions augmentation
        contentType: "markdown",
      } as Parameters<typeof editor.commands.setContent>[1]);
    }
  }, [editor, collab, props.seedAllowed, value]);

  // Reflect editable changes.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const openType =
    openAnnotation && props.annotations
      ? props.annotations.types.find((t) => t.name === openAnnotation.hit.type)
      : undefined;
  const SuggestPopoverComp = props.slots?.SuggestPopover ?? SuggestPopover;

  return (
    <div
      className={["ham-editor", className].filter(Boolean).join(" ")}
      data-surface-id={surfaceId}
    >
      <EditorContent editor={editor} />
      {gutterEntries.map((entry) =>
        createPortal(
          <BlockGutterAffordances
            entry={entry}
            surfaceId={surfaceId}
            {...(props.slots ? { slots: props.slots } : {})}
            branchChildren={props.branchChildren?.[entry.blockId] ?? []}
            onBranch={handleBranch}
            onOpenChild={handleOpenChild}
          />,
          entry.container,
          entry.blockId,
        ),
      )}
      <AnnotationPopover
        open={openAnnotation}
        type={openType}
        context={(props.annotationContext ?? {}) as AnnotationData}
        onClose={() => setOpenAnnotation(null)}
      />
      <SuggestPopoverComp
        state={suggest}
        index={suggestIndex}
        editor={editor}
        onHover={setSuggestHighlight}
        onSelect={commitSuggestion}
      />
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
  // The editor must bind to the SAME Y.Doc the transport syncs. Prefer the
  // injected runtime's doc, then config.ydoc, else create one.
  const [ydoc] = useState<Y.Doc>(
    () =>
      (config.runtime?.ydoc as Y.Doc | undefined) ??
      (config.ydoc as Y.Doc | undefined) ??
      new Y.Doc(),
  );
  const runtime = useMemo(
    () => config.runtime ?? createHocuspocusCollab(config, ydoc),
    // Build the runtime once for this doc/config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ydoc],
  );

  const [provider, setProvider] = useState<HamCollaborationProvider | null>(null);
  // `synced` is a *real* sync (safe to seed); `timedOut` only unblocks mounting.
  const [synced, setSynced] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: HamCollaborationProvider | null = null;
    let onSynced: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const p = await runtime.connect();
        if (cancelled) return void p.destroy();
        created = p;
        setProvider(p);
        if (p.synced) setSynced(true);
        else {
          onSynced = () => {
            if (cancelled) return;
            setSynced(true);
            // A real sync supersedes the timeout fallback.
            if (timer) clearTimeout(timer);
          };
          p.on("synced", onSynced);
        }
        // On timeout, unblock mounting but do NOT mark synced — seeding stays
        // gated on a real sync so late server state can't be duplicated.
        if (config.initialSyncTimeoutMs) {
          timer = setTimeout(() => {
            if (!cancelled) setTimedOut(true);
          }, config.initialSyncTimeoutMs);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "collaboration failed");
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Remove the sync listener (it would otherwise leak on a reused runtime).
      if (created && onSynced) created.off("synced", onSynced);
      setProvider(null);
      setSynced(false);
      setTimedOut(false);
      if (created) flushAndDestroy(created);
    };
  }, [runtime, config.initialSyncTimeoutMs]);

  // Always give the caret a name + color so remote cursors are visible by
  // default (CollaborationCaret needs a user to render a labeled caret) — the
  // host's user wins; otherwise we pick a stable random color for this session.
  const user = useMemo<HamCollaborationUser>(
    () => ({
      name: config.user?.name ?? "Anonymous",
      color: config.user?.color ?? randomCaretColor(),
    }),
    [config.user?.name, config.user?.color],
  );
  // Stable collab binding so the inner editor's effects don't churn on identity.
  const collab = useMemo<HamCollabBinding | null>(
    () => (provider ? { ydoc, provider, user } : null),
    [ydoc, provider, user],
  );

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
  if (!collab || (!synced && !timedOut)) {
    const LoadingState = props.slots?.LoadingState;
    return LoadingState ? (
      <LoadingState surfaceId={props.surfaceId} />
    ) : (
      <div className="ham-editor ham-editor-loading" data-surface-id={props.surfaceId}>
        Connecting…
      </div>
    );
  }
  return <HamEditorInner {...props} collab={collab} seedAllowed={synced} />;
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
