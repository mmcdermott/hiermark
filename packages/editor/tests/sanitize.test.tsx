import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HiermarkEditor } from "../src/HiermarkEditor";
import type { HiermarkEditorHandle } from "../src/types";
import { isSafeUri, isSafeImageSrc } from "../src/extensions/sanitize";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(markdown: string, extra: Partial<Parameters<typeof HiermarkEditor>[0]> = {}) {
  let handle: HiermarkEditorHandle | null = null;
  const utils = render(
    <HiermarkEditor
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

  it("blocks control-char-obfuscated schemes (the WHATWG URL-normalization bypass)", () => {
    // Browsers strip tab/CR/LF anywhere in a URL before scheme detection, so
    // these all navigate as javascript:/vbscript: despite not matching a
    // naive contiguous-scheme test.
    for (const bad of [
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      "javascript:alert(1)",
      " \t javascript:alert(1)",
      "vb\tscript:msgbox(1)",
      "data:\ttext/html,<script>alert(1)</script>",
    ]) {
      expect(isSafeUri(bad)).toBe(false);
      expect(isSafeImageSrc(bad)).toBe(false);
    }
  });

  it("is an allowlist: unknown active schemes are rejected, relative forms pass", () => {
    for (const bad of ["tel:+1555", "ftp://host/x", "data:application/pdf;base64,AAAA", "ws://x"]) {
      expect(isSafeUri(bad)).toBe(false);
    }
    for (const ok of ["./rel/page.md", "../up.md", "docs/page.md", "?q=1", "//host/path"]) {
      expect(isSafeUri(ok)).toBe(true);
    }
  });

  it("image policy: inert schemes pass; script-capable schemes and non-image data do not", () => {
    expect(isSafeImageSrc("data:image/svg+xml;base64,AAAA")).toBe(true); // inert in <img>
    expect(isSafeImageSrc("blob:https://x/123")).toBe(true);
    expect(isSafeImageSrc("relative/pic.png")).toBe(true);
    // Custom host schemes (upload handlers returning e.g. stored://) are inert
    // in an <img> src — not a navigation context — and stay allowed.
    expect(isSafeImageSrc("stored://bucket/pic.png")).toBe(true);
    expect(isSafeImageSrc("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeImageSrc("data:application/pdf;base64,AAAA")).toBe(false);
    expect(isSafeImageSrc("file:///etc/passwd")).toBe(false);
    expect(isSafeImageSrc("data\t:image/png;base64,AAAA")).toBe(true); // normalizes to data:image
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

  it("strips an obfuscated javascript: link seeded via tiptap-json (no browser validation path)", async () => {
    // A tiptap-json seed (or a collab update) builds the link mark from raw
    // attrs — no typed-path validation runs, so only the sanitizer stands
    // between this and the exported markdown.
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click me",
              marks: [{ type: "link", attrs: { href: "java\tscript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    let handle: HiermarkEditorHandle | null = null;
    const { container } = render(
      <HiermarkEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "tiptap-json", json }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    await waitFor(() => expect(container.textContent).toContain("click me"));
    // The mark is stripped everywhere: live DOM, exported markdown, and JSON.
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors).toHaveLength(0);
    expect(handle!.getMarkdown()).not.toContain("script:alert");
    expect(JSON.stringify(handle!.getJSON())).not.toContain("script:alert");
  });

  it("strips a tel: link by default but honors a permissive isAllowedLinkHref override", async () => {
    const strict = await mount("Call [us](tel:+15551234567) now.");
    await waitFor(() => expect(strict.container.textContent).toContain("us"));
    expect(strict.container.querySelectorAll("a")).toHaveLength(0);
    cleanup();

    const permissive = await mount("Call [us](tel:+15551234567) now.", {
      isAllowedLinkHref: (href) => href.startsWith("tel:") || isSafeUri(href),
    });
    await waitFor(() => {
      const a = permissive.container.querySelector("a");
      expect(a?.getAttribute("href")).toBe("tel:+15551234567");
    });
  });
});
