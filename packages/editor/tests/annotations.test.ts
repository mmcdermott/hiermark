import { describe, it, expect } from "vitest";
import { resolveHits, type HitMeta } from "../src/annotations/conflict";
import { recognizeAnnotations } from "../src/annotations/recognize";
import { createExampleAnnotationRegistry } from "../src/annotations/recognizers";
import { annotationId } from "../src/annotations/identity";
import type { HamAnnotationHit, HamBlockSnapshot } from "../src/types";

function hit(p: Partial<HamAnnotationHit> & { id: string; type: string }): HamAnnotationHit {
  return { blockId: "b1", ...p };
}

describe("resolveHits", () => {
  const meta =
    (table: Record<string, HitMeta>) =>
    (type: string): HitMeta =>
      table[type] ?? { priority: 0, placement: "inline" };

  it("keeps the higher-priority inline hit when ranges overlap", () => {
    const out = resolveHits(
      [
        hit({ id: "cite", type: "citation", from: 0, to: 5 }),
        hit({ id: "ment", type: "mention", from: 0, to: 5 }),
      ],
      meta({
        citation: { priority: 100, placement: "inline" },
        mention: { priority: 110, placement: "inline" },
      }),
    );
    expect(out.map((h) => h.type)).toEqual(["mention"]);
  });

  it("keeps non-overlapping inline hits", () => {
    const out = resolveHits(
      [
        hit({ id: "a", type: "url", from: 0, to: 5 }),
        hit({ id: "b", type: "url", from: 6, to: 10 }),
      ],
      meta({ url: { priority: 50, placement: "inline" } }),
    );
    expect(out).toHaveLength(2);
  });

  it("lets block-level hits coexist across blocks", () => {
    const out = resolveHits(
      [
        hit({ id: "t1", type: "task", blockId: "b1" }),
        hit({ id: "t2", type: "task", blockId: "b2" }),
      ],
      meta({ task: { priority: 100, placement: "block-chip" } }),
    );
    expect(out).toHaveLength(2);
  });

  it("suppresses other block-level hits on a block with an opaque annotation", () => {
    const out = resolveHits(
      [
        hit({ id: "o", type: "opaque", blockId: "b1" }),
        hit({ id: "t", type: "task", blockId: "b1" }),
      ],
      meta({
        opaque: { priority: 200, placement: "block-chip", opaqueBlock: true },
        task: { priority: 100, placement: "block-chip" },
      }),
    );
    expect(out.map((h) => h.type)).toEqual(["opaque"]);
  });
});

describe("annotationId", () => {
  it("is stable for the same inputs and distinguishes occurrences", () => {
    expect(annotationId("citation", "b1", "vaswani2017", 3)).toBe(
      annotationId("citation", "b1", "vaswani2017", 3),
    );
    expect(annotationId("citation", "b1", "vaswani2017", 3)).not.toBe(
      annotationId("citation", "b1", "vaswani2017", 9),
    );
  });
});

describe("recognizeAnnotations with the example registry", () => {
  const registry = createExampleAnnotationRegistry();

  function block(id: string, type: string): HamBlockSnapshot {
    return {
      id,
      type,
      parentId: "root",
      childIds: [],
      order: 0,
      depth: 1,
      textPreview: "",
      isEmpty: false,
    };
  }

  it("recognizes citations, urls, and resolves mentions over citations", () => {
    const blocks = [block("p1", "paragraph")];
    const text = "see @vaswani2017 and ask @alice at https://arxiv.org/abs/1706.03762";
    const hits = recognizeAnnotations({
      registry,
      surfaceId: "s1",
      blocks,
      textByBlockId: { p1: text },
      context: {
        references: { vaswani2017: { title: "Attention" } },
        people: { alice: { name: "Alice" } },
      },
    });
    const byType = (t: string) => hits.filter((h) => h.type === t);
    expect(byType("citation").map((h) => h.label)).toEqual(["vaswani2017"]);
    // @alice is a known person → mention wins over citation for that range.
    expect(byType("mention").map((h) => h.label)).toEqual(["alice"]);
    expect(byType("url")).toHaveLength(1);
    expect(byType("url")[0]!.data).toMatchObject({ kind: "arxiv" });
  });

  it("recognizes task items as block chips", () => {
    const hits = recognizeAnnotations({
      registry,
      surfaceId: "s1",
      blocks: [block("t1", "taskItem")],
      textByBlockId: { t1: "pull the cohort" },
      context: {},
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: "task", blockId: "t1", label: "pull the cohort" });
  });
});
