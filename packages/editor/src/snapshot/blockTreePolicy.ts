import type { Node as PMNode } from "@tiptap/pm/model";

import type {
  HamBlockId,
  HamBlockSnapshot,
  HamBranchabilityRules,
  HamBranchMode,
  HamBranchPolicy,
  HamSurfaceSnapshot,
} from "../types";

/**
 * ProseMirror node types that are HAM blocks — addressable, collapsible, and
 * (subject to policy) branchable. List/task *items* are blocks; their wrapping
 * list containers are not. A `paragraph` is a block only at the top level; a
 * paragraph nested inside a listItem/taskItem/blockquote is that block's text,
 * not a separate block (see `getHamSurfaceSnapshot`).
 */
export const DEFAULT_HAM_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
  "table",
]);

/** List/task container types whose children are blocks but which are not themselves blocks. */
export const LIST_CONTAINER_TYPES: ReadonlySet<string> = new Set([
  "bulletList",
  "orderedList",
  "taskList",
]);

/**
 * Block types treated as opaque leaves: their inner content is the block's text
 * and is not decomposed into separate blocks. `blockquote` is deliberately NOT
 * here — it recurses so nested lists inside a quote keep their items.
 */
export const LEAF_CONTAINER_TYPES: ReadonlySet<string> = new Set(["codeBlock", "table"]);

/**
 * Block types whose direct paragraph child is the block's text rather than a
 * separate block, and which recurse to surface nested lists as child blocks.
 */
export const ITEM_TYPES: ReadonlySet<string> = new Set(["listItem", "taskItem"]);

/** Block types that hold their own text in direct paragraphs but recurse for nested lists. */
export const TEXT_AND_RECURSE_TYPES: ReadonlySet<string> = new Set([
  "listItem",
  "taskItem",
  "blockquote",
]);

/**
 * Whether a ProseMirror node should be treated as a HAM block, given its parent.
 * Mirrors `getHamSurfaceSnapshot`: a `paragraph` counts only at the top level; a
 * paragraph nested in an item/blockquote is that block's text, not a block.
 */
export function isHamBlockNode(node: PMNode, parent: PMNode | null): boolean {
  const type = node.type.name;
  if (!DEFAULT_HAM_BLOCK_TYPES.has(type)) return false;
  if (type === "paragraph") {
    return parent == null || parent.type.name === "doc";
  }
  return true;
}

/** Whether a block node is empty (no rendered text content). */
export function isEmptyBlockNode(node: PMNode): boolean {
  return node.type.name === "paragraph" ? node.content.size === 0 : node.textContent.trim() === "";
}

/**
 * The `"smart"` default: branch leaves and real forks, suppress redundant
 * single-child intermediates (hoisting the affordance to the top of a chain),
 * and always allow headings (named decomposition anchors).
 */
export const SMART_RULES: HamBranchabilityRules = {
  kind: "rules",
  leaves: true,
  multiChildContainers: true,
  singleChildContainers: false,
  passThrough: "hoist-up",
  alwaysHeadings: true,
};

/** Context for {@link resolveBranchMode} — facts only the canvas knows. */
export interface BranchabilityContext {
  /** How many branch edges are already anchored at this block. */
  existingChildCount: number;
}

/**
 * Resolve how a block may be branched: `"branch"` (create the first child
 * surface), `"add-sibling"` (the block already has a child — add another
 * alongside), or `"none"`. Pure over the projected snapshot, so the same call
 * drives the editor gutter and is unit-testable against hand-built snapshots.
 *
 * @example A leaf paragraph branches; the root and empties do not.
 * ```ts
 * const snap = {
 *   surfaceId: "s", rootBlockId: "r", blockOrder: ["r", "p"],
 *   blocks: {
 *     r: { id: "r", type: "root", parentId: null, childIds: ["p"], order: 0, depth: 0, textPreview: "", isEmpty: false },
 *     p: { id: "p", type: "paragraph", parentId: "r", childIds: [], order: 0, depth: 1, textPreview: "hi", isEmpty: false },
 *   },
 * };
 * resolveBranchMode(snap.blocks.p, snap); // => "branch"
 * resolveBranchMode(snap.blocks.r, snap); // => "none"  (root is structural)
 * resolveBranchMode(snap.blocks.p, snap, "smart", { existingChildCount: 1 }); // => "add-sibling"
 * ```
 */
export function resolveBranchMode(
  block: HamBlockSnapshot,
  snapshot: HamSurfaceSnapshot,
  policy: HamBranchPolicy = "smart",
  ctx: BranchabilityContext = { existingChildCount: 0 },
): HamBranchMode {
  if (policy === "off") return "none"; // no branch affordances at all

  // The bubble-up policy is a *whole-subtree* decision (and the root participates
  // — it can carry the whole document), so resolve via the precomputed set.
  if (policy === "bubble-up") {
    if (ctx.existingChildCount > 0) return "add-sibling";
    return computeBranchPointSet(snapshot, "bubble-up").has(block.id) ? "branch" : "none";
  }

  // Legacy per-block policies: root is structural and empties never branch —
  // checked BEFORE existingChildCount so they stay "none" regardless of children.
  if (block.id === snapshot.rootBlockId || block.isEmpty) return "none";

  // Already a cross-surface parent → the next click adds a sibling, not a 2nd "+".
  if (ctx.existingChildCount > 0) return "add-sibling";

  if (typeof policy === "function") return policy(block, snapshot) ? "branch" : "none";

  if (policy === "root-only") return "none"; // surfaces branch under root-only, not blocks
  if (policy === "headings-only") return block.type === "heading" ? "branch" : "none";
  if (policy === "any-nonempty-block") return "branch";

  const rules = policy === "smart" ? SMART_RULES : policy;
  return branchableByRules(block, snapshot, rules) ? "branch" : "none";
}

/**
 * The set of blocks that should show a branch affordance for a policy, computed
 * once over the whole snapshot. For `"bubble-up"` this runs the recursive
 * absorption; for every other policy it's just the blocks {@link resolveBranchMode}
 * would mark `"branch"`. Hosts/gutters resolve `add-sibling` separately (it
 * depends on the live branch-child count, not the tree shape).
 */
export function computeBranchPointSet(
  snapshot: HamSurfaceSnapshot,
  policy: HamBranchPolicy = "smart",
): Set<HamBlockId> {
  if (policy === "off") return new Set();
  if (policy === "bubble-up") return bubbleUpBranchPoints(snapshot);
  const set = new Set<HamBlockId>();
  for (const id of snapshot.blockOrder) {
    const b = snapshot.blocks[id];
    if (b && resolveBranchMode(b, snapshot, policy, { existingChildCount: 0 }) === "branch") {
      set.add(id);
    }
  }
  return set;
}

/**
 * Resolve a block's mode from a precomputed branch-point set (the gutter hot
 * path). `add-sibling` depends only on the live branch-child count, so it's
 * resolved here rather than baked into the set. Callers using `"off"` should
 * skip this entirely (no affordances at all).
 */
export function branchModeFromSet(
  block: HamBlockSnapshot,
  pointSet: Set<HamBlockId>,
  ctx: BranchabilityContext = { existingChildCount: 0 },
): HamBranchMode {
  if (ctx.existingChildCount > 0) return "add-sibling";
  return pointSet.has(block.id) ? "branch" : "none";
}

/**
 * Bubble-up branch points (spec'd by example): a block with a *single* nested
 * branch point absorbs it (so a linear header → header → paragraph chain shows
 * one affordance at the top, on the whole document); a fork with ≥2 nested
 * branch points shows the fork *and* each nested point. The document root
 * participates (it can carry the whole doc); other empty blocks cannot.
 */
function bubbleUpBranchPoints(snapshot: HamSurfaceSnapshot): Set<HamBlockId> {
  const memo = new Map<HamBlockId, Set<HamBlockId>>();
  const eligible = (b: HamBlockSnapshot) => b.id === snapshot.rootBlockId || !b.isEmpty;

  const visit = (id: HamBlockId): Set<HamBlockId> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const placeholder = new Set<HamBlockId>();
    memo.set(id, placeholder); // cycle guard (snapshots are trees, but be safe)
    const b = snapshot.blocks[id];
    if (!b) return placeholder;

    const childPoints = new Set<HamBlockId>();
    for (const cid of b.childIds) for (const p of visit(cid)) childPoints.add(p);

    let result: Set<HamBlockId>;
    if (childPoints.size === 0) {
      result = eligible(b) ? new Set([id]) : new Set();
    } else if (childPoints.size === 1) {
      // Single nested point bubbles up into this block (if it can carry it).
      result = eligible(b) ? new Set([id]) : childPoints;
    } else {
      // A real fork: this block and every distinct nested point.
      result = eligible(b) ? new Set<HamBlockId>([id, ...childPoints]) : childPoints;
    }
    memo.set(id, result);
    return result;
  };

  return visit(snapshot.rootBlockId);
}

/** Heart of the smart policy: branchability from arity / depth / type. */
function branchableByRules(
  block: HamBlockSnapshot,
  snapshot: HamSurfaceSnapshot,
  r: HamBranchabilityRules,
): boolean {
  if (r.maxDepth != null && block.depth > r.maxDepth) return false;

  // Headings are named decomposition anchors: branchable at any arity so a host
  // can split a section even when it currently holds a single paragraph.
  if (block.type === "heading" && (r.alwaysHeadings ?? true)) return true;

  const n = block.childIds.length;
  if (n === 0) return r.leaves ?? true; // leaf
  if (n >= 2) return r.multiChildContainers ?? true; // fork
  if (r.singleChildContainers) return true; // n === 1, explicitly allowed

  // n === 1 and suppressed. With "hoist-up" the topmost container in a
  // single-child chain stays branchable ("carry the whole section"); with
  // "delegate-down" only the chain's tail (the leaf) does.
  return (r.passThrough ?? "hoist-up") === "hoist-up"
    ? !hasSingleChildParent(block, snapshot)
    : false;
}

/** Whether the block's parent is itself a non-root single-child container. */
function hasSingleChildParent(block: HamBlockSnapshot, snapshot: HamSurfaceSnapshot): boolean {
  const parent = block.parentId ? snapshot.blocks[block.parentId] : undefined;
  return !!parent && parent.id !== snapshot.rootBlockId && parent.childIds.length === 1;
}

/**
 * Resolve whether a block may be branched from, given a branch policy (spec §5.12).
 * Thin wrapper over {@link resolveBranchMode} for callers that only need a boolean
 * (e.g. the create-time authoritative gate, which ignores existing children).
 */
export function isBranchable(
  block: HamBlockSnapshot,
  snapshot: HamSurfaceSnapshot,
  policy: HamBranchPolicy = "smart",
): boolean {
  return resolveBranchMode(block, snapshot, policy) !== "none";
}
