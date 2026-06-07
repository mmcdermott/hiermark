import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { HamBlockId } from "../types";

export interface FoldNodeMeta {
  /** Heading level 1–6, or null for a body block. */
  level: number | null;
  id: HamBlockId | null;
}

export interface FoldResult {
  /** Whether each node is hidden by a folded ancestor heading. */
  hidden: boolean[];
  /** For a foldable heading: its collapsed state; null if it has no section. */
  toggleCollapsed: (boolean | null)[];
}

/**
 * Pure heading-section fold resolver (view-only). A heading owns the blocks that
 * follow it until an equal-or-higher heading; folding a heading hides its
 * section. A heading is hidden only by a *folded ancestor*, never by its own
 * fold (its toggle must stay visible). Reused almost verbatim from the reference.
 */
export function computeFold(nodes: FoldNodeMeta[], folded: Set<HamBlockId>): FoldResult {
  const hidden = new Array<boolean>(nodes.length).fill(false);
  const toggleCollapsed = new Array<boolean | null>(nodes.length).fill(null);
  const stack: { level: number; hidden: boolean }[] = [];
  nodes.forEach((n, i) => {
    if (n.level != null) {
      while (stack.length && stack[stack.length - 1]!.level >= n.level) stack.pop();
      const hiddenByAncestor = stack.some((f) => f.hidden);
      if (hiddenByAncestor) hidden[i] = true;
      const next = nodes[i + 1];
      const hasSection = !!next && (next.level == null || next.level > n.level);
      if (n.id && hasSection) toggleCollapsed[i] = folded.has(n.id);
      stack.push({
        level: n.level,
        hidden: hiddenByAncestor || (!!n.id && folded.has(n.id)),
      });
    } else if (stack.some((f) => f.hidden)) {
      hidden[i] = true;
    }
  });
  return { hidden, toggleCollapsed };
}

export interface BlockFoldContext {
  folded: Set<HamBlockId>;
  editable: boolean;
  onToggle: (blockId: HamBlockId) => void;
}

export interface BlockFoldOptions {
  getContext: () => BlockFoldContext | null;
}

/** Plugin key — dispatch `tr.setMeta(blockFoldKey, true)` to rebuild on fold change. */
export const blockFoldKey = new PluginKey<DecorationSet>("hamBlockFold");

function foldToggle(blockId: HamBlockId, collapsed: boolean, onToggle: () => void): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ham-fold-toggle" + (collapsed ? " ham-fold-collapsed" : "");
  btn.textContent = collapsed ? "▸" : "▾";
  btn.setAttribute("aria-label", collapsed ? "Expand section" : "Collapse section");
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  btn.setAttribute("data-ham-fold-for", blockId);
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    onToggle();
  });
  return btn;
}

function build(doc: PMNode, getContext: () => BlockFoldContext | null): DecorationSet {
  const ctx = getContext();
  if (!ctx) return DecorationSet.empty;

  // Collect top-level node metas (heading level + block id) in document order.
  const metas: FoldNodeMeta[] = [];
  const positions: { pos: number; size: number }[] = [];
  doc.forEach((node, pos) => {
    const level = node.type.name === "heading" ? ((node.attrs?.level as number) ?? 1) : null;
    metas.push({ level, id: (node.attrs?.dataBlockId as string | null) ?? null });
    positions.push({ pos, size: node.nodeSize });
  });

  const { hidden, toggleCollapsed } = computeFold(metas, ctx.folded);
  const decos: Decoration[] = [];
  metas.forEach((meta, i) => {
    const { pos, size } = positions[i]!;
    if (hidden[i]) {
      decos.push(Decoration.node(pos, pos + size, { class: "ham-folded" }));
    }
    const collapsed = toggleCollapsed[i];
    if (collapsed != null && meta.id) {
      const blockId = meta.id;
      decos.push(
        Decoration.widget(
          pos + 1,
          () => foldToggle(blockId, collapsed, () => ctx.onToggle(blockId)),
          {
            side: -1,
            key: `fold-${blockId}-${collapsed}`,
            ignoreSelection: true,
          },
        ),
      );
    }
  });

  return DecorationSet.create(doc, decos);
}

/**
 * View-only heading-section fold: hides a folded heading's section (CSS
 * `display:none`, never deletes) and renders a disclosure toggle on foldable
 * headings. Fold state is supplied by the host through `getContext`.
 */
export const BlockFold = Extension.create<BlockFoldOptions>({
  name: "hamBlockFold",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    return [
      new Plugin<DecorationSet>({
        key: blockFoldKey,
        state: {
          init: (_config, state) => build(state.doc, getContext),
          apply(tr, value, _oldState, newState) {
            if (tr.docChanged || tr.getMeta(blockFoldKey)) {
              return build(newState.doc, getContext);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return blockFoldKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
