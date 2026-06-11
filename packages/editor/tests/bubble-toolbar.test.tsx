import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HiermarkEditor } from "../src/HiermarkEditor";
import type { HiermarkEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(extra: Partial<Parameters<typeof HiermarkEditor>[0]> = {}) {
  let handle: HiermarkEditorHandle | null = null;
  render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown: "Hello world" }}
      onReady={(h) => {
        handle = h;
      }}
      {...extra}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return handle!.getUnsafeTiptapEditor() as Editor;
}

describe("BubbleToolbar", () => {
  it("appears on a non-empty selection and toggles a mark", async () => {
    const editor = await mount();
    editor.commands.focus();
    editor.commands.setTextSelection({ from: 1, to: 6 }); // "Hello"
    await waitFor(() => {
      expect(document.querySelector(".hiermark-bubble-toolbar")).not.toBeNull();
    });
    const bold = document.querySelector<HTMLButtonElement>('.hiermark-bubble-btn[data-mark="bold"]')!;
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    bold.click();
    expect(editor.isActive("bold")).toBe(true);
  });

  it("hides when the selection is empty", async () => {
    const editor = await mount();
    editor.commands.focus();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    await waitFor(() => expect(document.querySelector(".hiermark-bubble-toolbar")).not.toBeNull());
    editor.commands.setTextSelection({ from: 3, to: 3 }); // collapse
    await waitFor(() => expect(document.querySelector(".hiermark-bubble-toolbar")).toBeNull());
  });

  it("does not render when bubbleMenu is false", async () => {
    const editor = await mount({ bubbleMenu: false });
    editor.commands.focus();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    // Give any effect a tick; the toolbar must never appear.
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector(".hiermark-bubble-toolbar")).toBeNull();
  });
});
