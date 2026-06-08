import { describe, it, expect } from "vitest";
import { validateHamTopology } from "../src/topology/validateHamTopology";
import type { HamBranchEdge, HamSurface } from "../src/types";

const s = (id: string): HamSurface => ({
  id,
  rootBlockId: `${id}_root`,
  content: { kind: "markdown", markdown: `# ${id}` },
});
const e = (id: string, from: string, to: string, order = 0): HamBranchEdge => ({
  id,
  fromSurfaceId: from,
  fromBlockId: "blk",
  toSurfaceId: to,
  order,
});

describe("validateHamTopology", () => {
  it("reports nothing for a clean tree", () => {
    const issues = validateHamTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), a: s("a"), b: s("b") },
      branchEdges: [e("e_a", "r", "a"), e("e_b", "a", "b")],
    });
    expect(issues).toEqual([]);
  });

  it("flags a missing root", () => {
    const issues = validateHamTopology({ rootSurfaceId: "r", surfaces: {}, branchEdges: [] });
    expect(issues.map((i) => i.kind)).toContain("missing-root");
  });

  it("flags edges to/from unknown surfaces", () => {
    const issues = validateHamTopology({
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
    const issues = validateHamTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), a: s("a"), b: s("b") },
      branchEdges: [e("e1", "r", "b"), e("e2", "a", "b"), e("e_a", "r", "a")],
    });
    const dup = issues.find((i) => i.kind === "duplicate-incoming");
    expect(dup?.surfaceId).toBe("b");
    expect(dup?.edgeIds?.sort()).toEqual(["e1", "e2"]);
  });

  it("detects a cycle", () => {
    const issues = validateHamTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), a: s("a"), b: s("b") },
      branchEdges: [e("e_a", "r", "a"), e("ab", "a", "b"), e("ba", "b", "a")],
    });
    expect(issues.some((i) => i.kind === "cycle")).toBe(true);
  });

  it("flags a surface unreachable from the root", () => {
    const issues = validateHamTopology({
      rootSurfaceId: "r",
      surfaces: { r: s("r"), island: s("island") },
      branchEdges: [],
    });
    const unreachable = issues.filter((i) => i.kind === "unreachable");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]!.surfaceId).toBe("island");
  });
});
