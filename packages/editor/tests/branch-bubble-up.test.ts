import { describe, it, expect } from "vitest";
import {
  computeBranchPointSet,
  resolveBranchMode,
  branchModeFromSet,
} from "../src/snapshot/blockTreePolicy";
import type { HiermarkBlockSnapshot, HiermarkSurfaceSnapshot } from "../src/types";

/**
 * Build a snapshot from a nested spec: `[id, type, children?]`. `childIds`,
 * `parentId`, `depth`, and `blockOrder` are derived. Everything is non-empty.
 */
type Spec = [string, string, Spec[]?];
function snap(rootType: string, children: Spec[]): HiermarkSurfaceSnapshot {
  const blocks: Record<string, HiermarkBlockSnapshot> = {};
  const order: string[] = [];
  const add = (id: string, type: string, parentId: string | null, depth: number, kids: Spec[]) => {
    order.push(id);
    blocks[id] = {
      id,
      type,
      parentId,
      childIds: kids.map((k) => k[0]),
      order: 0,
      depth,
      textPreview: id,
      isEmpty: false,
    };
    kids.forEach((k) => add(k[0], k[1], id, depth + 1, k[2] ?? []));
  };
  add("root", rootType, null, 0, children);
  return { surfaceId: "s", rootBlockId: "root", blockOrder: order, blocks };
}

const points = (s: HiermarkSurfaceSnapshot) => [...computeBranchPointSet(s, "bubble-up")].sort();

describe("bubble-up branch policy (default)", () => {
  it("collapses a single linear chain onto the whole document (root)", () => {
    // doc → header → header → paragraph
    const s = snap("root", [["h1", "heading", [["h2", "heading", [["p", "paragraph"]]]]]]);
    expect(points(s)).toEqual(["root"]);
  });

  it("a fork at the top shows the document and each forked section", () => {
    // doc → [header → (header → para), header2 → para2]  (two top-level sections)
    const s = snap("root", [
      ["h1", "heading", [["h2", "heading", [["p", "paragraph"]]]]],
      ["h1b", "heading", [["p2", "paragraph"]]],
    ]);
    // The inner h2 is absorbed into h1; root forks into h1 + h1b.
    expect(points(s)).toEqual(["h1", "h1b", "root"]);
  });

  it("a header with a single paragraph branches at the header, not the paragraph", () => {
    // Two sections so the doc forks; each header has one paragraph.
    const s = snap("root", [
      ["h1", "heading", [["p1", "paragraph"]]],
      ["h2", "heading", [["p2", "paragraph"]]],
    ]);
    expect(points(s)).toEqual(["h1", "h2", "root"]);
  });

  it("a header with multiple blocks shows the header AND each block", () => {
    // doc → header → [p1, p2]
    const s = snap("root", [
      [
        "h1",
        "heading",
        [
          ["p1", "paragraph"],
          ["p2", "paragraph"],
        ],
      ],
    ]);
    expect(points(s)).toEqual(["h1", "p1", "p2", "root"]);
  });

  it("resolveBranchMode and branchModeFromSet agree, and add-sibling still applies", () => {
    const s = snap("root", [["h1", "heading", [["p", "paragraph"]]]]);
    // Single section → bubbles to root.
    expect(resolveBranchMode(s.blocks.root!, s, "bubble-up")).toBe("branch");
    expect(resolveBranchMode(s.blocks.h1!, s, "bubble-up")).toBe("none");
    // Already-branched root → add-sibling.
    expect(resolveBranchMode(s.blocks.root!, s, "bubble-up", { existingChildCount: 1 })).toBe(
      "add-sibling",
    );
    const set = computeBranchPointSet(s, "bubble-up");
    expect(branchModeFromSet(s.blocks.root!, set)).toBe("branch");
    expect(branchModeFromSet(s.blocks.h1!, set)).toBe("none");
  });
});

describe('"off" branch policy disables all affordances', () => {
  it("returns an empty branch-point set and never branches", () => {
    const s = snap("root", [["h1", "heading", [["p", "paragraph"]]]]);
    expect(computeBranchPointSet(s, "off").size).toBe(0);
    expect(resolveBranchMode(s.blocks.h1!, s, "off")).toBe("none");
    // Even an already-branched block stays "none" under "off".
    expect(resolveBranchMode(s.blocks.h1!, s, "off", { existingChildCount: 2 })).toBe("none");
  });
});
