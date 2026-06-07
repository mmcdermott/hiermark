import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamEditor } from "../src/HamEditor";
import { createExampleAnnotationRegistry } from "../src/annotations/recognizers";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const MD =
  "# Related work\n\n" +
  "The transformer @vaswani2017 and ask @alice. See https://arxiv.org/abs/1706.03762\n\n" +
  "- [ ] summarize the paper\n";

describe("HamEditor + annotations", () => {
  it("renders inline citation/mention/url decorations and a task block chip", async () => {
    const { container } = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: MD }}
        annotations={createExampleAnnotationRegistry()}
        annotationContext={{
          references: { vaswani2017: { title: "Attention Is All You Need", year: 2017 } },
          people: { alice: { name: "Alice Researcher" } },
        }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-type="citation"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-annotation-type="mention"]')).not.toBeNull();
    expect(container.querySelector('[data-annotation-type="url"]')).not.toBeNull();
    expect(container.querySelector(".ham-annotation-chip-task")).not.toBeNull();

    // The known citation carries the resolved class.
    const cite = container.querySelector('[data-annotation-type="citation"]')!;
    expect(cite.className).toContain("ham-citation-known");
  });
});
