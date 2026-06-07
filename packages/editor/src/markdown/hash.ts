/**
 * FNV-1a 64-bit content hash, rendered as 16-char lowercase hex.
 *
 * Dependency-free and deterministic across Node versions and processes, so a
 * test-computed hash equals a production one. Used as the content-addressed
 * dedup key for blocks and tasks.
 */
export function fnv1a64Hex(text: string): string {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * FNV_PRIME) & MASK;
  }
  return h.toString(16).padStart(16, "0");
}

/** Collapse whitespace runs to single spaces and trim — the hash normalizer. */
export function normalizeForHash(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}
