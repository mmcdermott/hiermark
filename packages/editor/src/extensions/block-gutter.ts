import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isEmptyBlockNode, isHamBlockNode } from "../snapshot/blockTreePolicy";
import type { HamBlockId, HamBranchChildSummary, HamBranchPolicy } from "../types";

export interface BlockGutterContext {
  branchPolicy: HamBranchPolicy;
  childrenByBlockId: Record<HamBlockId, HamBranchChildSummary[]>;
  activeBlockId: HamBlockId | null;
  editable: boolean;
  onBranch: (blockId: HamBlockId, nativeEvent: Event) => void;
  onOpenChild: (child: HamBranchChildSummary, blockId: HamBlockId) => void;
}

export interface BlockGutterOptions {
  getContext: () => BlockGutterContext | null;
}

/** Plugin key — dispatch `tr.setMeta(blockGutterKey, true)` to force a rebuild. */
export const blockGutterKey = new PluginKey<DecorationSet>("hamBlockGutter");

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

type GetContext = () => BlockGutterContext | null;

// ProseMirror reuses widget DOM across rebuilds when the decoration key is
// unchanged, so the click handler must be resolved from the live context at
// click time — capturing `ctx.onBranch` here would bind a stale closure.
function branchButton(blockId: HamBlockId, getContext: GetContext): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ham-branch-button";
  btn.textContent = "↳";
  btn.setAttribute("aria-label", "Branch from this block");
  btn.setAttribute("data-ham-branch-for", blockId);
  btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep editor selection
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    getContext()?.onBranch(blockId, e);
  });
  return btn;
}

function childChips(
  blockId: HamBlockId,
  children: HamBranchChildSummary[],
  getContext: GetContext,
): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "ham-branch-children";
  wrap.contentEditable = "false";
  for (const child of [...children].sort((a, b) => a.order - b.order)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className =
      "ham-branch-child-chip" + (child.active ? " ham-branch-child-chip-active" : "");
    chip.textContent = `→ ${child.title ?? "Untitled"}`;
    chip.setAttribute("aria-label", `Open branch child: ${child.title ?? "Untitled"}`);
    chip.addEventListener("mousedown", (e) => e.preventDefault());
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      getContext()?.onOpenChild(child, blockId);
    });
    wrap.appendChild(chip);
  }
  return wrap;
}

function build(doc: PMNode, getContext: () => BlockGutterContext | null): DecorationSet {
  const ctx = getContext();
  if (!ctx) return DecorationSet.empty;
  const decos: Decoration[] = [];

  doc.descendants((node, pos, parent) => {
    if (!isHamBlockNode(node, parent)) return;
    const blockId = (node.attrs?.dataBlockId as string | null) ?? null;
    if (!blockId) return;

    const classes = ["ham-block"];
    if (blockId === ctx.activeBlockId) classes.push("ham-block-active");
    decos.push(Decoration.node(pos, pos + node.nodeSize, { class: classes.join(" ") }));

    if (ctx.editable && gutterBranchable(node, parent, ctx.branchPolicy)) {
      decos.push(
        Decoration.widget(pos + 1, () => branchButton(blockId, getContext), {
          side: -1,
          key: `branch-${blockId}`,
          ignoreSelection: true,
        }),
      );
    }

    const kids = ctx.childrenByBlockId[blockId];
    if (kids && kids.length > 0) {
      const sig = kids.map((k) => `${k.edgeId}:${k.active ? 1 : 0}`).join(",");
      decos.push(
        Decoration.widget(pos + node.nodeSize - 1, () => childChips(blockId, kids, getContext), {
          side: 1,
          key: `kids-${blockId}-${sig}`,
          ignoreSelection: true,
        }),
      );
    }
  });

  return DecorationSet.create(doc, decos);
}

/**
 * Renders per-block branch affordances (a branch button on each branchable
 * block, plus chips for any existing branch children) as ProseMirror
 * decorations. Data and handlers are supplied through a `getContext` getter so
 * the plugin stays decoupled from React; push `tr.setMeta(blockGutterKey, true)`
 * to rebuild when children or the active block change without a doc edit.
 */
export const BlockGutter = Extension.create<BlockGutterOptions>({
  name: "hamBlockGutter",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    return [
      new Plugin<DecorationSet>({
        key: blockGutterKey,
        state: {
          init: (_config, state) => build(state.doc, getContext),
          apply(tr, value, _oldState, newState) {
            if (tr.docChanged || tr.getMeta(blockGutterKey)) {
              return build(newState.doc, getContext);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return blockGutterKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
