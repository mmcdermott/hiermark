import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorHandle } from "../src/types";
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

  it("opens an @-search popover and inserts the chosen reference", async () => {
    let handle: HamEditorHandle | null = null;
    const { container } = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "Cite here: " }}
        annotations={createExampleAnnotationRegistry()}
        annotationContext={{
          references: {
            vaswani2017: { title: "Attention Is All You Need", year: 2017 },
            eq2024: { title: "EQ forecasting on eICU", year: 2024 },
          },
          people: { alice: { name: "Alice Researcher" } },
        }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    const editor = handle!.getUnsafeTiptapEditor() as Editor;
    editor.chain().focus("end").insertContent("@vas").run();

    // The type-ahead opens with the matching reference. The popover is rendered
    // through a Floating-UI portal (document.body), not inside `container`.
    let popover: HTMLElement | null = null;
    await waitFor(() => {
      popover = document.querySelector<HTMLElement>(".ham-suggest-popover");
      expect(popover).not.toBeNull();
      expect(popover!.textContent).toContain("vaswani2017");
    });

    // Enter commits the highlighted candidate, replacing "@vas" with the token.
    const pm = container.querySelector<HTMLElement>(".ham-editor .ProseMirror")!;
    fireEvent.keyDown(pm, { key: "Enter" });
    await waitFor(() => expect(editor.getText()).toContain("@vaswani2017"));
    expect(editor.getText()).not.toContain("@vas ");
    // ...and the popover closes once the query no longer matches a trigger.
    await waitFor(() => expect(document.querySelector(".ham-suggest-popover")).toBeNull());
  });

  // Shared mount for the type-ahead edge-case tests.
  async function mountSearch(initial = "") {
    let handle: HamEditorHandle | null = null;
    const utils = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: initial }}
        annotations={createExampleAnnotationRegistry()}
        annotationContext={{
          references: { vaswani2017: { title: "Attention Is All You Need", year: 2017 } },
          people: { alice: { name: "Alice Researcher" } },
        }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    return { ...utils, editor: handle!.getUnsafeTiptapEditor() as Editor };
  }

  it("does not open @-search inside an email-like token", async () => {
    const { editor } = await mountSearch();
    // "@vas" alone would match vaswani2017, but here `@` is preceded by a letter.
    editor.chain().focus("end").insertContent("ab@vas").run();
    await new Promise((r) => setTimeout(r, 60));
    expect(document.querySelector(".ham-suggest-popover")).toBeNull();
  });

  it("renders a custom SuggestPopover slot in place of the default", async () => {
    let handle: HamEditorHandle | null = null;
    const { container } = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "" }}
        annotations={createExampleAnnotationRegistry()}
        annotationContext={{
          references: { vaswani2017: { title: "Attention Is All You Need", year: 2017 } },
        }}
        slots={{
          SuggestPopover: ({ state }) =>
            state.active ? (
              <div className="my-suggest">custom: {state.items.map((i) => i.label).join(",")}</div>
            ) : null,
        }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    (handle!.getUnsafeTiptapEditor() as Editor).chain().focus("end").insertContent("@vas").run();
    await waitFor(() => {
      const el = container.querySelector(".my-suggest");
      expect(el).not.toBeNull();
      expect(el!.textContent).toContain("vaswani2017");
    });
    // The default popover is not rendered when a slot is supplied.
    expect(document.querySelector(".ham-suggest-popover")).toBeNull();
  });

  it("Escape dismisses the @-search popover", async () => {
    const { container, editor } = await mountSearch("Ref: ");
    editor.chain().focus("end").insertContent("@vas").run();
    await waitFor(() => expect(document.querySelector(".ham-suggest-popover")).not.toBeNull());

    const pm = container.querySelector<HTMLElement>(".ham-editor .ProseMirror")!;
    fireEvent.keyDown(pm, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".ham-suggest-popover")).toBeNull());
    // The text is untouched (dismiss ≠ delete).
    expect(editor.getText()).toContain("@vas");
  });
});
