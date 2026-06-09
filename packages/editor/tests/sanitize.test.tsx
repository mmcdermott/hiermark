import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorHandle } from "../src/types";
import { isSafeUri, isSafeImageSrc } from "../src/extensions/sanitize";

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

describe("isSafeUri / isSafeImageSrc", () => {
  it("blocks script-bearing schemes, allows normal ones", () => {
    for (const bad of [
      "javascript:alert(1)",
      "  JavaScript:alert(1)",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      expect(isSafeUri(bad)).toBe(false);
    }
    for (const ok of ["https://x.com", "http://x.com", "mailto:a@b.c", "/rel", "#anchor", ""]) {
      expect(isSafeUri(ok)).toBe(true);
    }
    // data:image/* is fine for images.
    expect(isSafeImageSrc("data:image/png;base64,AAAA")).toBe(true);
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
  });
});

describe("Sanitize extension (defense-in-depth over markdown parse)", () => {
  it("strips a javascript: link href loaded from markdown but keeps the text", async () => {
    const { container } = await mount("Click [here](javascript:alert(1)) now.");
    await waitFor(() => {
      // The text survives; no dangerous anchor href is present.
      expect(container.textContent).toContain("here");
    });
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.some((a) => /javascript:/i.test(a.getAttribute("href") ?? ""))).toBe(false);
  });

  it("keeps a safe https link", async () => {
    const { container } = await mount("See [docs](https://example.com/x).");
    await waitFor(() => {
      const a = container.querySelector("a");
      expect(a?.getAttribute("href")).toBe("https://example.com/x");
    });
  });

  it("removes an image with a dangerous src", async () => {
    const { container } = await mount("Pic ![x](javascript:alert(1)) here.");
    await waitFor(() => expect(container.textContent).toContain("Pic"));
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.some((i) => /javascript:/i.test(i.getAttribute("src") ?? ""))).toBe(false);
  });

  it("honors a custom isAllowedImageSrc policy", async () => {
    const { container } = await mount("Pic ![x](https://evil.test/a.png) here.", {
      isAllowedImageSrc: (src) => !src.includes("evil.test"),
    });
    await waitFor(() => expect(container.textContent).toContain("Pic"));
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.some((i) => (i.getAttribute("src") ?? "").includes("evil.test"))).toBe(false);
  });
});
