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
import { MathPopover, type OpenMath } from "./components/MathPopover";
import { LinkPopover } from "./components/LinkPopover";
import type { LinkEditTarget, LinkEditorContext } from "./extensions/link-editor";
import { ImagePopover } from "./components/ImagePopover";
import { BubbleToolbar } from "./components/BubbleToolbar";
import type { ImageEditTarget, ImageEditorContext } from "./extensions/image-editor";
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
import { isSafeUri } from "./extensions/sanitize";
import { stripStableIds } from "./markdown/stable-id";
import { surfaceSnapshotFromDoc } from "./snapshot/getHamSurfaceSnapshot";
import { collectBlockIdentities, planBlockIdRestore } from "./snapshot/blockIdentity";
import { devWarn } from "./devWarn";
import type {
  HamAnnotationSuggestion,
  HamBlockId,
  HamBranchChildSummary,
  HamBranchMode,
  HamBranchRequestEvent,
  HamCollaborationProvider,
  HamCollaborationStatus,
  HamCollaborationUser,
  HamEditorHandle,
  HamEditorMode,
  HamEditorProps,
  HamEditorSavePayload,
  HamSurfaceSnapshot,
} from "./types";

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
  // The math node being edited (click-to-edit LaTeX popover).
  const [openMath, setOpenMath] = useState<OpenMath | null>(null);
  // The link being edited (click / Mod-k popover).
  const [openLink, setOpenLink] = useState<LinkEditTarget | null>(null);
  const linkEditCtxRef = useRef<LinkEditorContext>({ onEdit: () => {} });
  // The image being edited (alt text / title popover).
  const [openImage, setOpenImage] = useState<ImageEditTarget | null>(null);
  const imageEditCtxRef = useRef<ImageEditorContext>({ onEdit: () => {} });
  // Live editor ref so the (build-once) math-click handler resolves the node DOM.
  const editorRef = useRef<Editor | null>(null);
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
    branchPolicy = "bubble-up",
    className,
    onReady,
    onChange,
    onSnapshotChange,
    onBranchRequest,
    onOpenBranchChild,
    onActiveBlockChange,
    onImageUpload,
    onImageUploadError,
    onModeChange,
    isAllowedImageSrc,
    isAllowedLinkHref,
  } = props;

  // Edit surface: the rich editor or a raw-markdown <textarea> (source mode).
  // Source mode is unavailable under collaboration (a full re-parse would
  // clobber the shared Y.Doc).
  const sourceAvailable = !collab;
  const [editorMode, setEditorMode] = useState<HamEditorMode>("rich");
  const [sourceText, setSourceText] = useState("");
  const modeRef = useRef<HamEditorMode>("rich");
  modeRef.current = editorMode;
  const sourceTextRef = useRef("");
  // Markdown captured when source mode opened — lets us skip the re-parse (and
  // thus preserve block ids) when the user toggles back without edits.
  const sourceEnteredRef = useRef("");
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;
  // Read by the (stable) source-commit helper so a fresh host closure each
  // render is always honored without churning the imperative handle.
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;
  // setMode is invoked from the imperative handle (captured once); route through
  // a ref so it always runs the latest closure (current editor, source text).
  const applyModeRef = useRef<(next: HamEditorMode) => void>(() => {});

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
  // The cache key is the doc, but the snapshot also bakes in surfaceId /
  // rootBlockId / title — drop the cache when those change so a re-titled or
  // re-identified surface can't serve a stale snapshot for an unchanged doc.
  useEffect(() => {
    snapshotCacheRef.current = null;
  }, [surfaceId, rootBlockId, title]);
  const computeSnapshot = useCallback(
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

  const snapshotOf = useCallback(
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

  const buildSavePayload = useCallback(
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
        linkEditor: { getContext: () => linkEditCtxRef.current },
        imageEditor: { getContext: () => imageEditCtxRef.current },
        ...(isAllowedImageSrc ? { isAllowedImageSrc } : {}),
        ...(isAllowedLinkHref ? { isAllowedLinkHref } : {}),
        onMathClick: (info) => {
          const ed = editorRef.current;
          if (!ed || !ed.isEditable) return;
          const el = ed.view.nodeDOM(info.pos) as HTMLElement | null;
          if (!el) return;
          setOpenMath({ ...info, element: el });
        },
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
    // booleans and "start"/"end" map straight onto Tiptap's autofocus; a
    // block id is resolved after mount (effect below) via findBlockPos.
    autofocus:
      typeof props.autofocus === "boolean" ||
      props.autofocus === "start" ||
      props.autofocus === "end"
        ? props.autofocus
        : false,
    // Render synchronously in the browser, but NOT during SSR — Tiptap throws /
    // hydration-mismatches if it renders on the server (Next.js App Router, Remix).
    immediatelyRender: typeof window !== "undefined",
    // Give the contenteditable (role="textbox") an accessible name + multiline
    // semantics, so screen readers announce it (axe: aria-input-field-name).
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": props.ariaLabel ?? (title ? `Markdown editor: ${title}` : "Markdown editor"),
        "aria-multiline": "true",
      },
    },
    ...initialContent,
    onUpdate({ editor, transaction }) {
      // Every open popover anchors to a position/element captured at click
      // time; ANY doc change (remote collab edit, image upload resolving, host
      // setContent, sanitize pass) can shift those positions, after which a
      // commit would write to — or link — the wrong range. Close them all on
      // edit; they reopen on the next click against fresh positions.
      setOpenAnnotation(null);
      setOpenMath(null);
      setOpenLink(null);
      setOpenImage(null);
      // The initial block-id stamp is mount mechanics, not a user edit: hosts
      // (e.g. the canvas autosave) must not see a change event for it. The
      // snapshot below still refreshes, so id consumers stay correct.
      if (transaction.getMeta("hamInitialBlockIdStamp") !== true) {
        onChange?.({
          surfaceId,
          content: { kind: "tiptap-json", json: editor.getJSON() },
        });
      }
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
  editorRef.current = editor;
  // Link editing: the extension reports a click / Mod-k; we open the popover.
  linkEditCtxRef.current = { onEdit: (target) => setOpenLink(target) };
  imageEditCtxRef.current = {
    onEdit: (target) => {
      if (editor?.isEditable) setOpenImage(target);
    },
  };
  const applyImage = useCallback(
    (pos: number, attrs: { alt: string; title: string }) => {
      if (!editor) return;
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .command(({ tr, state }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== "image") return false;
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            alt: attrs.alt || null,
            title: attrs.title || null,
          });
          return true;
        })
        .run();
    },
    [editor],
  );
  const applyLink = useCallback(
    (from: number, to: number, href: string) => {
      editor
        ?.chain()
        .focus(undefined, { scrollIntoView: false })
        .setTextSelection({ from, to })
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    },
    [editor],
  );
  const removeLink = useCallback(
    (from: number, to: number) => {
      editor
        ?.chain()
        .focus(undefined, { scrollIntoView: false })
        .setTextSelection({ from, to })
        .extendMarkRange("link")
        .unsetLink()
        .run();
    },
    [editor],
  );

  // Write edited LaTeX back to / delete a math node by position (drives MathPopover).
  const setMathLatex = useCallback(
    (pos: number, latex: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .command(({ tr, state }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || !("latex" in node.attrs)) return false;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex });
          return true;
        })
        .run();
    },
    [editor],
  );
  const deleteMath = useCallback(
    (pos: number) => {
      if (!editor) return;
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .command(({ tr, state }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || !("latex" in node.attrs)) return false;
          tr.delete(pos, pos + node.nodeSize);
          return true;
        })
        .run();
    },
    [editor],
  );

  // Commit edited source markdown into the live editor, preserving block ids.
  // This is the single convergence point for setMode("rich"), save(),
  // getMarkdown(), getJSON(), and getSnapshot() while in source mode — whatever
  // the read path, the text visible in the textarea is what gets read and
  // persisted, never the stale pre-source document. No-op when unchanged, so a
  // "peek at source" round-trip never re-stamps ids.
  const commitSourceText = useCallback(
    (opts?: { emitUpdate?: boolean }) => {
      if (!editor) return;
      if (sourceTextRef.current === sourceEnteredRef.current) return;
      // Capture the pre-edit block identities, re-parse the markdown (which
      // re-stamps fresh ids), then restore ids onto the matching blocks so
      // branch edges / annotations keyed on them survive the round-trip.
      const oldIdentities = collectBlockIdentities(editor.state.doc);
      editor.commands.setContent(sourceTextRef.current, {
        emitUpdate: opts?.emitUpdate ?? false,
        contentType: "markdown",
      } as Parameters<typeof editor.commands.setContent>[1]);
      const plan = planBlockIdRestore(oldIdentities, editor.state.doc);
      if (plan.length) {
        const tr = editor.state.tr;
        for (const { pos, id } of plan) tr.setNodeAttribute(pos, "dataBlockId", id);
        tr.setMeta("addToHistory", false);
        editor.view.dispatch(tr);
      }
      // The editor now equals the source text: a later setMode("rich") must
      // not re-parse (and re-stamp ids) a second time.
      sourceEnteredRef.current = sourceTextRef.current;
      // Snapshot consumers (e.g. canvas column ordering) see the committed doc
      // even when the commit bypassed onUpdate (emitUpdate: false).
      onSnapshotChangeRef.current?.(snapshotOf(editor));
    },
    [editor, snapshotOf],
  );

  // Switch the edit surface. To source: snapshot the current markdown into the
  // textarea. To rich: commit the (possibly edited) markdown.
  applyModeRef.current = (next: HamEditorMode) => {
    if (next === modeRef.current) return;
    if (next === "source") {
      if (!sourceAvailable || !editor) return;
      const md = editor.getMarkdown();
      sourceEnteredRef.current = md;
      sourceTextRef.current = md;
      setSourceText(md);
      setEditorMode("source");
      modeRef.current = "source";
      onModeChangeRef.current?.("source");
      return;
    }
    // → rich
    commitSourceText({ emitUpdate: true });
    setEditorMode("rich");
    modeRef.current = "rich";
    onModeChangeRef.current?.("rich");
  };

  // Branch handler: capture the snapshot synchronously (spec §5.7), then emit.
  const handleBranch = useCallback(
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
        save: async () => {
          if (modeRef.current === "source") commitSourceText();
          return buildSavePayload(editor);
        },
      };
      onBranchRequest?.(event);
    },
    [editor, surfaceId, snapshotOf, buildSavePayload, onBranchRequest, commitSourceText],
  );

  const handleOpenChild = useCallback(
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

  const toggleFold = useCallback((blockId: HamBlockId) => {
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

  // Normalize the host's iterable into a Set memoized by CONTENT, so a fresh
  // iterable with the same ids doesn't force a decoration rebuild every render.
  const highlightedKey = props.highlightedBlockIds
    ? [...props.highlightedBlockIds].sort().join("\u0000")
    : "";
  const highlightedSet = useMemo(
    () => (highlightedKey ? new Set(highlightedKey.split("\u0000")) : undefined),
    [highlightedKey],
  );

  // Keep the gutter context current and force a decoration rebuild when the
  // branch policy / active block / highlight set / editability change, or when
  // a block's branch children change (which can flip a block's mode to
  // `add-sibling`).
  useEffect(() => {
    ctxRef.current = {
      branchPolicy,
      activeBlockId: props.activeBlockId ?? null,
      ...(highlightedSet ? { highlightedBlockIds: highlightedSet } : {}),
      editable,
      branchChildCounts,
      computeSnapshot,
      onGutter: setGutterEntries,
    };
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(blockGutterKey, true));
    }
  }, [
    editor,
    branchPolicy,
    props.activeBlockId,
    highlightedSet,
    editable,
    branchChildCounts,
    computeSnapshot,
  ]);

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
  const setSuggestHighlight = useCallback((next: number | ((i: number) => number)) => {
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
  const commitSuggestion = useCallback(
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
  const onSuggestKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!editor) return false;
      // Never act on keys while an IME composition is in progress (CJK input):
      // committing/navigating mid-composition would eat the user's input.
      if (event.isComposing || event.keyCode === 229) return false;
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
      // Every read path is source-aware: while in source mode, edited markdown
      // is committed (id-preserving) into the editor first, so the text the
      // user sees is the text that reads/saves — never a stale document.
      getSnapshot: () => {
        if (modeRef.current === "source") commitSourceText();
        return snapshotOf(editor);
      },
      getMarkdown: () => {
        if (modeRef.current === "source") commitSourceText();
        return editor.getMarkdown();
      },
      getJSON: () => {
        if (modeRef.current === "source") commitSourceText();
        return editor.getJSON();
      },
      save: async () => {
        if (modeRef.current === "source") commitSourceText();
        return buildSavePayload(editor);
      },
      setContent(content, opts) {
        const emitUpdate = opts?.emitUpdate ?? true;
        if (content.kind === "markdown") {
          editor.commands.setContent(content.markdown, { contentType: "markdown", emitUpdate });
        } else {
          editor.commands.setContent(content.json as object, { emitUpdate });
        }
      },
      uploadImages: (files) => uploadHamImages(editor.view, imageUploadRef.current, files),
      getMode: () => modeRef.current,
      setMode: (next) => applyModeRef.current(next),
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
  }, [editor, surfaceId, snapshotOf, buildSavePayload, commitSourceText]);

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
    if (value.kind !== "markdown") {
      // json seeding into a Y.Doc is unsupported — the doc just stays empty.
      devWarn(
        "collab-json-seed",
        "collaboration seeds from markdown only; a `tiptap-json` value won't seed the shared doc.",
      );
      return;
    }
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
    // Only when it actually changes — Tiptap's setEditable emits an `update`
    // event even when the value is identical, which hosts would misread as a
    // content change (it armed the canvas autosave timer on every mount).
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  // Block-id autofocus (mount-time, like `value`): place the caret inside the
  // requested block once the editor exists. Unknown ids fail gracefully.
  const autofocusBlockRef = useRef(props.autofocus);
  useEffect(() => {
    const target = autofocusBlockRef.current;
    if (!editor || typeof target !== "string" || target === "start" || target === "end") return;
    const pos = findBlockPos(editor.state.doc, target);
    if (pos == null) return;
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .run();
  }, [editor]);

  // Declarative revision swap: when `revision` changes after mount, re-apply
  // `value` (history restore / server push) — preserving block ids for matching
  // blocks. Not under collab (the Y.Doc owns content).
  const lastRevisionRef = useRef(props.revision);
  useEffect(() => {
    if (!editor || collab) return;
    if (props.revision === lastRevisionRef.current) return;
    lastRevisionRef.current = props.revision;
    const oldIdentities = collectBlockIdentities(editor.state.doc);
    if (value.kind === "markdown") {
      editor.commands.setContent(value.markdown, {
        emitUpdate: true,
        contentType: "markdown",
      } as Parameters<typeof editor.commands.setContent>[1]);
    } else {
      editor.commands.setContent(value.json as object, { emitUpdate: true });
    }
    const plan = planBlockIdRestore(oldIdentities, editor.state.doc);
    if (plan.length) {
      const tr = editor.state.tr;
      for (const { pos, id } of plan) tr.setNodeAttribute(pos, "dataBlockId", id);
      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    }
    // If the user is looking at the source textarea, resync it to the new
    // revision — otherwise the stale text would silently overwrite the swap on
    // the next save/commit.
    if (modeRef.current === "source") {
      const md = editor.getMarkdown();
      sourceEnteredRef.current = md;
      sourceTextRef.current = md;
      setSourceText(md);
    }
  }, [editor, collab, props.revision, value]);

  const openType =
    openAnnotation && props.annotations
      ? props.annotations.types.find((t) => t.name === openAnnotation.hit.type)
      : undefined;
  const SuggestPopoverComp = props.slots?.SuggestPopover ?? SuggestPopover;

  const inSource = editorMode === "source";

  return (
    <div
      className={["ham-editor", className, inSource ? "ham-editor-source" : null]
        .filter(Boolean)
        .join(" ")}
      data-surface-id={surfaceId}
      data-mode={editorMode}
    >
      {/* Keep EditorContent mounted (the ProseMirror view must persist) but hide
          it while the raw-markdown textarea is shown. */}
      <div hidden={inSource}>
        <EditorContent editor={editor} />
      </div>
      {inSource && (
        <textarea
          className="ham-source-editor"
          aria-label="Markdown source"
          spellCheck={false}
          readOnly={!editable}
          value={sourceText}
          onChange={(e) => {
            sourceTextRef.current = e.target.value;
            setSourceText(e.target.value);
            // Source edits are real edits: emit them so hosts (and the canvas
            // autosave, which schedules a save() on every change) never treat
            // the textarea as an invisible draft buffer.
            onChange?.({
              surfaceId,
              content: { kind: "markdown", markdown: e.target.value },
            });
          }}
        />
      )}
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
      <MathPopover
        open={openMath}
        onCommit={setMathLatex}
        onDelete={deleteMath}
        onClose={() => setOpenMath(null)}
        onRequestEditorFocus={() => editor?.commands.focus()}
      />
      <LinkPopover
        open={openLink}
        onApply={applyLink}
        onRemove={removeLink}
        onClose={() => setOpenLink(null)}
        isAllowedHref={isAllowedLinkHref ?? isSafeUri}
        onRequestEditorFocus={() => editor?.commands.focus()}
      />
      <ImagePopover
        open={openImage}
        onApply={applyImage}
        onClose={() => setOpenImage(null)}
        onRequestEditorFocus={() => editor?.commands.focus()}
      />
      <BubbleToolbar editor={editor} enabled={props.bubbleMenu !== false && !inSource} />
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
  // Bump to force a manual reconnect (the Retry affordance).
  const [retryToken, setRetryToken] = useState(0);
  // Latest config callbacks via a ref so the connect effect doesn't churn on them.
  const cbRef = useRef(config);
  cbRef.current = config;

  useEffect(() => {
    let cancelled = false;
    let created: HamCollaborationProvider | null = null;
    let onSynced: (() => void) | null = null;
    let onUnsynced: ((e: { number: number }) => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setStatus = (s: HamCollaborationStatus) => cbRef.current.onStatusChange?.(s);
    const BACKOFF = [1000, 2000, 4000];
    const maxRetries = config.maxRetries ?? 3;

    const attempt = async (n: number): Promise<void> => {
      if (cancelled) return;
      setStatus("connecting");
      try {
        const p = await runtime.connect();
        if (cancelled) return void p.destroy();
        created = p;
        setProvider(p);
        setStatus("connected");
        onUnsynced = ({ number }) => {
          if (!cancelled) cbRef.current.onUnsyncedChangesChange?.(number);
        };
        p.on("unsyncedChanges", onUnsynced);
        const markSynced = () => {
          setSynced(true);
          setStatus("synced");
          if (timer) clearTimeout(timer);
        };
        if (p.synced) markSynced();
        else {
          onSynced = () => {
            if (!cancelled) markSynced();
          };
          p.on("synced", onSynced);
        }
        // On timeout, unblock mounting but do NOT mark synced — seeding stays
        // gated on a real sync so late server state can't be duplicated. Never
        // scheduled for an already-synced provider (markSynced above ran before
        // this line, so its clearTimeout saw nothing to clear — scheduling here
        // would deliver a spurious "timedout" AFTER "synced").
        if (config.initialSyncTimeoutMs && !p.synced) {
          timer = setTimeout(() => {
            if (cancelled) return;
            setTimedOut(true);
            setStatus("timedout");
          }, config.initialSyncTimeoutMs);
        }
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error("collaboration failed");
        if (n < maxRetries) {
          cbRef.current.onRetry?.(n + 1);
          timer = setTimeout(() => void attempt(n + 1), BACKOFF[Math.min(n, BACKOFF.length - 1)]);
        } else {
          setError(e.message);
          setStatus("error");
          cbRef.current.onError?.(e);
        }
      }
    };
    void attempt(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (created && onSynced) created.off("synced", onSynced);
      if (created && onUnsynced) created.off("unsyncedChanges", onUnsynced);
      setProvider(null);
      setSynced(false);
      setTimedOut(false);
      const cleaning = created;
      if (cleaning) {
        void flushAndDestroy(cleaning).then((result) => cbRef.current.onBeforeUnmount?.(result));
      }
    };
    // retryToken re-runs the whole connect cycle for a manual reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, config.initialSyncTimeoutMs, retryToken]);

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
    const retry = () => {
      setError(null);
      setSynced(false);
      setTimedOut(false);
      setRetryToken((t) => t + 1);
    };
    const ErrorState = props.slots?.ErrorState;
    return ErrorState ? (
      <ErrorState surfaceId={props.surfaceId} error={new Error(error)} retry={retry} />
    ) : (
      <div className="ham-editor ham-editor-error" data-surface-id={props.surfaceId}>
        <span>Collaboration error: {error}</span>{" "}
        <button type="button" className="ham-collab-retry" onClick={retry}>
          Retry
        </button>
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
    if (!props.collaboration.runtime && !props.collaboration.url) {
      devWarn(
        "collab-no-transport",
        "collaboration.enabled is true but neither `url` nor a custom `runtime` is set — the editor can't connect.",
      );
    }
    return <CollabHamEditor {...props} />;
  }
  return <HamEditorInner {...props} />;
}
