import { describe, it, expect } from "vitest";
import { projectHamColumns } from "../src/topology/projectHamColumns";
import { getHamActivePath } from "../src/topology/getHamActivePath";
import { buildIndices, collectDescendants } from "../src/topology/buildIndices";
import {
  areSameAnchorSiblings,
  reorderSiblingEdgesByIndex,
  reorderSiblingEdgesByIds,
  siblingEdges,
} from "../src/topology/reorderBranchSiblings";
import { pickDisplayMode } from "../src/topology/pathState";
import { resolveLayout } from "../src/defaults";
import type { HamBranchEdge, HamSurface, HamSurfaceId } from "../src/types";
import type { HamSurfaceSnapshot } from "@ham/editor";

const surface = (id: string, rootBlockId = `${id}_root`): HamSurface => ({
  id,
  rootBlockId,
  content: { kind: "markdown", markdown: `# ${id}` },
});

function snapshot(surfaceId: string, blockOrder: string[]): HamSurfaceSnapshot {
  const blocks: HamSurfaceSnapshot["blocks"] = {};
  blockOrder.forEach((id, i) => {
    blocks[id] = {
      id,
      type: i === 0 ? "root" : "paragraph",
      parentId: i === 0 ? null : blockOrder[0]!,
      childIds: [],
      order: i,
      depth: i === 0 ? 0 : 1,
      textPreview: id,
      isEmpty: false,
    };
  });
  return { surfaceId, rootBlockId: blockOrder[0]!, blocks, blockOrder };
}

// §7.2 worked example: root has blocks A and B; branches off each, plus a second
// branch from A (a sibling).
const surfaces: Record<HamSurfaceId, HamSurface> = {
  s_root: surface("s_root", "blk_root"),
  s_a: surface("s_a"),
  s_a2: surface("s_a2"),
  s_b: surface("s_b"),
};
const edges: HamBranchEdge[] = [
  { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
  { id: "e_a2", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a2", order: 1 },
  { id: "e_b", fromSurfaceId: "s_root", fromBlockId: "blk_B", toSurfaceId: "s_b", order: 0 },
];
const snapshots = { s_root: snapshot("s_root", ["blk_root", "blk_A", "blk_B"]) };

describe("projectHamColumns", () => {
  it("places two branches from two different blocks in the next column", () => {
    const cols = projectHamColumns({
      rootSurfaceId: "s_root",
      surfaces,
      branchEdges: [edges[0]!, edges[2]!], // A → s_a, B → s_b
      snapshotsBySurfaceId: snapshots,
      activeSurfaceId: "s_root",
    });
    expect(cols).toHaveLength(2);
    expect(cols[0]!.items.map((i) => i.surface.id)).toEqual(["s_root"]);
    expect(cols[1]!.items.map((i) => i.surface.id)).toEqual(["s_a", "s_b"]);
  });

  it("orders same-block siblings by edge order, ahead of a later block's branch", () => {
    const cols = projectHamColumns({
      rootSurfaceId: "s_root",
      surfaces,
      branchEdges: edges, // A→s_a(0), A→s_a2(1), B→s_b(0)
      snapshotsBySurfaceId: snapshots,
      activeSurfaceId: "s_root",
    });
    // block A (rank 1) before block B (rank 2); within A, order 0 then 1.
    expect(cols[1]!.items.map((i) => i.surface.id)).toEqual(["s_a", "s_a2", "s_b"]);
  });

  it("respects edge.order after a reorder", () => {
    const reordered = edges.map((e) =>
      e.id === "e_a" ? { ...e, order: 1 } : e.id === "e_a2" ? { ...e, order: 0 } : e,
    );
    const cols = projectHamColumns({
      rootSurfaceId: "s_root",
      surfaces,
      branchEdges: reordered,
      snapshotsBySurfaceId: snapshots,
      activeSurfaceId: "s_root",
    });
    expect(cols[1]!.items.map((i) => i.surface.id)).toEqual(["s_a2", "s_a", "s_b"]);
  });

  it("marks active, ancestor, sibling, and unrelated path states", () => {
    const cols = projectHamColumns({
      rootSurfaceId: "s_root",
      surfaces,
      branchEdges: edges,
      snapshotsBySurfaceId: snapshots,
      activeSurfaceId: "s_a",
    });
    const item = (id: string) => cols.flatMap((c) => c.items).find((i) => i.surface.id === id)!;
    expect(item("s_a").pathState).toBe("active");
    expect(item("s_root").pathState).toBe("ancestor");
    expect(item("s_a2").pathState).toBe("sibling"); // same anchor block A
    expect(item("s_b").pathState).toBe("unrelated"); // different anchor block
    expect(item("s_a").displayMode).toBe("expanded");
  });

  it("marks descendants of the active surface", () => {
    const deepEdges: HamBranchEdge[] = [
      ...edges,
      { id: "e_deep", fromSurfaceId: "s_a", fromBlockId: "blk_x", toSurfaceId: "s_deep", order: 0 },
    ];
    const cols = projectHamColumns({
      rootSurfaceId: "s_root",
      surfaces: { ...surfaces, s_deep: surface("s_deep") },
      branchEdges: deepEdges,
      snapshotsBySurfaceId: snapshots,
      activeSurfaceId: "s_root",
    });
    const sDeep = cols.flatMap((c) => c.items).find((i) => i.surface.id === "s_deep")!;
    expect(sDeep.pathState).toBe("descendant");
  });

  it("tolerates a stale anchor (block missing from snapshot) by sorting it last", () => {
    const staleEdges: HamBranchEdge[] = [
      { id: "e_stale", fromSurfaceId: "s_root", fromBlockId: "gone", toSurfaceId: "s_a", order: 0 },
      { id: "e_b", fromSurfaceId: "s_root", fromBlockId: "blk_B", toSurfaceId: "s_b", order: 0 },
    ];
    const cols = projectHamColumns({
      rootSurfaceId: "s_root",
      surfaces,
      branchEdges: staleEdges,
      snapshotsBySurfaceId: snapshots,
      activeSurfaceId: "s_root",
    });
    expect(cols[1]!.items.map((i) => i.surface.id)).toEqual(["s_b", "s_a"]);
  });
});

describe("pickDisplayMode (collapse preserves active path)", () => {
  const layout = resolveLayout();
  it("keeps active-path surfaces visible even when collapsed", () => {
    expect(pickDisplayMode("active", true, layout)).toBe("expanded");
    expect(pickDisplayMode("ancestor", true, layout)).not.toBe("hidden");
  });
  it("compacts collapsed unrelated surfaces to a rail/hidden", () => {
    expect(["rail", "hidden"]).toContain(pickDisplayMode("unrelated", true, layout));
  });
});

describe("getHamActivePath", () => {
  it("walks root→active and records edges + anchors", () => {
    const path = getHamActivePath({
      rootSurfaceId: "s_root",
      activeSurfaceId: "s_a",
      branchEdges: edges,
    });
    expect(path.surfaceIds).toEqual(["s_root", "s_a"]);
    expect(path.edgeIds).toEqual(["e_a"]);
    expect(path.anchorBlockIds).toEqual(["blk_A"]);
  });

  it("clamps an orphan active surface to itself", () => {
    const path = getHamActivePath({
      rootSurfaceId: "s_root",
      activeSurfaceId: "orphan",
      branchEdges: edges,
    });
    expect(path.surfaceIds).toEqual(["orphan"]);
  });

  it("does not loop on cyclic edge data", () => {
    const cyclic: HamBranchEdge[] = [
      { id: "e1", fromSurfaceId: "x", fromBlockId: "b", toSurfaceId: "y", order: 0 },
      { id: "e2", fromSurfaceId: "y", fromBlockId: "b", toSurfaceId: "x", order: 0 },
    ];
    const path = getHamActivePath({
      rootSurfaceId: "s_root",
      activeSurfaceId: "x",
      branchEdges: cyclic,
    });
    expect(path.surfaceIds[path.surfaceIds.length - 1]).toBe("x");
  });
});

describe("collectDescendants", () => {
  it("collects all reachable surfaces", () => {
    const { childEdgesBySurface } = buildIndices(edges);
    expect([...collectDescendants("s_root", childEdgesBySurface)].sort()).toEqual([
      "s_a",
      "s_a2",
      "s_b",
    ]);
  });
});

describe("reorder siblings (same-anchor only)", () => {
  it("siblingEdges returns only same-anchor edges in order", () => {
    expect(siblingEdges(edges, "s_root", "blk_A").map((e) => e.id)).toEqual(["e_a", "e_a2"]);
  });

  it("rejects a cross-anchor reorder", () => {
    expect(areSameAnchorSiblings(edges, ["e_a", "e_b"])).toBe(false);
    expect(areSameAnchorSiblings(edges, ["e_a", "e_a2"])).toBe(true);
    // reorderByIds with a cross-anchor set is a no-op (same reference).
    expect(reorderSiblingEdgesByIds(edges, ["e_a", "e_b"])).toBe(edges);
  });

  it("reorders by index and renormalizes order; out-of-range is a no-op", () => {
    const moved = reorderSiblingEdgesByIndex(edges, "s_root", "blk_A", 1, 0);
    expect(siblingEdges(moved, "s_root", "blk_A").map((e) => e.id)).toEqual(["e_a2", "e_a"]);
    expect(siblingEdges(moved, "s_root", "blk_A").map((e) => e.order)).toEqual([0, 1]);
    expect(reorderSiblingEdgesByIndex(edges, "s_root", "blk_A", 9, 0)).toBe(edges);
  });

  it("reorders by explicit edge-id order", () => {
    const moved = reorderSiblingEdgesByIds(edges, ["e_a2", "e_a"]);
    expect(siblingEdges(moved, "s_root", "blk_A").map((e) => e.id)).toEqual(["e_a2", "e_a"]);
  });

  it("requires a complete permutation: partial or duplicate id lists are no-ops", () => {
    expect(reorderSiblingEdgesByIds(edges, ["e_a"])).toBe(edges); // partial (group has 2)
    expect(reorderSiblingEdgesByIds(edges, ["e_a", "e_a"])).toBe(edges); // duplicate
    expect(reorderSiblingEdgesByIds(edges, ["e_a2", "e_a"])).not.toBe(edges); // full permutation
  });
});
