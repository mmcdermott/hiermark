import type {
  HiermarkAnnotationHit,
  HiermarkAnnotationRegistry,
  HiermarkBlockSnapshot,
  HiermarkSurfaceId,
} from "../types";
import { resolveHits, type HitMeta } from "./conflict";

export interface RecognizeInput<Ctx> {
  registry: HiermarkAnnotationRegistry<Ctx>;
  surfaceId: HiermarkSurfaceId;
  /** Blocks in document order. */
  blocks: HiermarkBlockSnapshot[];
  /** Full text per block (not the truncated preview). */
  textByBlockId: Record<string, string>;
  context: Ctx;
}

/**
 * Run every registered recognizer over every block, then apply the conflict
 * policy. Pure and free of ProseMirror — fully unit-testable with plain data.
 */
export function recognizeAnnotations<Ctx>(input: RecognizeInput<Ctx>): HiermarkAnnotationHit[] {
  const { registry, surfaceId, blocks, textByBlockId, context } = input;
  const hits: HiermarkAnnotationHit[] = [];

  for (const block of blocks) {
    const text = textByBlockId[block.id] ?? block.textPreview ?? "";
    for (const type of registry.types) {
      for (const hit of type.recognize({ surfaceId, block, text, context })) {
        hits.push({ ...hit, type: hit.type || type.name, blockId: hit.blockId || block.id });
      }
    }
  }

  const metaByType = new Map(
    registry.types.map((t) => [
      t.name,
      { priority: t.priority ?? 0, placement: t.placement, opaqueBlock: t.opaqueBlock } as HitMeta,
    ]),
  );
  const metaOf = (type: string): HitMeta =>
    metaByType.get(type) ?? { priority: 0, placement: "inline" };

  return resolveHits(hits, metaOf);
}
