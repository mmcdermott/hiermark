import { describe, it, expect } from "vitest";
import { projectBlockTree, type BlockNodeMeta } from "../src/snapshot/projectBlockTree";

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

describe("projectBlockTree", () => {
  it("synthesizes a root and marks it empty when there are no blocks", () => {
    const snap = projectBlockTree([], OPTS);
    expect(snap.rootBlockId).toBe("root");
    expect(snap.blocks.root!.isEmpty).toBe(true);
    expect(snap.blockOrder).toEqual(["root"]);
  });

  it("nests body blocks under their heading (projected containment)", () => {
    const snap = projectBlockTree(
      [
        meta({ id: "h1", type: "heading", headingLevel: 1, text: "Method" }),
        meta({ id: "p1", text: "intro" }),
        meta({ id: "h2", type: "heading", headingLevel: 2, text: "Data" }),
        meta({ id: "p2", text: "dataset" }),
        meta({ id: "h1b", type: "heading", headingLevel: 1, text: "Results" }),
        meta({ id: "p3", text: "auroc" }),
      ],
      OPTS,
    );
    expect(snap.blocks.p1!.parentId).toBe("h1");
    expect(snap.blocks.h2!.parentId).toBe("h1");
    expect(snap.blocks.p2!.parentId).toBe("h2");
    expect(snap.blocks.h1b!.parentId).toBe("root"); // pops back to root
    expect(snap.blocks.p3!.parentId).toBe("h1b");
    // preorder
    expect(snap.blockOrder).toEqual(["root", "h1", "p1", "h2", "p2", "h1b", "p3"]);
    // depths
    expect(snap.blocks.h1!.depth).toBe(1);
    expect(snap.blocks.p2!.depth).toBe(3);
  });

  it("attaches blocks before the first heading to root", () => {
    const snap = projectBlockTree(
      [
        meta({ id: "pre", text: "preamble" }),
        meta({ id: "h", type: "heading", headingLevel: 1, text: "H" }),
        meta({ id: "body", text: "body" }),
      ],
      OPTS,
    );
    expect(snap.blocks.pre!.parentId).toBe("root");
    expect(snap.blocks.body!.parentId).toBe("h");
    expect(snap.blocks.root!.childIds).toEqual(["pre", "h"]);
  });

  it("preserves literal list nesting and orders siblings by document order", () => {
    // - item A
    //   - nested A1
    //   - nested A2
    // - item B
    const snap = projectBlockTree(
      [
        meta({ id: "liA", type: "listItem", text: "A" }),
        meta({ id: "liA1", type: "listItem", text: "A1", literalParentId: "liA" }),
        meta({ id: "liA2", type: "listItem", text: "A2", literalParentId: "liA" }),
        meta({ id: "liB", type: "listItem", text: "B" }),
      ],
      OPTS,
    );
    expect(snap.blocks.liA!.parentId).toBe("root");
    expect(snap.blocks.liA1!.parentId).toBe("liA");
    expect(snap.blocks.liA!.childIds).toEqual(["liA1", "liA2"]);
    expect(snap.blocks.liA1!.order).toBe(0);
    expect(snap.blocks.liA2!.order).toBe(1);
    expect(snap.blocks.liB!.order).toBe(1); // second top-level child of root
  });

  it("combines heading + list containment: a top-level list under a heading", () => {
    const snap = projectBlockTree(
      [
        meta({ id: "h", type: "heading", headingLevel: 2, text: "Eval" }),
        meta({ id: "t1", type: "taskItem", text: "AUROC" }),
        meta({ id: "t2", type: "taskItem", text: "calibration" }),
      ],
      OPTS,
    );
    expect(snap.blocks.t1!.parentId).toBe("h");
    expect(snap.blocks.t2!.parentId).toBe("h");
    expect(snap.blocks.h!.childIds).toEqual(["t1", "t2"]);
  });

  it("falls back to root when a literalParentId is dangling", () => {
    const snap = projectBlockTree([meta({ id: "x", literalParentId: "ghost" })], OPTS);
    expect(snap.blocks.x!.parentId).toBe("root");
  });

  it("reattaches blocks orphaned by a cyclic literalParentId so none vanish", () => {
    // a → b → a is malformed (can't happen from a real PM tree, but be defensive).
    const snap = projectBlockTree(
      [
        meta({ id: "a", type: "listItem", literalParentId: "b" }),
        meta({ id: "b", type: "listItem", literalParentId: "a" }),
      ],
      OPTS,
    );
    // Every block is present in blocks and blockOrder; the DFS never loops.
    expect(snap.blockOrder).toContain("a");
    expect(snap.blockOrder).toContain("b");
    expect(new Set(snap.blockOrder).size).toBe(snap.blockOrder.length);
    expect(Object.keys(snap.blocks).sort()).toEqual(["a", "b", "root"]);
  });

  it("carries an empty flag and attrs through", () => {
    const snap = projectBlockTree(
      [meta({ id: "e", isEmpty: true, text: "", attrs: { foo: 1 } })],
      OPTS,
    );
    expect(snap.blocks.e!.isEmpty).toBe(true);
    expect(snap.blocks.e!.attrs).toEqual({ foo: 1 });
  });
});
