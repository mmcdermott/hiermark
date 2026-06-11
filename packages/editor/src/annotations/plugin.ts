import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  isHiermarkBlockNode,
  LIST_CONTAINER_TYPES,
  TEXT_AND_RECURSE_TYPES,
} from "../snapshot/blockTreePolicy";
import { surfaceSnapshotFromDoc } from "../snapshot/getHiermarkSurfaceSnapshot";
import type {
  HiermarkAnnotationHit,
  HiermarkAnnotationRegistry,
  HiermarkBlockSnapshot,
  HiermarkSurfaceId,
  HiermarkSurfaceSnapshot,
} from "../types";
import { recognizeAnnotations } from "./recognize";

export interface AnnotationLayerContext<Ctx = unknown> {
  registry: HiermarkAnnotationRegistry<Ctx>;
  context: Ctx;
  surfaceId: HiermarkSurfaceId;
  rootBlockId: string;
  /**
   * Shared, per-doc-memoized snapshot projector (from HiermarkEditor). Lets the
   * annotation layer reuse the same projection the gutter/onUpdate already did
   * for this doc instead of walking it again. Falls back to a fresh projection.
   */
  computeSnapshot?: (doc: PMNode) => HiermarkSurfaceSnapshot;
  /** Called when an annotation with a render component is clicked. */
  onOpen?: (hit: HiermarkAnnotationHit, element: HTMLElement) => void;
}

interface AnnotationPluginValue {
  decoSet: DecorationSet;
  hitsById: Map<string, HiermarkAnnotationHit>;
}

export interface AnnotationLayerOptions {
  getContext: () => AnnotationLayerContext | null;
}

/** Plugin key — dispatch `tr.setMeta(annotationLayerKey, true)` to rebuild on ctx change. */
export const annotationLayerKey = new PluginKey<AnnotationPluginValue>("hiermarkAnnotations");

interface BlockTextIndex {
  /** The block's recognizable text (direct text only — nested lists excluded). */
  text: string;
  /** Absolute PM position of each character in `text` (length === text.length). */
  charToPos: number[];
  /** Absolute position of the block's end. */
  end: number;
}

/**
 * Build a char-index → absolute-PM-position map for a block's text. Walking the
 * inline content (rather than assuming `firstTextStart + offset`) keeps offsets
 * correct across inline atoms (math) and hard breaks, which occupy PM positions
 * but contribute no characters. For item/blockquote blocks, nested lists are
 * skipped so the indexed text matches the snapshot's direct-children text.
 */
function buildBlockTextIndex(node: PMNode, pos: number): BlockTextIndex {
  const stopAtLists = TEXT_AND_RECURSE_TYPES.has(node.type.name);
  let text = "";
  const charToPos: number[] = [];
  node.descendants((child, rel) => {
    if (stopAtLists && LIST_CONTAINER_TYPES.has(child.type.name)) return false;
    if (child.isText && child.text) {
      const base = pos + 1 + rel;
      for (let j = 0; j < child.text.length; j++) charToPos.push(base + j);
      text += child.text;
    }
    return undefined;
  });
  return { text, charToPos, end: pos + node.nodeSize };
}

function chipEl(hit: HiermarkAnnotationHit): HTMLElement {
  const span = document.createElement("span");
  span.className = `hiermark-annotation-chip hiermark-annotation-chip-${hit.type}`;
  span.contentEditable = "false";
  span.setAttribute("data-annotation-id", hit.id);
  span.setAttribute("data-annotation-type", hit.type);
  span.textContent = hit.label ?? hit.type;
  return span;
}

function build(doc: PMNode, ctx: AnnotationLayerContext | null): AnnotationPluginValue {
  if (!ctx) return { decoSet: DecorationSet.empty, hitsById: new Map() };
  const hitsById = new Map<string, HiermarkAnnotationHit>();

  const snapshot = ctx.computeSnapshot
    ? ctx.computeSnapshot(doc)
    : surfaceSnapshotFromDoc(doc, { surfaceId: ctx.surfaceId, rootBlockId: ctx.rootBlockId });

  const textByBlockId: Record<string, string> = {};
  const indexByBlockId = new Map<string, BlockTextIndex>();
  doc.descendants((node, pos, parent) => {
    if (!isHiermarkBlockNode(node, parent)) return;
    const id = (node.attrs?.dataBlockId as string | null) ?? null;
    if (!id) return;
    const index = buildBlockTextIndex(node, pos);
    textByBlockId[id] = index.text;
    indexByBlockId.set(id, index);
  });

  const blocks: HiermarkBlockSnapshot[] = snapshot.blockOrder
    .map((id) => snapshot.blocks[id]!)
    .filter((b) => b.id !== snapshot.rootBlockId);

  const hits = recognizeAnnotations({
    registry: ctx.registry,
    surfaceId: ctx.surfaceId,
    blocks,
    textByBlockId,
    context: ctx.context,
  });

  const placementOf = new Map(ctx.registry.types.map((t) => [t.name, t]));
  const decos: Decoration[] = [];

  for (const hit of hits) {
    const type = placementOf.get(hit.type);
    const placement = type?.placement ?? "inline";
    const index = indexByBlockId.get(hit.blockId);
    if (!index) continue;
    if (type?.render) hitsById.set(hit.id, hit); // clickable → opens a popover

    if (
      (placement === "inline" || placement === "decoration" || placement === "popover") &&
      hit.from != null &&
      hit.to != null &&
      hit.to > hit.from
    ) {
      const from = index.charToPos[hit.from];
      const lastChar = index.charToPos[hit.to - 1];
      if (from == null || lastChar == null) continue; // offset out of range
      const to = lastChar + 1;
      const classes = ["hiermark-annotation", `hiermark-annotation-${hit.type}`];
      const extra = type?.inlineClass?.(hit, ctx.context);
      if (extra) classes.push(extra);
      decos.push(
        Decoration.inline(from, to, {
          class: classes.join(" "),
          "data-annotation-type": hit.type,
          "data-annotation-id": hit.id,
        }),
      );
    } else if (placement === "block-chip" || placement === "gutter") {
      const at = Math.max(index.charToPos[0] ?? index.end - 1, index.end - 1);
      decos.push(
        Decoration.widget(at, () => chipEl(hit), {
          side: 1,
          key: `anno-${hit.id}`,
          ignoreSelection: true,
        }),
      );
    }
  }

  return { decoSet: DecorationSet.create(doc, decos), hitsById };
}

/**
 * Recognizes structured annotations (tasks, citations, URLs, mentions, …) over
 * the live document and renders them as ProseMirror decorations: inline
 * highlights for in-text matches and chips for block-level annotations. Pure
 * recognition is delegated to {@link recognizeAnnotations}; this plugin only
 * derives block text/positions and builds decorations.
 */
export const AnnotationLayer = Extension.create<AnnotationLayerOptions>({
  name: "hiermarkAnnotationLayer",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    return [
      new Plugin<AnnotationPluginValue>({
        key: annotationLayerKey,
        state: {
          init: (_config, state) => build(state.doc, getContext()),
          apply(tr, value, _oldState, newState) {
            if (tr.docChanged || tr.getMeta(annotationLayerKey)) {
              return build(newState.doc, getContext());
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return annotationLayerKey.getState(state)?.decoSet ?? DecorationSet.empty;
          },
          // A raw DOM click handler (not handleClick, which needs layout coords
          // jsdom lacks) so clicking an annotation opens its popover.
          handleDOMEvents: {
            click(view, event) {
              const target = event.target as HTMLElement | null;
              const el = target?.closest<HTMLElement>("[data-annotation-id]");
              if (!el) return false;
              const id = el.getAttribute("data-annotation-id");
              if (!id) return false;
              const value = annotationLayerKey.getState(view.state);
              const hit = value?.hitsById.get(id);
              const ctx = getContext();
              if (hit && ctx?.onOpen) {
                ctx.onOpen(hit, el);
                return true;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
