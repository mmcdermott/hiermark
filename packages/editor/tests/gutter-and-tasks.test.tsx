import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { Editor } from "@tiptap/core";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamEditor } from "../src/HamEditor";
import type { HamBlockSlotProps, HamEditorHandle, HamEditorProps } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(extra: Partial<HamEditorProps> = {}, markdown = "# Title\n\nbody") {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      onReady={(h) => {
        handle = h;
      }}
      {...extra}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

// Fire the final character of a typed sequence through ProseMirror's input
// handling so input rules run (insertContent alone does not trigger them). We
// place the cursor at the end of the first text node (the "[ ]" marker), which
// is where the user would be typing — not at the document end.
function typeFinalSpace(editor: Editor) {
  // Type at the end of the `[ ]` marker text node (it may not be the first one
  // in a nested list).
  let pos: number | null = null;
  editor.state.doc.descendants((node: any, p: number) => {
    if (pos == null && node.isText && node.text?.includes("[")) pos = p + node.nodeSize;
  });
  if (pos == null) {
    editor.state.doc.descendants((node: any, p: number) => {
      if (pos == null && node.isText) pos = p + node.nodeSize;
    });
  }
  pos = pos ?? editor.state.selection.from;
  editor.commands.setTextSelection(pos);
  editor.view.someProp("handleTextInput", (f: any) => f(editor.view, pos, pos, " "));
}

function topLevelTypes(editor: any): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((n: any) => out.push(n.type.name));
  return out;
}

function nodeTypes(editor: any): string[] {
  const types: string[] = [];
  editor.state.doc.descendants((n: any) => types.push(n.type.name));
  return types;
}

describe("task creation by typing", () => {
  it("creates a task item when typing a bare [ ] checkbox", async () => {
    const { getHandle } = await mount({}, "");
    const editor = getHandle().getUnsafeTiptapEditor() as any;
    editor.commands.setContent("<p>[ ]</p>");
    typeFinalSpace(editor);
    await waitFor(() => expect(nodeTypes(editor)).toContain("taskItem"));
  });

  it("converts a bullet item to a task when typing [ ] after a dash (- [ ])", async () => {
    const { getHandle } = await mount({}, "");
    const editor = getHandle().getUnsafeTiptapEditor() as any;
    // After typing "- ", StarterKit has already made a bullet item; the user
    // then types "[ ] " inside it.
    editor.commands.setContent("<ul><li><p>[ ]</p></li></ul>");
    typeFinalSpace(editor);
    await waitFor(() => {
      const types = nodeTypes(editor);
      expect(types).toContain("taskItem");
      expect(types).not.toContain("bulletList");
    });
  });

  it("does not corrupt a nested list when typing [ ] in a sub-item", async () => {
    const { getHandle } = await mount({}, "");
    const editor = getHandle().getUnsafeTiptapEditor() as any;
    editor.commands.setContent("<ul><li><p>parent</p><ul><li><p>[ ]</p></li></ul></li></ul>");
    typeFinalSpace(editor);
    await waitFor(() => {
      // The outline must NOT be flattened into multiple sibling lists, and no
      // text is lost.
      expect(topLevelTypes(editor).filter((t) => t === "bulletList").length).toBe(1);
      expect(editor.getText()).toContain("parent");
    });
  });

  it("preserves a top-level bullet that has a sublist (does not eat the marker)", async () => {
    const { getHandle } = await mount({}, "");
    const editor = getHandle().getUnsafeTiptapEditor() as any;
    editor.commands.setContent("<ul><li><p>[ ]</p><ul><li><p>child</p></li></ul></li></ul>");
    typeFinalSpace(editor);
    await waitFor(() => {
      // The child is intact and the marker text was not silently deleted.
      expect(editor.getText()).toContain("child");
      expect(editor.getText()).toContain("[");
    });
  });

  it("marks a [x] checkbox as checked", async () => {
    const { getHandle } = await mount({}, "");
    const editor = getHandle().getUnsafeTiptapEditor() as any;
    editor.commands.setContent("<p>[x]</p>");
    typeFinalSpace(editor);
    await waitFor(() => {
      let checked = false;
      editor.state.doc.descendants((n: any) => {
        if (n.type.name === "taskItem" && n.attrs.checked) checked = true;
      });
      expect(checked).toBe(true);
    });
  });
});

describe("branch gutter — right side + slots", () => {
  it("renders the branch button inside the right-side gutter affordances", async () => {
    const { container } = await mount();
    await waitFor(() => {
      const btn = container.querySelector(".ham-branch-button");
      expect(btn).not.toBeNull();
      // It lives inside the gutter overlay's affordances row (positioned right).
      expect(btn!.closest(".ham-block-gutter-affordances")).not.toBeNull();
      expect(btn!.closest(".ham-block-gutter")).not.toBeNull();
    });
  });

  it("tags branch-child chips with data-ham-branch-child (for connector anchoring)", async () => {
    const { container } = await mount({
      value: {
        kind: "tiptap-json",
        json: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2, dataBlockId: "blk_anchor" },
              content: [{ type: "text", text: "Section" }],
            },
            { type: "paragraph", content: [{ type: "text", text: "body" }] },
          ],
        },
      },
      branchChildren: {
        blk_anchor: [
          { edgeId: "e1", surfaceId: "s_child", order: 0, title: "Child", active: false },
        ],
      },
    });
    await waitFor(() => {
      const chip = container.querySelector(".ham-branch-child-chip");
      expect(chip).not.toBeNull();
      expect(chip!.getAttribute("data-ham-branch-child")).toBe("s_child");
    });
  });

  it("uses a custom BlockBranchButton slot component when provided", async () => {
    const CustomButton = ({ blockId, onBranch }: HamBlockSlotProps) => (
      <button className="my-custom-branch" data-for={blockId} onClick={() => onBranch()}>
        custom
      </button>
    );
    const { container } = await mount({ slots: { BlockBranchButton: CustomButton } });
    await waitFor(() => {
      expect(container.querySelector(".my-custom-branch")).not.toBeNull();
      // the default button is not used when a slot is provided
      expect(container.querySelector(".ham-branch-button")).toBeNull();
    });
  });
});
