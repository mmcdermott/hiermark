import { inferBlockContainment } from "../markdown/containment";
import type { HamBlockId, HamBlockSnapshot, HamSurfaceId, HamSurfaceSnapshot } from "../types";

/**
 * One structural block node, as observed in document order. This is the pure
 * input to {@link projectBlockTree} — `getHamSurfaceSnapshot` derives these from
 * the live ProseMirror tree, but tests build them by hand.
 */
export interface BlockNodeMeta {
  id: HamBlockId;
  type: string;
  /** Heading level 1–6, or null for non-heading blocks. */
  headingLevel: number | null;
  text: string;
  isEmpty: boolean;
  /**
   * Id of the nearest enclosing HAM-block ancestor via *literal* PM nesting
   * (e.g. a nested list item's parent item), or null for a top-level block that
   * is contained only by the doc / a non-block wrapper such as a top-level list.
   * Top-level blocks (null) are subject to projected heading containment; nested
   * blocks attach literally to their ancestor.
   */
  literalParentId: HamBlockId | null;
  attrs?: Record<string, unknown>;
}

export interface ProjectBlockTreeOptions {
  surfaceId: HamSurfaceId;
  rootBlockId: HamBlockId;
  rootTitle?: string;
  rootType?: string;
  revision?: string | number;
}

/**
 * Assemble a tree-shaped {@link HamSurfaceSnapshot} from flat block metas.
 *
 * Parent resolution (spec §5.11):
 *  - a block with a `literalParentId` attaches to that ancestor (list nesting);
 *  - a top-level block attaches via heading containment — blocks after a heading
 *    belong under it until an equal-or-higher heading; blocks before the first
 *    heading attach to the synthetic root.
 *
 * The result is deterministic: `childIds` follow document order, `order` is the
 * index among siblings, `depth` counts from the root (0), and `blockOrder` is a
 * preorder traversal beginning at the root.
 */
export function projectBlockTree(
  metas: BlockNodeMeta[],
  opts: ProjectBlockTreeOptions,
): HamSurfaceSnapshot {
  const { surfaceId, rootBlockId, rootTitle, rootType = "root", revision } = opts;

  const blocks: Record<HamBlockId, HamBlockSnapshot> = {};
  const known = new Set<HamBlockId>([rootBlockId, ...metas.map((m) => m.id)]);

  blocks[rootBlockId] = {
    id: rootBlockId,
    type: rootType,
    parentId: null,
    childIds: [],
    order: 0,
    depth: 0,
    textPreview: rootTitle ?? "",
    isEmpty: metas.length === 0,
  };

  // 1. Heading containment over top-level blocks only.
  const topLevel = metas.map((m, i) => ({ m, i })).filter((e) => e.m.literalParentId == null);
  const headingParents = inferBlockContainment(
    topLevel.map((e) => ({ headingDepth: e.m.headingLevel })),
  );
  const parentByMetaIndex = new Map<number, HamBlockId>();
  topLevel.forEach((e, k) => {
    const parentLocal = headingParents[k];
    const parentId =
      parentLocal != null && topLevel[parentLocal] ? topLevel[parentLocal]!.m.id : rootBlockId;
    parentByMetaIndex.set(e.i, parentId);
  });

  // 2. Create a snapshot entry per meta, resolving its parent.
  metas.forEach((m, i) => {
    let parentId: HamBlockId;
    if (m.literalParentId != null && known.has(m.literalParentId)) {
      parentId = m.literalParentId;
    } else {
      parentId = parentByMetaIndex.get(i) ?? rootBlockId;
    }
    blocks[m.id] = {
      id: m.id,
      type: m.type,
      parentId,
      childIds: [],
      order: 0,
      depth: 0,
      textPreview: previewOf(m.text),
      isEmpty: m.isEmpty,
      ...(m.attrs ? { attrs: m.attrs } : {}),
    };
  });

  // 3. Wire childIds in document order (parents always precede their children).
  for (const m of metas) {
    const block = blocks[m.id]!;
    const parent = blocks[block.parentId!];
    if (parent) parent.childIds.push(m.id);
  }

  // 4. order = index among siblings.
  for (const id of known) {
    const block = blocks[id]!;
    block.childIds.forEach((childId, idx) => {
      blocks[childId]!.order = idx;
    });
  }

  // 5. depth + preorder blockOrder via DFS from the root.
  const blockOrder: HamBlockId[] = [];
  const visited = new Set<HamBlockId>();
  const visit = (id: HamBlockId, depth: number) => {
    if (visited.has(id)) return; // defensive: never loop on a malformed cycle
    visited.add(id);
    const block = blocks[id]!;
    block.depth = depth;
    blockOrder.push(id);
    for (const childId of block.childIds) visit(childId, depth + 1);
  };
  visit(rootBlockId, 0);

  // Reattach any orphans (e.g. a cyclic literalParentId) under the root so every
  // block stays addressable and present in blockOrder.
  for (const id of known) {
    if (visited.has(id)) continue;
    const root = blocks[rootBlockId]!;
    blocks[id]!.parentId = rootBlockId;
    root.childIds.push(id);
    blocks[id]!.order = root.childIds.length - 1;
    visit(id, 1);
  }

  return {
    surfaceId,
    rootBlockId,
    blocks,
    blockOrder,
    ...(revision !== undefined ? { revision } : {}),
  };
}

/** A short, single-line text preview for a block. */
export function previewOf(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
