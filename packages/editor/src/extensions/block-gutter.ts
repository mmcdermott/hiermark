import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isEmptyBlockNode, isHamBlockNode } from "../snapshot/blockTreePolicy";
import type { HamBlockId, HamBranchPolicy } from "../types";

/** One block's gutter overlay; React renders the branch button + child chips into `container`. */
export interface GutterEntry {
  blockId: HamBlockId;
  blockType: string;
  branchable: boolean;
  container: HTMLElement;
}

export interface BlockGutterContext {
  branchPolicy: HamBranchPolicy;
  activeBlockId: HamBlockId | null;
  editable: boolean;
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

function gutterBranchable(node: PMNode, parent: PMNode | null, policy: HamBranchPolicy): boolean {
  if (!isHamBlockNode(node, parent)) return false;
  if (isEmptyBlockNode(node)) return false;
  if (typeof policy === "function") return true; // authoritative check happens on create
  switch (policy) {
    case "root-only":
      return false; // the whole surface branches, not individual blocks
    case "headings-only":
      return node.type.name === "heading";
    case "any-nonempty-block":
    default:
      return true;
  }
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

    const branchable = !!ctx && ctx.editable && gutterBranchable(node, parent, ctx.branchPolicy);
    entries.push({ blockId, blockType: node.type.name, branchable, container: el });
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
            const sig = st.entries.map((e) => `${e.blockId}:${e.branchable ? 1 : 0}`).join(",");
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
