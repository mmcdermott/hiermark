import { normalize } from "../markdown/checklist";
import { fnv1a64Hex } from "../markdown/hash";
import type { HiermarkBlockId } from "../types";

/**
 * Define annotation identity once, block-anchored, so the live editor and the
 * markdown-derived path agree (and so a chip keeps its identity as unrelated
 * text changes). The optional `from` distinguishes multiple same-data hits in
 * one block (e.g. two occurrences of the same citation).
 */
export function annotationId(
  type: string,
  blockId: HiermarkBlockId,
  data: unknown,
  from?: number,
): string {
  const repr = typeof data === "string" ? data : JSON.stringify(data ?? "");
  const slot = from == null ? "b" : String(from);
  return `${type}:${blockId}:${slot}:${fnv1a64Hex(normalize(repr))}`;
}

export { normalize, fnv1a64Hex };
