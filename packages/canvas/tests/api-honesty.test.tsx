import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamCanvas } from "../src/HamCanvas";
import type { HamCanvasEditorDefaults, HamCanvasHandle, HamSurface } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string): HamSurface => ({
  id,
  rootBlockId: `${id}_root`,
  content: { kind: "markdown", markdown },
});

describe("read-only canvas (no create handler)", () => {
  it("mounts without createSurfaceFromBlock and shows no branch affordances", async () => {
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nA paragraph.\n\n## Section\n\nMore.") }}
        branchEdges={[]}
        behavior={{ enableBranchCreation: false }}
        handlers={{}}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    expect(container.querySelector(".ham-branch-button")).toBeNull();
  });
});

describe("editorDefaults is curated", () => {
  it("rejects canvas-owned props at the type level and passes real defaults through", async () => {
    const defaults: HamCanvasEditorDefaults = {
      ariaLabel: "Custom label",
      bubbleMenu: false,
    };
    // @ts-expect-error — `value` is canvas-owned (content comes from `surfaces`)
    const bad1: HamCanvasEditorDefaults = { value: { kind: "markdown", markdown: "x" } };
    // @ts-expect-error — `onChange` is canvas-owned (wired to autosave)
    const bad2: HamCanvasEditorDefaults = { onChange: () => {} };
    // @ts-expect-error — `onReady` is canvas-owned (handle registry)
    const bad3: HamCanvasEditorDefaults = { onReady: () => {} };
    void bad1;
    void bad2;
    void bad3;

    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root") }}
        branchEdges={[]}
        editorDefaults={defaults}
        handlers={{}}
        behavior={{ enableBranchCreation: false }}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[aria-label="Custom label"]')).not.toBeNull(),
    );
  });
});

describe("HamCanvasHandle.focusBlock", () => {
  it("moves the caret into the requested block of the active surface", async () => {
    let handle: HamCanvasHandle | null = null;
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { dataBlockId: "blk_a" },
          content: [{ type: "text", text: "Alpha." }],
        },
        {
          type: "paragraph",
          attrs: { dataBlockId: "blk_b" },
          content: [{ type: "text", text: "Bravo." }],
        },
      ],
    };
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{
          s_root: {
            id: "s_root",
            rootBlockId: "blk_root",
            content: { kind: "tiptap-json", json },
          },
        }}
        branchEdges={[]}
        handlers={{ createSurfaceFromBlock: vi.fn() }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    await waitFor(() => expect(handle).not.toBeNull());

    handle!.focusBlock("s_root", "blk_b");
    await waitFor(() => {
      // The caret block gets the active styling via the gutter decoration.
      const active = container.querySelector(".ham-block-active");
      expect(active?.getAttribute("data-block-id")).toBe("blk_b");
    });
  });
});
