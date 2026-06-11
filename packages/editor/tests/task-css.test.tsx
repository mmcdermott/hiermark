import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { HiermarkEditor } from "../src/HiermarkEditor";

// Load the package's real stylesheet (minus the katex @import jsdom can't fetch)
// so we verify the actual selectors against the actual rendered DOM. Vitest runs
// with cwd at the package root.
const css = fs
  .readFileSync(path.resolve(process.cwd(), "src/styles.css"), "utf8")
  .replace(/@import[^;]+;/g, "");

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  const style = document.createElement("style");
  style.id = "hiermark-editor-css";
  style.textContent = css;
  document.head.appendChild(style);
});

describe("task list CSS", () => {
  it("lays each task item out as a flex row (checkbox inline with text)", async () => {
    let ready = false;
    const { container } = render(
      <HiermarkEditor
        surfaceId="s"
        rootBlockId="r"
        value={{ kind: "markdown", markdown: "- [ ] alpha\n- [x] beta" }}
        onReady={() => {
          ready = true;
        }}
      />,
    );
    await waitFor(() => expect(ready).toBe(true));

    const li = container.querySelector<HTMLElement>('ul[data-type="taskList"] > li');
    expect(li).not.toBeNull();
    // The fix: the <li> is a flex row so the checkbox <label> and content <div>
    // sit side by side instead of stacking.
    expect(getComputedStyle(li!).display).toBe("flex");

    const label = li!.querySelector<HTMLElement>(":scope > label");
    const contentDiv = li!.querySelector<HTMLElement>(":scope > div");
    expect(label).not.toBeNull();
    expect(contentDiv).not.toBeNull();
  });

  it("strikes through a checked item's own text but not its nested children", async () => {
    let ready = false;
    const { container } = render(
      <HiermarkEditor
        surfaceId="s"
        rootBlockId="r"
        value={{ kind: "markdown", markdown: "- [x] parent\n  - [ ] child" }}
        onReady={() => {
          ready = true;
        }}
      />,
    );
    await waitFor(() => expect(ready).toBe(true));

    const parentLi = container.querySelector<HTMLElement>(
      'ul[data-type="taskList"] > li[data-checked="true"]',
    );
    expect(parentLi).not.toBeNull();
    const parentP = parentLi!.querySelector<HTMLElement>(":scope > div > p");
    const childP = parentLi!.querySelector<HTMLElement>(
      ':scope > div ul[data-type="taskList"] > li > div > p',
    );
    expect(parentP).not.toBeNull();
    expect(childP).not.toBeNull();
    expect(getComputedStyle(parentP!).textDecoration).toContain("line-through");
    expect(getComputedStyle(childP!).textDecoration).not.toContain("line-through");
  });
});
