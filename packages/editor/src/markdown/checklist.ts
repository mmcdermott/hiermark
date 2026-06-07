import { fnv1a64Hex } from "./hash";
import { readStableId, injectInlineId } from "./stable-id";

/**
 * GFM task-list parsing, fenced-code-aware. A `- [ ]` line inside a code fence
 * is sample code, never a task, and never gets an id injected.
 */

export interface ChecklistItem {
  /** Normalized text: marker, checkbox, and id comment removed. */
  text: string;
  checked: boolean;
  /** Content-addressed key (hash of normalized text). */
  key: string;
  /** `ham:task` id if present, else null. */
  stableId: string | null;
  /** Index of the block this item belongs to. */
  blockPosition: number;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const TASK_LINE = /^(\s*[-*+]\s+\[([ xX])\]\s+)(.*\S)\s*$/;

/** Advance the fenced-code-block state machine by one line. */
function stepFence(line: string, fence: string | null): { fence: string | null; inFence: boolean } {
  const m = FENCE.exec(line);
  if (fence === null) {
    if (m) return { fence: m[1]![0]!, inFence: true }; // opener line is not content
    return { fence: null, inFence: false };
  }
  if (m && m[1]![0] === fence) return { fence: null, inFence: true }; // matching close
  return { fence, inFence: true };
}

/**
 * Normalize task text: undo markdown backslash-escapes (so the editor's
 * unescaped node text and stored escaped markdown produce the *same* key),
 * collapse whitespace, trim. Not lowercased — titles are user-visible.
 */
export function normalize(text: string): string {
  return text
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Content-addressed key for a task line's normalized text. */
export function taskKey(text: string): string {
  return fnv1a64Hex(normalize(text));
}

function stripTaskId(line: string): string {
  return line.replace(/<!--\s*ham:task=[A-Za-z0-9_-]+\s*-->/g, "");
}

/** Parse all task-list items in one block body, skipping fenced code. */
export function parseChecklist(bodyMarkdown: string, blockPosition: number): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  let fence: string | null = null;
  for (const line of bodyMarkdown.split("\n")) {
    const next = stepFence(line, fence);
    const wasInFence = fence !== null;
    fence = next.fence;
    // Skip fence opener/closer lines and any line inside a fence.
    if (next.inFence || wasInFence) continue;

    const m = TASK_LINE.exec(line);
    if (!m) continue;
    const checkChar = m[2]!;
    const text = normalize(stripTaskId(m[3]!));
    if (!text) continue;
    out.push({
      text,
      checked: checkChar === "x" || checkChar === "X",
      key: fnv1a64Hex(text),
      stableId: readStableId(line, "task"),
      blockPosition,
    });
  }
  return out;
}

/**
 * Inject `ham:task=<id>` comments into task lines that have a known id and don't
 * already carry one — never inside a fence.
 */
export function injectTaskIds(markdown: string, idByKey: Map<string, string>): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const next = stepFence(line, fence);
      const wasInFence = fence !== null;
      fence = next.fence;
      if (next.inFence || wasInFence) return line;

      const m = TASK_LINE.exec(line);
      if (!m) return line;
      if (readStableId(line, "task")) return line; // existing id is authoritative
      const key = fnv1a64Hex(normalize(stripTaskId(m[3]!)));
      const id = idByKey.get(key);
      return id ? injectInlineId(line, "task", id) : line;
    })
    .join("\n");
}
