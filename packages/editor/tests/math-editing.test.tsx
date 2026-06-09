import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(markdown = "") {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getEditor: () => handle!.getUnsafeTiptapEditor() as Editor };
}

/** Fire `ch` at the end of the last text node (inside its textblock) so input rules run. */
function typeChar(editor: Editor, ch: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, p) => {
    if (node.isText) pos = p + node.nodeSize;
  });
  const at = pos ?? editor.state.selection.from;
  editor.commands.setTextSelection(at);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.view.someProp("handleTextInput", (f: any) => f(editor.view, at, at, ch));
}

function nodeTypes(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.descendants((n) => {
    out.push(n.type.name);
  });
  return out;
}

describe("math input rules (markdown-aligned)", () => {
  it("converts single-$ inline math typed mid-sentence", async () => {
    const { getEditor } = await mount();
    const editor = getEditor();
    // Everything up to (but not including) the closing $, then "type" the $.
    editor.commands.setContent("<p>Energy is $E=mc^2</p>");
    typeChar(editor, "$");
    await waitFor(() => expect(nodeTypes(editor)).toContain("inlineMath"));
    // The inner LaTeX is captured, the dollars consumed.
    const md = editor.getMarkdown();
    expect(md).toContain("$E=mc^2$");
  });

  it("converts $$…$$ to a block math node (not inline)", async () => {
    const { getEditor } = await mount();
    const editor = getEditor();
    editor.commands.setContent("<p>$$a+b$</p>");
    typeChar(editor, "$");
    await waitFor(() => expect(nodeTypes(editor)).toContain("blockMath"));
    expect(nodeTypes(editor)).not.toContain("inlineMath");
  });
});

describe("math click-to-edit", () => {
  it("opens a LaTeX popover on click and commits an edit", async () => {
    const { container, getEditor } = await mount("Inline $E=mc^2$ here.\n");
    const mathEl = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-type="inline-math"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(mathEl);

    const input = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>(".ham-math-input");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(input.value).toBe("E=mc^2");
    fireEvent.change(input, { target: { value: "a^2 + b^2 = c^2" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(getEditor().getMarkdown()).toContain("$a^2 + b^2 = c^2$"));
    expect(document.querySelector(".ham-math-popover")).toBeNull();
  });

  it("deletes the math node via the popover Delete button", async () => {
    const { container, getEditor } = await mount("Inline $E=mc^2$ here.\n");
    const mathEl = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-type="inline-math"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(mathEl);
    const del = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(".ham-math-del");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(del);
    await waitFor(() => expect(nodeTypes(getEditor())).not.toContain("inlineMath"));
  });
});
