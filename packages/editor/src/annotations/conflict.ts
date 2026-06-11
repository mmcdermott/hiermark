import type { HiermarkAnnotationHit, HiermarkAnnotationPlacement } from "../types";

export interface HitMeta {
  priority: number;
  placement: HiermarkAnnotationPlacement;
  opaqueBlock?: boolean;
}

function rangeLen(h: HiermarkAnnotationHit): number {
  return h.from != null && h.to != null ? h.to - h.from : 0;
}

/**
 * Resolve overlapping annotation hits deterministically (spec §5.13):
 *  1. sort by priority desc, then range length desc, then type name, then id;
 *  2. `inline` hits sweep left-to-right, keeping a hit only if its `[from,to)`
 *     doesn't overlap an already-accepted inline hit in the same block;
 *  3. other placements coexist, except an `opaqueBlock` annotation suppresses
 *     all *other* block-level hits on the same block.
 *
 * Pure and order-stable for the same input.
 */
export function resolveHits(
  hits: HiermarkAnnotationHit[],
  metaOf: (type: string) => HitMeta,
): HiermarkAnnotationHit[] {
  const sorted = [...hits].sort((a, b) => {
    const ma = metaOf(a.type);
    const mb = metaOf(b.type);
    return (
      mb.priority - ma.priority ||
      rangeLen(b) - rangeLen(a) ||
      a.type.localeCompare(b.type) ||
      a.id.localeCompare(b.id)
    );
  });

  // Blocks where some block-level hit is opaque suppress other block-level hits.
  const opaqueBlocks = new Set<string>();
  for (const h of hits) {
    const m = metaOf(h.type);
    if (m.placement !== "inline" && m.opaqueBlock) opaqueBlocks.add(h.blockId);
  }

  const acceptedInline = new Map<string, Array<[number, number]>>();
  const accepted: HiermarkAnnotationHit[] = [];

  for (const h of sorted) {
    const m = metaOf(h.type);
    if (m.placement === "inline" && h.from != null && h.to != null) {
      const intervals = acceptedInline.get(h.blockId) ?? [];
      const overlaps = intervals.some(([f, t]) => h.from! < t && f < h.to!);
      if (overlaps) continue;
      intervals.push([h.from, h.to]);
      acceptedInline.set(h.blockId, intervals);
      accepted.push(h);
    } else {
      if (opaqueBlocks.has(h.blockId) && !m.opaqueBlock) continue;
      accepted.push(h);
    }
  }

  // Stable, document-ish output order.
  return accepted.sort(
    (a, b) =>
      a.blockId.localeCompare(b.blockId) ||
      (a.from ?? -1) - (b.from ?? -1) ||
      metaOf(b.type).priority - metaOf(a.type).priority ||
      a.id.localeCompare(b.id),
  );
}
