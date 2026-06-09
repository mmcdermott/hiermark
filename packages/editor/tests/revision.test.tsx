import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorContent, HamEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

describe("revision swap (controlled value)", () => {
  it("re-applies value when revision changes, preserving matching block ids", async () => {
    let handle: HamEditorHandle | null = null;
    const view = (value: HamEditorContent, revision: number) => (
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={value}
        revision={revision}
        onReady={(h) => {
          handle = h;
        }}
      />
    );
    const { rerender } = render(view({ kind: "markdown", markdown: "# Title\n\nOriginal.\n" }, 1));
    await waitFor(() => expect(handle).not.toBeNull());
    const titleId = () =>
      Object.values(handle!.getSnapshot().blocks).find((b) => b.textPreview.startsWith("Title"))
        ?.id;
    const id1 = titleId();
    expect(handle!.getMarkdown()).toContain("Original.");

    // Same value + revision → no change.
    rerender(view({ kind: "markdown", markdown: "# Title\n\nIGNORED.\n" }, 1));
    await new Promise((r) => setTimeout(r, 20));
    expect(handle!.getMarkdown()).toContain("Original.");
    expect(handle!.getMarkdown()).not.toContain("IGNORED");

    // Bump revision → the new value is applied.
    rerender(view({ kind: "markdown", markdown: "# Title\n\nRevised body.\n" }, 2));
    await waitFor(() => expect(handle!.getMarkdown()).toContain("Revised body."));
    // The unchanged heading keeps its id across the swap.
    expect(titleId()).toBe(id1);
  });
});
