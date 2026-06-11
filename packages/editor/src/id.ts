import { nanoid } from "nanoid";

import type { HiermarkBlockId } from "./types";

/**
 * Generate a fresh, globally-unique-enough block id.
 *
 * Format: `blk_<nanoid>`. Ids are generated client-side, are immutable, and are
 * never remapped after the host persists them (spec §5.9) — remapping would
 * orphan branch edges that anchor to the block.
 */
export function generateBlockId(): HiermarkBlockId {
  return `blk_${nanoid()}`;
}

/** True if `id` looks like a Hiermark block id (`blk_…`). */
export function isBlockId(id: string): boolean {
  return /^blk_[A-Za-z0-9_-]+$/.test(id);
}
