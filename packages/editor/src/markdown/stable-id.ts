/**
 * Inline-identity grammar: carry block/task identity as unobtrusive HTML
 * comments in the markdown itself, so linkage survives hand-edits and plain-git
 * round-trips (spec §15.3, "On the horizon: git-sync round-trip").
 *
 * In the *live* editor, the canonical block id lives in the ProseMirror node
 * attrs (`dataBlockId`). These comments are only the *serialized carrier* for
 * the markdown import/export and server-reconciliation path.
 */

export type StableIdKind = "block" | "task";

const HAM_COMMENT = /<!--\s*ham:(block|task)=([A-Za-z0-9_-]+)\s*-->/g;
const STANDALONE_HAM_LINE = /^\s*<!--\s*ham:(block|task)=([A-Za-z0-9_-]+)\s*-->\s*$/;

/**
 * Remove every `ham:` id comment. Standalone comment lines are dropped entirely;
 * trailing inline comments are stripped along with the whitespace before them.
 */
export function stripStableIds(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !STANDALONE_HAM_LINE.test(line))
    .map((line) => line.replace(HAM_COMMENT, "").replace(/[ \t]+$/, ""))
    .join("\n");
}

/** Read the first `ham:<kind>` id present in `text`, or null. */
export function readStableId(text: string, kind: StableIdKind): string | null {
  HAM_COMMENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HAM_COMMENT.exec(text)) !== null) {
    if (m[1] === kind) return m[2] ?? null;
  }
  return null;
}

/** Append an inline `ham:<kind>=<id>` comment to a line (trimming trailing ws). */
export function injectInlineId(line: string, kind: StableIdKind, id: string): string {
  return `${line.replace(/[ \t]+$/, "")} <!-- ham:${kind}=${id} -->`;
}

/** A standalone block-id comment line. */
export function blockIdLine(id: string): string {
  return `<!-- ham:block=${id} -->`;
}
