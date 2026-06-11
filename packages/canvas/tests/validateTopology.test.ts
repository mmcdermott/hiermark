import { describe, it, expect } from "vitest";
import { validateHiermarkTopology } from "../src/topology/validateHiermarkTopology";
import type { HiermarkBranchEdge, HiermarkSurface } from "../src/types";

const s = (id: string): HiermarkSurface => ({
  id,
  rootBlockId: `${id}_root`,
  content: { kind: "markdown", markdown: `# ${id}` },
});
const e = (id: string, from: string, to: string, order = 0): HiermarkBranchEdge => ({
  id,
  fromSurfaceId: from,
  fromBlockId: "blk",
  toSurfaceId: to,
  order,
});

describe("validateHiermarkTopology", () => {
  it("reports nothing for a clean tree", () => {
    const issues = validateHiermarkTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), a: s("a"), b: s("b") },
      branchEdges: [e("e_a", "r", "a"), e("e_b", "a", "b")],
    });
    expect(issues).toEqual([]);
  });

  it("flags a missing root", () => {
    const issues = validateHiermarkTopology({ rootSurfaceId: "r", surfaces: {}, branchEdges: [] });
    expect(issues.map((i) => i.kind)).toContain("missing-root");
  });

  it("flags edges to/from unknown surfaces", () => {
    const issues = validateHiermarkTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r") },
      branchEdges: [e("e_x", "r", "ghost")],
    });
    const missing = issues.filter((i) => i.kind === "missing-surface");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.surfaceId).toBe("ghost");
    expect(missing[0]!.edgeIds).toEqual(["e_x"]);
  });

  it("flags a surface with duplicate incoming edges", () => {
    const issues = validateHiermarkTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), a: s("a"), b: s("b") },
      branchEdges: [e("e1", "r", "b"), e("e2", "a", "b"), e("e_a", "r", "a")],
    });
    const dup = issues.find((i) => i.kind === "duplicate-incoming");
    expect(dup?.surfaceId).toBe("b");
    expect(dup?.edgeIds?.sort()).toEqual(["e1", "e2"]);
  });

  it("detects a cycle", () => {
    const issues = validateHiermarkTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), a: s("a"), b: s("b") },
      branchEdges: [e("e_a", "r", "a"), e("ab", "a", "b"), e("ba", "b", "a")],
    });
    expect(issues.some((i) => i.kind === "cycle")).toBe(true);
  });

  it("flags a surface unreachable from the root", () => {
    const issues = validateHiermarkTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), island: s("island") },
      branchEdges: [],
    });
    const unreachable = issues.filter((i) => i.kind === "unreachable");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]!.surfaceId).toBe("island");
  });
});
