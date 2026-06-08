import { describe, it, expect } from "vitest";
import { visibleEdges, connectorState, geometryFor } from "../src/connectors/connectors";
import type { HamActivePath, HamBranchEdge } from "../src/types";

const edges: HamBranchEdge[] = [
  { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a", order: 0 },
  { id: "e_a2", fromSurfaceId: "s_root", fromBlockId: "blk_A", toSurfaceId: "s_a2", order: 1 },
  { id: "e_b", fromSurfaceId: "s_root", fromBlockId: "blk_B", toSurfaceId: "s_b", order: 0 },
  { id: "e_deep", fromSurfaceId: "s_a", fromBlockId: "blk_x", toSurfaceId: "s_deep", order: 0 },
];

// Active path: root → s_a (via e_a), now focused on block blk_x in s_a, which
// itself has a branch e_deep.
const activePath: HamActivePath = {
  rootSurfaceId: "s_root",
  activeSurfaceId: "s_a",
  activeBlockId: "blk_x",
  surfaceIds: ["s_root", "s_a"],
  edgeIds: ["e_a"],
  anchorBlockIds: ["blk_A"],
};

describe("visibleEdges", () => {
  it("off draws nothing; all draws everything", () => {
    expect(visibleEdges("off", edges, activePath, null)).toEqual([]);
    expect(visibleEdges("all", edges, activePath, null)).toHaveLength(4);
  });

  it("active draws the lineage edge plus the active block's own branches", () => {
    const shown = visibleEdges("active", edges, activePath, null).map((e) => e.id);
    expect(shown).toContain("e_a"); // on the active lineage
    expect(shown).toContain("e_deep"); // emanates from the active block blk_x in s_a
    expect(shown).not.toContain("e_a2"); // sibling branch off an ancestor block
    expect(shown).not.toContain("e_b"); // unrelated
  });

  it("hover draws only edges from the hovered surface/block", () => {
    expect(visibleEdges("hover", edges, activePath, null)).toEqual([]);
    const bySurface = visibleEdges("hover", edges, activePath, { surfaceId: "s_root" }).map(
      (e) => e.id,
    );
    expect(bySurface.sort()).toEqual(["e_a", "e_a2", "e_b"]);
    const byBlock = visibleEdges("hover", edges, activePath, {
      surfaceId: "s_root",
      blockId: "blk_B",
    }).map((e) => e.id);
    expect(byBlock).toEqual(["e_b"]);
  });
});

describe("connectorState", () => {
  it("classifies edges by their relationship to the active path", () => {
    expect(connectorState(edges[0]!, activePath)).toBe("active"); // e_a on path
    expect(connectorState(edges[1]!, activePath)).toBe("ancestor"); // from s_root (an ancestor)
    expect(connectorState(edges[3]!, activePath)).toBe("ancestor"); // from s_a (active surface)
    const detached: HamBranchEdge = {
      id: "x",
      fromSurfaceId: "s_other",
      fromBlockId: "b",
      toSurfaceId: "s_z",
      order: 0,
    };
    expect(connectorState(detached, activePath)).toBe("muted");
  });
});

describe("geometryFor", () => {
  it("anchors block-right → card-left in content coordinates and curves between", () => {
    const fromRect = { left: 10, right: 110, top: 50, height: 20 };
    const toRect = { left: 400, right: 600, top: 200, height: 40 };
    const g = geometryFor(fromRect, toRect, { left: 0, top: 0 }, { left: 0, top: 0 }, 0.5);
    // from = block right-center; to = card left-center.
    expect(g.from).toEqual({ x: 110, y: 60 });
    expect(g.to).toEqual({ x: 400, y: 220 });
    expect(g.path).toBe("M 110 60 C 255 60, 255 220, 400 220");
  });

  it("offsets by scroll so paths live in the scroll-content space", () => {
    const fromRect = { left: 10, right: 110, top: 50, height: 20 };
    const toRect = { left: 400, right: 600, top: 200, height: 40 };
    const g = geometryFor(fromRect, toRect, { left: 5, top: 8 }, { left: 100, top: 30 }, 0.5);
    // x += scrollLeft - rootLeft ; y += scrollTop - rootTop
    expect(g.from).toEqual({ x: 110 - 5 + 100, y: 60 - 8 + 30 });
    expect(g.to).toEqual({ x: 400 - 5 + 100, y: 220 - 8 + 30 });
  });

  it("enforces a minimum horizontal control offset for near-vertical edges", () => {
    const fromRect = { left: 0, right: 100, top: 0, height: 10 };
    const toRect = { left: 100, right: 200, top: 100, height: 10 };
    // tx - fx = 0 → dx clamps to 40, not 0.
    const g = geometryFor(fromRect, toRect, { left: 0, top: 0 }, { left: 0, top: 0 }, 0.5);
    expect(g.path).toContain("C 140 5"); // fx + 40
  });
});
