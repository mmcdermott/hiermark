import type { Node as PMNode } from "@tiptap/pm/model";

import type {
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
  // Root is structural; empties never branch (unchanged invariants).
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
