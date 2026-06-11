import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HiermarkEditor } from "../src/HiermarkEditor";
import type { HiermarkEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

/** Mount an editor on `markdown`, then read its serialized markdown back out. */
async function roundtrip(markdown: string): Promise<string> {
  let handle: HiermarkEditorHandle | null = null;
  render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return handle!.getMarkdown().trim();
}

/**
 * Round-trip fidelity audit (spec §5.10): markdown in → editor → markdown out.
 * Documents what the editor preserves. Assertions are tolerant of serializer
 * normalization (emphasis marker choice, list bullet, whitespace) — they pin
 * the *content* that must survive, not byte-exact output.
 */
describe("markdown round-trip fidelity", () => {
  it("preserves headings at every level", async () => {
    const md = await roundtrip("# H1\n\n## H2\n\n### H3");
    expect(md).toContain("# H1");
    expect(md).toContain("## H2");
    expect(md).toContain("### H3");
  });

  it("preserves inline emphasis, strong, code, and strikethrough", async () => {
    const md = await roundtrip("Plain **strong** and *emphasis* and `code` and ~~struck~~.");
    expect(md).toMatch(/\*\*strong\*\*|__strong__/);
    expect(md).toMatch(/\*emphasis\*|_emphasis_/);
    expect(md).toContain("`code`");
    expect(md).toContain("~~struck~~");
  });

  it("preserves links and images", async () => {
    const md = await roundtrip(
      "A [link](https://example.com) and an ![alt text](https://example.com/i.png).",
    );
    expect(md).toContain("[link](https://example.com)");
    expect(md).toContain("![alt text](https://example.com/i.png)");
  });

  it("preserves bullet, ordered, and task lists", async () => {
    const bullets = await roundtrip("- one\n- two\n- three");
    expect(bullets).toMatch(/[-*] one/);
    expect(bullets).toMatch(/[-*] three/);

    const ordered = await roundtrip("1. first\n2. second");
    expect(ordered).toContain("1. first");
    expect(ordered).toMatch(/2\. second/);

    const tasks = await roundtrip("- [ ] todo\n- [x] done");
    expect(tasks).toMatch(/\[ \] todo/);
    expect(tasks).toMatch(/\[x\] done/i);
  });

  it("preserves blockquotes", async () => {
    const md = await roundtrip("> a quoted line");
    expect(md).toContain("> a quoted line");
  });

  it("preserves fenced code blocks with their language", async () => {
    const md = await roundtrip("```ts\nconst x: number = 1;\n```");
    expect(md).toContain("```ts");
    expect(md).toContain("const x: number = 1;");
  });

  it("preserves GFM tables (cells may be padded to column width)", async () => {
    const md = await roundtrip("| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
    // The serializer pads cells to the column width (`| A   | B   |`), which is
    // still valid GFM — assert on cell content + the header separator row.
    expect(md).toMatch(/\|\s*A\s*\|\s*B\s*\|/);
    expect(md).toMatch(/\|\s*-+\s*\|\s*-+\s*\|/);
    expect(md).toMatch(/\|\s*1\s*\|\s*2\s*\|/);
    expect(md).toMatch(/\|\s*3\s*\|\s*4\s*\|/);
  });

  it("preserves inline and block math (Hiermark single-$ convention)", async () => {
    const inline = await roundtrip("Euler: $e^{i\\pi} + 1 = 0$ is neat.");
    expect(inline).toContain("$e^{i\\pi} + 1 = 0$");

    const block = await roundtrip("$$\n\\int_0^1 x\\,dx = \\tfrac12\n$$");
    expect(block).toContain("\\int_0^1");
    expect(block).toContain("$$");
  });

  it("preserves a heading + paragraph + nested list document end-to-end", async () => {
    const src = [
      "# Title",
      "",
      "Intro paragraph with **bold**.",
      "",
      "- top",
      "  - nested",
      "- back",
    ].join("\n");
    const md = await roundtrip(src);
    expect(md).toContain("# Title");
    expect(md).toMatch(/\*\*bold\*\*|__bold__/);
    expect(md).toMatch(/[-*] top/);
    expect(md).toMatch(/[-*] nested/);
  });
});
