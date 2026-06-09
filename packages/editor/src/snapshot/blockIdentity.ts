import type { Node as PMNode } from "@tiptap/pm/model";

import { isHamBlockNode } from "./blockTreePolicy";

/** A block's stable id paired with the content that identifies it. */
export interface BlockIdentity {
  id: string;
  type: string;
  text: string;
}

/** Where to restore a block id in a re-parsed doc. */
export interface BlockIdRestore {
  pos: number;
  id: string;
}

/** Collect every id-bearing HAM block's (id, type, text), in document order. */
export function collectBlockIdentities(doc: PMNode): BlockIdentity[] {
  const out: BlockIdentity[] = [];
  doc.descendants((node, _pos, parent) => {
    if (!isHamBlockNode(node, parent)) return;
    const id = node.attrs.dataBlockId as string | null;
    if (id) out.push({ id, type: node.type.name, text: node.textContent });
  });
  return out;
}

/**
 * Align the old block identities onto a freshly re-parsed doc so blocks keep
 * their ids across a markdown round-trip (source-mode editing re-parses the
 * markdown, which otherwise re-stamps every id and orphans branch edges /
 * annotations keyed on the old ids).
 *
 * Two greedy passes, in document order:
 *  1. **exact** — same `type` AND same `text` (unchanged or reordered blocks);
 *  2. **positional-by-type** — same `type` only, for the leftovers (a block
 *     whose text was *edited in place* keeps its id, so a branch anchored on a
 *     heading survives an edit to that heading's wording).
 *
 * Genuinely new blocks keep their fresh ids; deleted blocks' ids drop. Returns
 * the positions in `newDoc` to set back to old ids.
 */
export function planBlockIdRestore(
  oldIdentities: BlockIdentity[],
  newDoc: PMNode,
): BlockIdRestore[] {
  const newBlocks: { pos: number; type: string; text: string }[] = [];
  newDoc.descendants((node, pos, parent) => {
    if (!isHamBlockNode(node, parent)) return;
    if (node.attrs.dataBlockId) {
      newBlocks.push({ pos, type: node.type.name, text: node.textContent });
    }
  });

  const usedOld = new Set<number>();
  const assigned = new Array<string | undefined>(newBlocks.length);

  const matchPass = (
    predicate: (old: BlockIdentity, nb: (typeof newBlocks)[number]) => boolean,
  ) => {
    newBlocks.forEach((nb, ni) => {
      if (assigned[ni]) return;
      for (let oi = 0; oi < oldIdentities.length; oi++) {
        if (usedOld.has(oi)) continue;
        const ob = oldIdentities[oi]!;
        if (predicate(ob, nb)) {
          usedOld.add(oi);
          assigned[ni] = ob.id;
          break;
        }
      }
    });
  };

  matchPass((ob, nb) => ob.type === nb.type && ob.text === nb.text); // exact
  matchPass((ob, nb) => ob.type === nb.type); // positional by type

  const plan: BlockIdRestore[] = [];
  newBlocks.forEach((nb, ni) => {
    const id = assigned[ni];
    if (id) plan.push({ pos: nb.pos, id });
  });
  return plan;
}
