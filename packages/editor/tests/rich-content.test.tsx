import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorHandle, HamImageUploadHandler } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(markdown: string, extra: Partial<Parameters<typeof HamEditor>[0]> = {}) {
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

describe("code blocks (lowlight + chrome)", () => {
  const PY = "```python\ndef f(x):\n    return x + 1\n```\n";

  it("syntax-highlights a fenced block and keeps the language on round-trip", async () => {
    const { container, getHandle } = await mount(PY);
    await waitFor(() => {
      expect(container.querySelector(".ham-code-block code [class^='hljs-']")).not.toBeNull();
    });
    // The language picker reflects the fence language and the wrapper carries the
    // block id (so the canvas connectors can still anchor a code block).
    expect((container.querySelector(".ham-code-lang") as HTMLSelectElement).value).toBe("python");
    expect(container.querySelector(".ham-code-block")?.getAttribute("data-block-id")).toMatch(
      /^blk_/,
    );
    expect(getHandle().getMarkdown()).toContain("```python");
  });

  it("copies the code text to the clipboard via the copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = await mount(PY);
    const btn = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(".ham-code-copy");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(btn);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]![0]).toContain("return x + 1");
    await waitFor(() => expect(btn.textContent).toBe("Copied!"));
  });

  it("changing the language picker rewrites the fence", async () => {
    const { container, getHandle } = await mount(PY);
    const select = await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>(".ham-code-lang");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(select, { target: { value: "rust" } });
    await waitFor(() => expect(getHandle().getMarkdown()).toContain("```rust"));
  });
});

describe("images / figures", () => {
  it("round-trips an inline image through markdown", async () => {
    const { container, getHandle } = await mount("See ![a cat](https://x/cat.png) here.\n");
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("src")).toBe("https://x/cat.png");
    expect(getHandle().getMarkdown()).toContain("![a cat](https://x/cat.png)");
  });

  it("uploadImages() routes files through the host handler and inserts the result", async () => {
    const upload: HamImageUploadHandler = vi.fn(async (file) => ({
      src: `stored://bucket/${file.name}`,
      alt: "figure 1",
    }));
    const { container, getHandle } = await mount("Body. ", { onImageUpload: upload });
    (getHandle().getUnsafeTiptapEditor() as Editor).chain().focus("end").run();

    const file = new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" });
    await getHandle().uploadImages([file]);

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect((upload as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ surfaceId: "s1" });
    expect(container.querySelector("img")!.getAttribute("src")).toBe("stored://bucket/pic.png");
    expect(getHandle().getMarkdown()).toContain("![figure 1](stored://bucket/pic.png)");
  });

  it("reports an upload rejection through onImageUploadError and inserts nothing", async () => {
    const error = new Error("413 too large");
    const upload: HamImageUploadHandler = vi.fn(async () => {
      throw error;
    });
    const onImageUploadError = vi.fn();
    const { container, getHandle } = await mount("Body. ", {
      onImageUpload: upload,
      onImageUploadError,
    });
    const file = new File([new Uint8Array([1])], "big.png", { type: "image/png" });
    await getHandle().uploadImages([file]);
    await waitFor(() => expect(onImageUploadError).toHaveBeenCalledOnce());
    expect(onImageUploadError.mock.calls[0]![0]).toBe(error);
    expect(container.querySelector("img")).toBeNull();
  });

  it("does nothing on uploadImages when no handler is configured", async () => {
    const { container, getHandle } = await mount("Body. ");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await getHandle().uploadImages([file]);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("math (inline + display, error-tolerant)", () => {
  it("renders inline and block math from markdown and round-trips", async () => {
    const { container, getHandle } = await mount(
      "Inline $E = mc^2$ and a block:\n\n$$\\sum_{i=1}^n x_i$$\n\nEnd.\n",
    );
    await waitFor(() => {
      expect(container.querySelector('[data-type="inline-math"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-type="block-math"]')).not.toBeNull();
    const md = getHandle().getMarkdown();
    expect(md).toContain("$E = mc^2$");
    expect(md).toContain("\\sum_{i=1}^n x_i");
  });

  it("renders malformed LaTeX as an error token instead of throwing", async () => {
    const { container } = await mount("Bad $\\frac{1}{$ and good $a+b$.");
    // Both become inline-math nodes; the malformed one renders KaTeX's error span.
    await waitFor(() => {
      expect(container.querySelectorAll('[data-type="inline-math"]').length).toBe(2);
    });
    expect(container.querySelector(".katex-error")).not.toBeNull();
  });
});
