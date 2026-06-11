import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { LinkPopover } from "../src/components/LinkPopover";
import type { LinkEditTarget } from "../src/extensions/link-editor";

afterEach(() => cleanup());

function anchorTarget(href: string): LinkEditTarget {
  const el = document.createElement("a");
  document.body.append(el);
  return { from: 1, to: 5, href, element: el };
}

describe("LinkPopover", () => {
  it("applies the typed href on Enter", () => {
    const onApply = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();
    render(
      <LinkPopover
        open={anchorTarget("")}
        onApply={onApply}
        onRemove={onRemove}
        onClose={onClose}
      />,
    );
    const input = document.querySelector<HTMLInputElement>(".hiermark-link-input")!;
    fireEvent.change(input, { target: { value: "https://example.com/x" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith(1, 5, "https://example.com/x");
    expect(onClose).toHaveBeenCalled();
  });

  it("removes the link when applied with an empty href", () => {
    const onApply = vi.fn();
    const onRemove = vi.fn();
    render(
      <LinkPopover
        open={anchorTarget("https://x.com")}
        onApply={onApply}
        onRemove={onRemove}
        onClose={() => {}}
      />,
    );
    const input = document.querySelector<HTMLInputElement>(".hiermark-link-input")!;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRemove).toHaveBeenCalledWith(1, 5);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("shows Open + Remove only for an existing link, and Remove fires onRemove", () => {
    const onRemove = vi.fn();
    render(
      <LinkPopover
        open={anchorTarget("https://x.com")}
        onApply={() => {}}
        onRemove={onRemove}
        onClose={() => {}}
      />,
    );
    const removeBtn = document.querySelector<HTMLButtonElement>(".hiermark-link-remove")!;
    expect(removeBtn).not.toBeNull();
    expect(document.querySelector("a.hiermark-link-btn")?.getAttribute("href")).toBe("https://x.com");
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith(1, 5);
  });

  it("renders nothing when closed", () => {
    render(<LinkPopover open={null} onApply={() => {}} onRemove={() => {}} onClose={() => {}} />);
    expect(document.querySelector(".hiermark-link-popover")).toBeNull();
  });
});
