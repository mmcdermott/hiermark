import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

import { generateBlockId } from "../id";
import { DEFAULT_HAM_BLOCK_TYPES } from "../snapshot/blockTreePolicy";

export interface BlockIdOptions {
  /** Node types that receive a stable `dataBlockId`. Defaults to the HAM block types. */
  types: string[];
  /** Id generator; defaults to `blk_<nanoid>`. */
  generate: () => string;
}

/**
 * Walk the whole doc assigning a fresh id to every allowlisted node that is
 * missing one *or* whose id was already seen (the paste/import dedup case).
 * Returns whether `tr` was modified. Shared by the initial pass and every
 * subsequent transaction so the invariant — every block has a unique id — holds.
 */
function assignBlockIds(
  doc: PMNode,
  tr: Transaction,
  types: Set<string>,
  generate: () => string,
): boolean {
  let modified = false;
  const seen = new Set<string>();
  doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return;
    const id = node.attrs.dataBlockId as string | null;
    if (!id || seen.has(id)) {
      const fresh = generate();
      tr.setNodeAttribute(pos, "dataBlockId", fresh);
      seen.add(fresh);
      modified = true;
    } else {
      seen.add(id);
    }
  });
  return modified;
}

/**
 * Assigns a stable, unique `dataBlockId` to every structural block node and
 * repairs duplicates introduced by paste/import/split.
 *
 * Invariants (spec §5.9), all battle-tested in the reference implementation:
 *  - `keepOnSplit: false` clears the id on the split-off fragment, so pressing
 *    Enter mid-block gives the new fragment a *fresh* id rather than duplicating;
 *  - the `appendTransaction` pass runs only on doc changes (never selection),
 *    walks the whole tree (so nested list/task items get ids too), and assigns a
 *    fresh id whenever one is missing *or already seen* — the paste-dedup case;
 *  - `onCreate` runs the same pass so the *initial* content is id-stamped before
 *    the first snapshot/branch;
 *  - ids are immutable and never remapped after the host persists them.
 */
export const BlockId = Extension.create<BlockIdOptions>({
  name: "hamBlockId",

  addOptions() {
    return {
      types: [...DEFAULT_HAM_BLOCK_TYPES],
      generate: generateBlockId,
    };
  },

  onCreate() {
    const types = new Set(this.options.types);
    const tr = this.editor.state.tr;
    if (assignBlockIds(this.editor.state.doc, tr, types, this.options.generate)) {
      tr.setMeta("addToHistory", false);
      this.editor.view.dispatch(tr);
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dataBlockId: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id"),
            renderHTML: (attrs: { dataBlockId?: string | null }) =>
              attrs.dataBlockId ? { "data-block-id": attrs.dataBlockId } : {},
            keepOnSplit: false,
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const types = new Set(this.options.types);
    const generate = this.options.generate;
    return [
      new Plugin({
        key: new PluginKey("hamBlockId"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          const modified = assignBlockIds(newState.doc, tr, types, generate);
          return modified ? tr : null;
        },
      }),
    ];
  },
});
