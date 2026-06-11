import { Extension } from "@tiptap/core";
import type { Fragment, Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

import { generateBlockId } from "../id";
import { DEFAULT_HIERMARK_BLOCK_TYPES } from "../snapshot/blockTreePolicy";

export interface BlockIdOptions {
  /** Node types that receive a stable `dataBlockId`. Defaults to the Hiermark block types. */
  types: string[];
  /** Id generator; defaults to `blk_<nanoid>`. */
  generate: () => string;
}

interface IdOccurrence {
  pos: number;
  node: PMNode;
}

/**
 * Walk the whole doc assigning a fresh id to every allowlisted node that is
 * missing one, and resolve DUPLICATE ids in favor of the occurrence that most
 * plausibly *is* the block the id referred to before this transaction — host
 * persisted branch edges / annotations key on these ids, so picking the wrong
 * keeper silently re-anchors them:
 *
 *  1. the occurrence whose text equals the pre-transaction holder's text —
 *     identity follows content, so Enter at the START of a block keeps the id
 *     on the half that carries the block's text, not the empty half above it;
 *  2. tie-break by the old holder's position mapped through the transactions —
 *     identity stays put, so a copy pasted ABOVE the original can't steal the
 *     id merely by appearing first in document order;
 *  3. otherwise the first occurrence (initial stamp / both-new case).
 *
 * Returns whether `tr` was modified. Shared by the initial pass (no `old`) and
 * every subsequent transaction so the invariant — every block has a unique,
 * stable id — holds.
 */
function assignBlockIds(
  doc: PMNode,
  tr: Transaction,
  types: Set<string>,
  generate: () => string,
  old?: { doc: PMNode; mapPos: (pos: number) => number },
): boolean {
  const byId = new Map<string, IdOccurrence[]>();
  const missing: IdOccurrence[] = [];
  doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return;
    const id = node.attrs.dataBlockId as string | null;
    if (!id) {
      missing.push({ pos, node });
    } else {
      const list = byId.get(id);
      if (list) list.push({ pos, node });
      else byId.set(id, [{ pos, node }]);
    }
  });

  // Old holders, built lazily — only a transaction that actually produced a
  // duplicate or a candidate id swap pays for the old-doc walk.
  let oldByIdCache: Map<string, { pos: number; text: string }> | undefined;
  const getOldById = (): Map<string, { pos: number; text: string }> | undefined => {
    if (!old) return undefined;
    if (!oldByIdCache) {
      const map = new Map<string, { pos: number; text: string }>();
      old.doc.descendants((node, pos) => {
        if (!types.has(node.type.name)) return;
        const oid = node.attrs.dataBlockId as string | null;
        if (oid && !map.has(oid)) map.set(oid, { pos, text: node.textContent });
      });
      oldByIdCache = map;
    }
    return oldByIdCache;
  };

  let modified = false;
  for (const m of missing) {
    // Split-at-start detection (the splitListItem shape): the id stayed on the
    // now-EMPTY first half while the id-less second half carries all of the
    // block's text. Identity follows content — swap, so host-persisted branch
    // edges / annotations keep pointing at the text they were anchored to.
    let swapped = false;
    if (old && m.node.textContent !== "") {
      const $m = doc.resolve(m.pos);
      const index = $m.index();
      if (index > 0) {
        const prev = $m.parent.child(index - 1);
        const prevId = prev.attrs?.dataBlockId as string | null;
        if (prevId && prev.type === m.node.type && prev.textContent === "") {
          const holder = getOldById()?.get(prevId);
          if (holder && holder.text === m.node.textContent) {
            tr.setNodeAttribute(m.pos, "dataBlockId", prevId);
            tr.setNodeAttribute(m.pos - prev.nodeSize, "dataBlockId", generate());
            modified = true;
            swapped = true;
          }
        }
      }
    }
    if (!swapped) {
      tr.setNodeAttribute(m.pos, "dataBlockId", generate());
      modified = true;
    }
  }

  for (const [id, occurrences] of byId) {
    if (occurrences.length < 2) continue;
    const holder = getOldById()?.get(id);
    let keeperIndex = 0;
    if (holder && old) {
      const contentMatches = occurrences
        .map((occ, index) => ({ occ, index }))
        .filter(({ occ }) => occ.node.textContent === holder.text);
      if (contentMatches.length === 1) {
        keeperIndex = contentMatches[0]!.index;
      } else {
        const target = old.mapPos(holder.pos);
        const pool = contentMatches.length
          ? contentMatches
          : occurrences.map((occ, index) => ({ occ, index }));
        keeperIndex = pool.reduce((best, cur) =>
          Math.abs(cur.occ.pos - target) < Math.abs(best.occ.pos - target) ? cur : best,
        ).index;
      }
    }
    occurrences.forEach((occ, index) => {
      if (index === keeperIndex) return;
      tr.setNodeAttribute(occ.pos, "dataBlockId", generate());
      modified = true;
    });
  }
  return modified;
}

/** Whether a fragment contains a node of an id-bearing type (recursively). */
function fragmentHasBlock(frag: Fragment, types: Set<string>): boolean {
  let found = false;
  frag.forEach((node) => {
    if (found) return;
    if (types.has(node.type.name)) found = true;
    else if (node.content.size) found = fragmentHasBlock(node.content, types);
  });
  return found;
}

/**
 * Whether a step could introduce a missing or duplicate block id — i.e. it
 * inserts block-level content (ReplaceStep/ReplaceAroundStep carry a `slice`;
 * paste/drop/split/undo bake the original ids in) or directly sets a
 * `dataBlockId` attribute. Plain text/mark edits do neither, so they skip the
 * O(n) dedup walk.
 */
function stepMayAffectIds(step: unknown, types: Set<string>): boolean {
  const s = step as { slice?: { content: Fragment }; attr?: string };
  if (s.attr === "dataBlockId") return true;
  return !!s.slice && fragmentHasBlock(s.slice.content, types);
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
  name: "hiermarkBlockId",

  addOptions() {
    return {
      types: [...DEFAULT_HIERMARK_BLOCK_TYPES],
      generate: generateBlockId,
    };
  },

  onCreate() {
    const types = new Set(this.options.types);
    const tr = this.editor.state.tr;
    if (assignBlockIds(this.editor.state.doc, tr, types, this.options.generate)) {
      tr.setMeta("addToHistory", false);
      // Mark the initial stamp so the host's onChange isn't fired for mount
      // mechanics (it still refreshes snapshots — ids matter to consumers).
      tr.setMeta("hiermarkInitialBlockIdStamp", true);
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
        key: new PluginKey("hiermarkBlockId"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          // The full-doc dedup walk is only needed when a transaction inserted
          // block-level content — a split, paste, drop, or undo can create a
          // missing or duplicate id. Plain text edits never do, so we skip the
          // O(n) walk on the typing hot path (the common case).
          if (!transactions.some((t) => t.steps.some((s) => stepMayAffectIds(s, types)))) {
            return null;
          }
          const tr = newState.tr;
          // Map an old-doc position through every transaction in this batch so
          // duplicate resolution can find where the pre-edit holder ended up.
          const mapPos = (pos: number) => {
            let p = pos;
            for (const t of transactions) p = t.mapping.map(p);
            return p;
          };
          const modified = assignBlockIds(newState.doc, tr, types, generate, {
            doc: _oldState.doc,
            mapPos,
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
