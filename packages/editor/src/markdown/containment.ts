import { stripStableIds } from "./stable-id";

/**
 * Projected heading containment (spec §5.11.1, §15.2).
 *
 * Markdown headings are normally *siblings*, not containers. HAM projects an
 * outline tree on top of the flat block order: blocks after a heading belong
 * under that heading until a heading of equal-or-higher level appears. This is
 * the canonical implementation the snapshot builder grafts onto literal
 * (list/task) nesting.
 */

export interface ContainmentBlock {
  /** Heading level 1–6, or null for a body (non-heading) block. */
  headingDepth: number | null;
}

/** The ATX heading level of a block body, or null. Recognizes id-stamped and indented headings. */
export function headingDepthOf(bodyMarkdown: string): number | null {
  const clean = stripStableIds(bodyMarkdown).replace(/^\s+/, "");
  const m = /^(#{1,6})\s+\S/.exec(clean);
  return m ? m[1]!.length : null;
}

/**
 * Given flat blocks in document order, return the parent **index** of each
 * block (or null for a root-level block). Headings nest under strictly
 * shallower headings; body blocks belong to the deepest currently-open heading.
 */
export function inferBlockContainment(blocks: ContainmentBlock[]): (number | null)[] {
  const parents: (number | null)[] = new Array(blocks.length).fill(null);
  // Open headings, shallowest at the bottom, deepest on top.
  const stack: { index: number; depth: number }[] = [];
  blocks.forEach((b, i) => {
    if (b.headingDepth != null) {
      // Pop headings that can't contain this one (equal or deeper depth).
      while (stack.length && stack[stack.length - 1]!.depth >= b.headingDepth) {
        stack.pop();
      }
      parents[i] = stack.length ? stack[stack.length - 1]!.index : null;
      stack.push({ index: i, depth: b.headingDepth });
    } else {
      // Body block belongs to the deepest currently-open heading, if any.
      parents[i] = stack.length ? stack[stack.length - 1]!.index : null;
    }
  });
  return parents;
}

/** Convenience: infer containment directly from block markdown bodies. */
export function inferContainmentFromMarkdown(bodies: string[]): (number | null)[] {
  return inferBlockContainment(bodies.map((b) => ({ headingDepth: headingDepthOf(b) })));
}
