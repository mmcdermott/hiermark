import { describe, it, expect } from "vitest";
import { collectSuggestions } from "../src/annotations/suggest";
import {
  createCitationAnnotation,
  createMentionAnnotation,
  type HiermarkExampleAnnotationContext,
} from "../src/annotations/recognizers";
import type { HiermarkAnnotationRegistry } from "../src/types";

const registry: HiermarkAnnotationRegistry<HiermarkExampleAnnotationContext> = {
  types: [createMentionAnnotation(), createCitationAnnotation()],
};
const context: HiermarkExampleAnnotationContext = {
  references: {
    vaswani2017: { title: "Attention Is All You Need", year: 2017 },
    eq2024: { title: "EQ forecasting on eICU", year: 2024 },
  },
  people: { alice: { name: "Alice Researcher" }, bob: { name: "Bob Engineer" } },
};

describe("collectSuggestions", () => {
  it("aggregates people then references for the shared @ trigger", () => {
    const items = collectSuggestions(registry, "@", "", context);
    // mention type is registered before citation, so people come first.
    const ids = items.map((i) => i.id);
    expect(ids).toEqual([
      "mention:alice",
      "mention:bob",
      "citation:vaswani2017",
      "citation:eq2024",
    ]);
    // Each insert is the literal token the recognizers will re-detect.
    expect(items.find((i) => i.id === "citation:vaswani2017")!.insert).toBe("@vaswani2017 ");
  });

  it("filters by query against key and title/name (case-insensitive)", () => {
    expect(collectSuggestions(registry, "@", "vas", context).map((i) => i.id)).toEqual([
      "citation:vaswani2017",
    ]);
    // matches a reference title word, not just the key
    expect(collectSuggestions(registry, "@", "eicu", context).map((i) => i.id)).toEqual([
      "citation:eq2024",
    ]);
    // matches a person's display name
    expect(collectSuggestions(registry, "@", "alice", context).map((i) => i.id)).toEqual([
      "mention:alice",
    ]);
  });

  it("returns nothing for a trigger no type handles", () => {
    expect(collectSuggestions(registry, "#", "", context)).toEqual([]);
  });

  it("caps the result list at maxItems", () => {
    const many: HiermarkExampleAnnotationContext = {
      references: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`ref${i}`, { title: `Paper ${i}` }]),
      ),
    };
    expect(collectSuggestions(registry, "@", "", many, 5)).toHaveLength(5);
  });
});
