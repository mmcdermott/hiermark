import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamEditor } from "../src/HamEditor";

expect.extend(axeMatchers);

declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

// jsdom can't compute layout, so color-contrast is not assertable here.
const axeOpts = { rules: { "color-contrast": { enabled: false } } };

describe("editor a11y (axe)", () => {
  it("a populated editor surface has no axe violations", async () => {
    const { container } = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{
          kind: "markdown",
          markdown:
            "# Title\n\nSome **bold** text and a [link](https://example.com).\n\n- [ ] a task\n- [x] done\n\n```ts\nconst x = 1;\n```\n",
        }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());
    const results = await axe(container, axeOpts);
    expect(results).toHaveNoViolations();
  });
});
