import { describe, it, expect } from "vitest";
import { projectBlockTree, type BlockNodeMeta } from "../src/snapshot/projectBlockTree";
import { resolveBranchMode, isBranchable, SMART_RULES } from "../src/snapshot/blockTreePolicy";
import type { HamBranchabilityRules, HamSurfaceSnapshot } from "../src/types";

const OPTS = { surfaceId: "s1", rootBlockId: "root", rootTitle: "Root" };

function meta(p: Partial<BlockNodeMeta> & { id: string }): BlockNodeMeta {
  return {
    type: "paragraph",
    headingLevel: null,
    text: p.id,
    isEmpty: false,
    literalParentId: null,
    ...p,
  };
}

const block = (snap: HamSurfaceSnapshot, id: string) => snap.blocks[id]!;

describe("resolveBranchMode — smart default", () => {
  // root → h1(Method) → p1 leaf ; h1 also forks: h1 → h2(Data) → p2 leaf
  // plus a single-child list chain liA → liA1 → liA1a.
  const forky = projectBlockTree(
    [
      // A single-child list chain attached to root (before any heading).
      meta({ id: "liA", type: "listItem", text: "A" }),
      meta({ id: "liA1", type: "listItem", text: "A1", literalParentId: "liA" }),
      meta({ id: "liA1a", type: "listItem", text: "A1a", literalParentId: "liA1" }),
      // A heading section that forks (p1 + sub-heading) and a single-child sub-heading.
      meta({ id: "h1", type: "heading", headingLevel: 1, text: "Method" }),
      meta({ id: "p1", text: "intro" }),
      meta({ id: "h2", type: "heading", headingLevel: 2, text: "Data" }),
      meta({ id: "p2", text: "dataset" }),
    ],
    OPTS,
  );

  it("never branches the structural root or an empty block", () => {
    const empty = projectBlockTree([meta({ id: "e", isEmpty: true, text: "" })], OPTS);
    expect(resolveBranchMode(block(empty, "root"), empty)).toBe("none");
    expect(resolveBranchMode(block(empty, "e"), empty)).toBe("none");
  });

  it("branches a leaf paragraph", () => {
    expect(resolveBranchMode(block(forky, "p1"), forky)).toBe("branch");
    expect(resolveBranchMode(block(forky, "p2"), forky)).toBe("branch");
  });

  it("branches a multi-child fork (heading with a sub-heading and a paragraph)", () => {
    // h1 has children p1 and h2 → a real fork.
    expect(block(forky, "h1").childIds).toEqual(["p1", "h2"]);
    expect(resolveBranchMode(block(forky, "h1"), forky)).toBe("branch");
  });

  it("keeps the topmost single-child container and suppresses the redundant middle (hoist-up)", () => {
    // liA (top, parent=root) keeps; liA1 (parent has 1 child) suppressed; leaf branches.
    expect(resolveBranchMode(block(forky, "liA"), forky)).toBe("branch");
    expect(resolveBranchMode(block(forky, "liA1"), forky)).toBe("none");
    expect(resolveBranchMode(block(forky, "liA1a"), forky)).toBe("branch");
  });

  it("always branches headings even with a single child (named anchors)", () => {
    // h2 is a single-child heading (only child p2) yet stays branchable.
    expect(block(forky, "h2").childIds).toEqual(["p2"]);
    expect(resolveBranchMode(block(forky, "h2"), forky)).toBe("branch");
  });

  it("switches to add-sibling once the block already has a branch child", () => {
    expect(resolveBranchMode(block(forky, "p1"), forky, "smart", { existingChildCount: 1 })).toBe(
      "add-sibling",
    );
    // ...but a suppressed intermediate that somehow has a child still becomes actionable.
    expect(resolveBranchMode(block(forky, "liA1"), forky, "smart", { existingChildCount: 2 })).toBe(
      "add-sibling",
    );
    // root/empty stay none regardless of children.
    expect(resolveBranchMode(block(forky, "root"), forky, "smart", { existingChildCount: 3 })).toBe(
      "none",
    );
  });

  it("exposes SMART_RULES as the resolved default", () => {
    expect(SMART_RULES).toMatchObject({
      kind: "rules",
      passThrough: "hoist-up",
      alwaysHeadings: true,
    });
    // Passing SMART_RULES explicitly matches the "smart" string.
    expect(resolveBranchMode(block(forky, "liA1"), forky, SMART_RULES)).toBe(
      resolveBranchMode(block(forky, "liA1"), forky, "smart"),
    );
  });
});

describe("resolveBranchMode — rules variants", () => {
  const chain = projectBlockTree(
    [
      meta({ id: "liA", type: "listItem", text: "A" }),
      meta({ id: "liA1", type: "listItem", text: "A1", literalParentId: "liA" }),
      meta({ id: "liA1a", type: "listItem", text: "A1a", literalParentId: "liA1" }),
    ],
    OPTS,
  );

  it("delegate-down keeps only the chain tail branchable", () => {
    const rules: HamBranchabilityRules = { kind: "rules", passThrough: "delegate-down" };
    expect(resolveBranchMode(block(chain, "liA"), chain, rules)).toBe("none");
    expect(resolveBranchMode(block(chain, "liA1"), chain, rules)).toBe("none");
    expect(resolveBranchMode(block(chain, "liA1a"), chain, rules)).toBe("branch");
  });

  it("singleChildContainers:true branches every container in the chain", () => {
    const rules: HamBranchabilityRules = { kind: "rules", singleChildContainers: true };
    expect(resolveBranchMode(block(chain, "liA"), chain, rules)).toBe("branch");
    expect(resolveBranchMode(block(chain, "liA1"), chain, rules)).toBe("branch");
  });

  it("maxDepth caps branchability by projected depth", () => {
    const rules: HamBranchabilityRules = { kind: "rules", maxDepth: 1 };
    // liA at depth 1 branchable; liA1a deeper than 1 → none.
    expect(block(chain, "liA").depth).toBe(1);
    expect(resolveBranchMode(block(chain, "liA"), chain, rules)).toBe("branch");
    expect(resolveBranchMode(block(chain, "liA1a"), chain, rules)).toBe("none");
  });
});

describe("resolveBranchMode — legacy string policies + isBranchable wrapper", () => {
  const snap = projectBlockTree(
    [
      meta({ id: "h", type: "heading", headingLevel: 1, text: "H" }),
      meta({ id: "p", text: "body" }),
    ],
    OPTS,
  );

  it("any-nonempty-block branches any non-root, non-empty block", () => {
    expect(resolveBranchMode(block(snap, "p"), snap, "any-nonempty-block")).toBe("branch");
    expect(resolveBranchMode(block(snap, "root"), snap, "any-nonempty-block")).toBe("none");
  });

  it("headings-only branches only headings; root-only branches no block", () => {
    expect(resolveBranchMode(block(snap, "h"), snap, "headings-only")).toBe("branch");
    expect(resolveBranchMode(block(snap, "p"), snap, "headings-only")).toBe("none");
    expect(resolveBranchMode(block(snap, "h"), snap, "root-only")).toBe("none");
  });

  it("honors a custom function policy", () => {
    const onlyP = (b: { id: string }) => b.id === "p";
    expect(resolveBranchMode(block(snap, "p"), snap, onlyP)).toBe("branch");
    expect(resolveBranchMode(block(snap, "h"), snap, onlyP)).toBe("none");
  });

  it("isBranchable is the boolean projection of resolveBranchMode", () => {
    expect(isBranchable(block(snap, "p"), snap)).toBe(true);
    expect(isBranchable(block(snap, "root"), snap)).toBe(false);
  });
});
