import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { computeFold } from "../src/extensions/block-fold";
import { HiermarkEditor } from "../src/HiermarkEditor";
import { createExampleAnnotationRegistry } from "../src/annotations/recognizers";
import type { HiermarkEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

describe("computeFold", () => {
  it("hides a folded heading's section but not the heading or later siblings", () => {
    const metas = [
      { level: 1, id: "a" },
      { level: null, id: "p1" },
      { level: 2, id: "b" },
      { level: null, id: "p2" },
      { level: 1, id: "c" },
    ];
    const { hidden, toggleCollapsed } = computeFold(metas, new Set(["a"]));
    expect(hidden).toEqual([false, true, true, true, false]);
    // A is collapsed and foldable; B is foldable (not collapsed); C has no section.
    expect(toggleCollapsed).toEqual([true, null, false, null, null]);
  });

  it("marks no toggle for a heading with no following section", () => {
    const { toggleCollapsed } = computeFold([{ level: 1, id: "a" }], new Set());
    expect(toggleCollapsed).toEqual([null]);
  });
});

async function mountEditor(extra: Partial<Parameters<typeof HiermarkEditor>[0]> = {}) {
  let handle: HiermarkEditorHandle | null = null;
  const utils = render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown: "# Section A\n\nbody under A\n\n## Sub\n\nmore" }}
      onReady={(h) => {
        handle = h;
      }}
      {...extra}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("block fold (integration)", () => {
  it("renders fold toggles and folds a section when toggled", async () => {
    const { container } = await mountEditor();
    let toggle: HTMLElement | null = null;
    await waitFor(() => {
      toggle = container.querySelector<HTMLElement>(".hiermark-fold-toggle");
      expect(toggle).not.toBeNull();
    });
    expect(container.querySelector(".hiermark-folded")).toBeNull(); // nothing folded yet
    fireEvent.click(toggle!);
    await waitFor(() => {
      expect(container.querySelector(".hiermark-folded")).not.toBeNull(); // section hidden
    });
  });

  it("collapseBlock/expandBlock on the handle drive the fold state", async () => {
    const { container, getHandle } = await mountEditor();
    const snap = getHandle().getSnapshot();
    const heading = Object.values(snap.blocks).find((b) => b.textPreview === "Section A")!;
    getHandle().collapseBlock(heading.id);
    await waitFor(() => expect(container.querySelector(".hiermark-folded")).not.toBeNull());
    getHandle().expandBlock(heading.id);
    await waitFor(() => expect(container.querySelector(".hiermark-folded")).toBeNull());
  });
});

describe("annotation popover", () => {
  it("opens a Floating-UI popover when a citation is clicked, dismissible by Escape", async () => {
    const { container } = await mountEditor({
      value: {
        kind: "markdown",
        markdown: "# Refs\n\nThe paper @vaswani2017 is seminal.",
      },
      annotations: createExampleAnnotationRegistry() as Parameters<
        typeof HiermarkEditor
      >[0]["annotations"],
      annotationContext: { references: { vaswani2017: { title: "Attention", year: 2017 } } },
    });

    let cite: HTMLElement | null = null;
    await waitFor(() => {
      cite = container.querySelector<HTMLElement>('[data-annotation-type="citation"]');
      expect(cite).not.toBeNull();
    });
    fireEvent.click(cite!);

    // The popover renders into a portal (document.body), showing the render component.
    await waitFor(() => {
      const pop = document.querySelector(".hiermark-annotation-popover");
      expect(pop).not.toBeNull();
      expect(pop!.textContent).toContain("vaswani2017");
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.querySelector(".hiermark-annotation-popover")).toBeNull();
    });
  });
});
