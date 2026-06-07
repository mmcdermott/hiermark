import { describe, it, expect } from "vitest";
import { fnv1a64Hex } from "../src/markdown/hash";
import { stripStableIds, readStableId, injectInlineId } from "../src/markdown/stable-id";
import { parseChecklist, normalize, taskKey, injectTaskIds } from "../src/markdown/checklist";
import { extractCitationKeys, findCitations } from "../src/markdown/citations";
import { extractResourceLinks, detectResourceKind } from "../src/markdown/resources";

describe("fnv1a64Hex", () => {
  it("is deterministic and 16 hex chars", () => {
    const h = fnv1a64Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1a64Hex("hello")).toBe(h);
    expect(fnv1a64Hex("hello")).not.toBe(fnv1a64Hex("world"));
  });
});

describe("stable-id grammar", () => {
  it("strips standalone and inline id comments", () => {
    const md = "<!-- ham:block=blk_1 -->\n# Title <!-- ham:block=blk_2 -->\nbody";
    expect(stripStableIds(md)).toBe("# Title\nbody");
  });
  it("reads the id of a given kind", () => {
    expect(readStableId("text <!-- ham:task=t_9 -->", "task")).toBe("t_9");
    expect(readStableId("text <!-- ham:task=t_9 -->", "block")).toBeNull();
  });
  it("injects an inline id, trimming trailing whitespace first", () => {
    expect(injectInlineId("- [ ] do it   ", "task", "t_1")).toBe(
      "- [ ] do it <!-- ham:task=t_1 -->",
    );
  });
  it("assigning an id never changes the content hash (strip-before-hash)", () => {
    const body = "- [ ] pull the eICU cohort";
    const withId = injectInlineId(body, "task", "t_1");
    expect(fnv1a64Hex(stripStableIds(body))).toBe(fnv1a64Hex(stripStableIds(withId)));
  });
});

describe("parseChecklist", () => {
  it("parses tasks and checked state, normalizing text", () => {
    const items = parseChecklist("- [ ] alpha\n- [x] beta", 0);
    expect(items.map((i) => [i.text, i.checked])).toEqual([
      ["alpha", false],
      ["beta", true],
    ]);
    expect(items[0]!.key).toBe(taskKey("alpha"));
  });
  it("ignores checkboxes inside fenced code blocks", () => {
    const md = "- [ ] real\n```\n- [ ] fake\n```\n- [x] also real";
    const items = parseChecklist(md, 0);
    expect(items.map((i) => i.text)).toEqual(["real", "also real"]);
  });
  it("ignores ~~~ fences too", () => {
    const md = "~~~\n- [ ] fake\n~~~\n- [ ] real";
    expect(parseChecklist(md, 0).map((i) => i.text)).toEqual(["real"]);
  });
  it("unescapes markdown so W\\&B matches W&B", () => {
    expect(normalize("W\\&B")).toBe("W&B");
    expect(taskKey("W\\&B")).toBe(taskKey("W&B"));
  });
  it("reads an existing task id and strips it from text", () => {
    const items = parseChecklist("- [ ] do it <!-- ham:task=t_1 -->", 3);
    expect(items[0]!.text).toBe("do it");
    expect(items[0]!.stableId).toBe("t_1");
    expect(items[0]!.blockPosition).toBe(3);
  });
});

describe("injectTaskIds", () => {
  it("stamps ids by content key, never inside fences, never overwriting", () => {
    const md = "- [ ] alpha\n```\n- [ ] alpha\n```\n- [ ] beta <!-- ham:task=keep -->";
    const ids = new Map([
      [taskKey("alpha"), "t_a"],
      [taskKey("beta"), "t_b"],
    ]);
    const out = injectTaskIds(md, ids).split("\n");
    expect(out[0]).toBe("- [ ] alpha <!-- ham:task=t_a -->");
    expect(out[2]).toBe("- [ ] alpha"); // inside fence, untouched
    expect(out[4]).toBe("- [ ] beta <!-- ham:task=keep -->"); // existing id wins
  });
});

describe("citations", () => {
  it("extracts distinct @keys, ignoring email-ish @", () => {
    expect(extractCitationKeys("see @vaswani2017 and @smith2020, not a@b.com")).toEqual([
      "vaswani2017",
      "smith2020",
    ]);
  });
  it("supports dotted keys and reports offsets", () => {
    const hits = findCitations("x @a.b y @a.b");
    expect(hits.map((h) => h.key)).toEqual(["a.b", "a.b"]);
    expect(hits[0]!.index).toBe(2);
  });
});

describe("resources", () => {
  it("classifies URL kinds", () => {
    expect(detectResourceKind("https://arxiv.org/abs/1706.03762")).toBe("arxiv");
    expect(detectResourceKind("https://github.com/x/y")).toBe("github");
    expect(detectResourceKind("https://example.com/a.pdf")).toBe("pdf");
    expect(detectResourceKind("https://youtu.be/abc")).toBe("youtube");
    expect(detectResourceKind("https://example.com")).toBe("url");
  });
  it("extracts distinct links and trims trailing punctuation", () => {
    const refs = extractResourceLinks("see https://arxiv.org/abs/1, and https://arxiv.org/abs/1.");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe("https://arxiv.org/abs/1");
  });
});
