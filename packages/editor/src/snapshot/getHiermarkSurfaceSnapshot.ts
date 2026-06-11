import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { generateBlockId } from "../id";
import type { HiermarkBlockId, HiermarkSurfaceId, HiermarkSurfaceSnapshot } from "../types";
import {
  DEFAULT_HIERMARK_BLOCK_TYPES,
  LEAF_CONTAINER_TYPES,
  LIST_CONTAINER_TYPES,
  TEXT_AND_RECURSE_TYPES,
} from "./blockTreePolicy";
import { projectBlockTree, type BlockNodeMeta } from "./projectBlockTree";

export interface SurfaceSnapshotOptions {
  surfaceId: HiermarkSurfaceId;
  rootBlockId?: HiermarkBlockId;
  title?: string;
  revision?: string | number;
  blockTypes?: ReadonlySet<string>;
}

/** Text of an item block from its direct (non-nested-list) children only. */
function directItemText(node: PMNode): string {
  let text = "";
  node.forEach((child) => {
    if (!LIST_CONTAINER_TYPES.has(child.type.name)) text += child.textContent;
  });
  return text;
}

/**
 * Build a tree-shaped {@link HiermarkSurfaceSnapshot} directly from the ProseMirror
 * document (spec §5.10) — never by serializing to markdown. List/task items
 * keep their literal nesting; top-level flow blocks are organized by projected
 * heading containment.
 *
 * Pure and synchronous over `doc`. Callers that branch or save must capture the
 * snapshot *before* awaiting (spec §5.7), since the editor may be destroyed by
 * the time an async run executes.
 *
 * A block node without a `dataBlockId` attr gets a freshly generated id in the
 * snapshot, but this does **not** write the id back into the document — it's a
 * pure fallback. Use the live `BlockId` extension (inside `HiermarkEditor`) for ids
 * that persist on the doc.
 */
export function surfaceSnapshotFromDoc(
  doc: PMNode,
  opts: SurfaceSnapshotOptions,
): HiermarkSurfaceSnapshot {
  const blockTypes = opts.blockTypes ?? DEFAULT_HIERMARK_BLOCK_TYPES;
  const rootBlockId = opts.rootBlockId ?? "blk_root";
  const metas: BlockNodeMeta[] = [];

  const idOf = (node: PMNode): HiermarkBlockId =>
    (node.attrs?.dataBlockId as string | null) ?? generateBlockId();

  const walk = (node: PMNode, itemAncestorId: HiermarkBlockId | null) => {
    node.forEach((child) => {
      const type = child.type.name;
      if (TEXT_AND_RECURSE_TYPES.has(type)) {
        // listItem / taskItem / blockquote: their direct paragraphs are this
        // block's text; recurse to surface nested lists as child blocks.
        const id = idOf(child);
        const text = directItemText(child);
        metas.push({
          id,
          type,
          headingLevel: null,
          text,
          isEmpty: text.trim() === "",
          literalParentId: itemAncestorId,
          ...attrsOf(child),
        });
        walk(child, id);
      } else if (LIST_CONTAINER_TYPES.has(type)) {
        walk(child, itemAncestorId); // not a block; keep the ancestor
      } else if (type === "heading") {
        metas.push({
          id: idOf(child),
          type,
          headingLevel: (child.attrs?.level as number | undefined) ?? 1,
          text: child.textContent,
          isEmpty: child.textContent.trim() === "",
          literalParentId: itemAncestorId,
          ...attrsOf(child),
        });
      } else if (LEAF_CONTAINER_TYPES.has(type)) {
        metas.push({
          id: idOf(child),
          type,
          headingLevel: null,
          text: child.textContent,
          isEmpty: child.textContent.trim() === "",
          literalParentId: itemAncestorId,
          ...attrsOf(child),
        });
      } else if (type === "paragraph") {
        // A paragraph is a block only at the top level; a paragraph nested in an
        // item/blockquote is that block's text, already accounted for.
        if (itemAncestorId == null && blockTypes.has("paragraph")) {
          metas.push({
            id: idOf(child),
            type,
            headingLevel: null,
            text: child.textContent,
            isEmpty: child.content.size === 0,
            literalParentId: null,
            ...attrsOf(child),
          });
        }
      } else if (child.childCount > 0) {
        walk(child, itemAncestorId);
      }
    });
  };

  walk(doc, null);

  return projectBlockTree(metas, {
    surfaceId: opts.surfaceId,
    rootBlockId,
    ...(opts.title !== undefined ? { rootTitle: opts.title } : {}),
    ...(opts.revision !== undefined ? { revision: opts.revision } : {}),
  });
}

function attrsOf(node: PMNode): { attrs?: Record<string, unknown> } {
  const attrs = node.attrs as Record<string, unknown> | undefined;
  if (!attrs) return {};
  // Drop the internal block id; everything else is host-meaningful (level, checked…).
  const { dataBlockId: _omit, ...rest } = attrs;
  return Object.keys(rest).length ? { attrs: rest } : {};
}

/** Build a surface snapshot from a live Tiptap editor (spec export). */
export function getHiermarkSurfaceSnapshot(
  editor: Editor,
  opts: SurfaceSnapshotOptions,
): HiermarkSurfaceSnapshot {
  return surfaceSnapshotFromDoc(editor.state.doc, opts);
}
