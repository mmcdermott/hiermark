import { describe, it, expect } from "vitest";
import { siblingEdgeOrder } from "../src/topology/siblingOrder";
import type { HiermarkBranchEdge } from "../src/types";

const edge = (id: string, from: string, block: string, order: number): HiermarkBranchEdge => ({
  id,
  fromSurfaceId: from,
  fromBlockId: block,
  toSurfaceId: `to_${id}`,
  order,
});

describe("siblingEdgeOrder (reorder undo unit)", () => {
  const edges = [
    edge("e2", "s_root", "blk_X", 1),
    edge("e0", "s_root", "blk_X", 0),
    edge("e1", "s_root", "blk_X", 2),
    edge("other", "s_root", "blk_Y", 0), // different anchor — excluded
    edge("child", "s_a", "blk_X", 0), // different surface — excluded
  ];

  it("returns the anchor's edge ids in ascending order", () => {
    expect(siblingEdgeOrder(edges, "s_root", "blk_X")).toEqual(["e0", "e2", "e1"]);
  });

  it("scopes strictly to (fromSurfaceId, fromBlockId)", () => {
    expect(siblingEdgeOrder(edges, "s_root", "blk_Y")).toEqual(["other"]);
    expect(siblingEdgeOrder(edges, "s_a", "blk_X")).toEqual(["child"]);
    expect(siblingEdgeOrder(edges, "nope", "blk_X")).toEqual([]);
  });

  it("captures a stable snapshot that re-applying reverts a reorder", () => {
    // Snapshot the order, then 'reorder' the edges; the snapshot still describes
    // the pre-reorder order (what undo re-applies).
    const before = siblingEdgeOrder(edges, "s_root", "blk_X");
    const reordered = edges.map((e) => (e.id === "e0" ? { ...e, order: 5 } : e));
    expect(siblingEdgeOrder(reordered, "s_root", "blk_X")).toEqual(["e2", "e1", "e0"]);
    expect(before).toEqual(["e0", "e2", "e1"]); // unchanged — safe to store for undo
  });
});
