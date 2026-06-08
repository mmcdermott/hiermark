import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isHamBlockNode, resolveBranchMode } from "../snapshot/blockTreePolicy";
import type { HamBlockId, HamBranchMode, HamBranchPolicy, HamSurfaceSnapshot } from "../types";

/** One block's gutter overlay; React renders the branch button + child chips into `container`. */
export interface GutterEntry {
  blockId: HamBlockId;
  blockType: string;
  /** How this block branches right now — drives which affordance React renders. */
  mode: HamBranchMode;
  container: HTMLElement;
}

export interface BlockGutterContext {
  branchPolicy: HamBranchPolicy;
  activeBlockId: HamBlockId | null;
  editable: boolean;
  /** Branch-edge count already anchored at each block (drives `add-sibling` mode). */
  branchChildCounts: Record<HamBlockId, number>;
  /**
   * Project a snapshot from the current doc. Branchability is arity-aware (it
   * needs childIds/depth), which only the snapshot has — so the plugin resolves
   * each block's mode here rather than from the live PM node.
   */
  computeSnapshot: (doc: PMNode) => HamSurfaceSnapshot;
  /** Receives the current gutter entries so React can portal affordances in. */
  onGutter: (entries: GutterEntry[]) => void;
}

export interface BlockGutterOptions {
  getContext: () => BlockGutterContext | null;
}

/** Plugin key — dispatch `tr.setMeta(blockGutterKey, true)` to force a rebuild. */
export const blockGutterKey = new PluginKey<GutterState>("hamBlockGutter");

interface GutterState {
  decoSet: DecorationSet;
  entries: GutterEntry[];
}

function build(
  doc: PMNode,
  getContext: () => BlockGutterContext | null,
  containers: Map<string, HTMLElement>,
): GutterState {
  const ctx = getContext();
  const decos: Decoration[] = [];
  const entries: GutterEntry[] = [];
  const live = new Set<string>();

  // Resolve branchability from the snapshot (it has arity/depth the live PM node
  // lacks). Built once per rebuild; rebuilds only run on doc change / meta.
  const snapshot = ctx && ctx.editable ? ctx.computeSnapshot(doc) : null;

  doc.descendants((node, pos, parent) => {
    if (!isHamBlockNode(node, parent)) return;
    const blockId = (node.attrs?.dataBlockId as string | null) ?? null;
    if (!blockId) return;

    const classes = ["ham-block"];
    if (ctx && blockId === ctx.activeBlockId) classes.push("ham-block-active");
    decos.push(Decoration.node(pos, pos + node.nodeSize, { class: classes.join(" ") }));

    // A stable overlay container per block (PM reuses it across rebuilds via the
    // decoration key), into which React portals the affordances.
    let el = containers.get(blockId);
    if (!el) {
      el = document.createElement("div");
      el.className = "ham-block-gutter";
      el.contentEditable = "false";
      // Distinct from the block node's own `data-block-id` so DOM queries for
      // block ids don't double-count the gutter overlay.
      el.setAttribute("data-ham-gutter-for", blockId);
      containers.set(blockId, el);
    }
    live.add(blockId);

    const block = snapshot?.blocks[blockId];
    const mode: HamBranchMode =
      ctx && snapshot && block
        ? resolveBranchMode(block, snapshot, ctx.branchPolicy, {
            existingChildCount: ctx.branchChildCounts[blockId] ?? 0,
          })
        : "none";
    entries.push({ blockId, blockType: node.type.name, mode, container: el });
    decos.push(
      Decoration.widget(pos + 1, el, {
        side: -1,
        key: `gutter-${blockId}`,
        ignoreSelection: true,
      }),
    );
  });

  for (const key of [...containers.keys()]) {
    if (!live.has(key)) containers.delete(key);
  }

  return { decoSet: DecorationSet.create(doc, decos), entries };
}

/**
 * Hosts a per-block gutter overlay (`.ham-block-gutter`) and a `.ham-block`
 * node decoration. The overlay containers are stable across rebuilds; React
 * (in `HamEditor`) portals the branch button and child chips into them, so the
 * affordances are fully customizable via `HamEditorSlots`. Entries are pushed to
 * the host through `getContext().onGutter` only when the block set / branchable
 * state changes (a `view().update` signature gate), keeping typing cheap.
 */
export const BlockGutter = Extension.create<BlockGutterOptions>({
  name: "hamBlockGutter",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    const containers = new Map<string, HTMLElement>();
    let lastSig: string | null = null;

    return [
      new Plugin<GutterState>({
        key: blockGutterKey,
        state: {
          init: (_config, state) => build(state.doc, getContext, containers),
          apply(tr, value, _oldState, newState) {
            if (tr.docChanged || tr.getMeta(blockGutterKey)) {
              return build(newState.doc, getContext, containers);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return blockGutterKey.getState(state)?.decoSet ?? DecorationSet.empty;
          },
        },
        view: () => ({
          update(view) {
            const st = blockGutterKey.getState(view.state);
            if (!st) return;
            const sig = st.entries.map((e) => `${e.blockId}:${e.mode}`).join(",");
            if (sig !== lastSig) {
              lastSig = sig;
              getContext()?.onGutter(st.entries);
            }
          },
        }),
      }),
    ];
  },
});
