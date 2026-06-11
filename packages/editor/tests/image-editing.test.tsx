import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ImagePopover } from "../src/components/ImagePopover";
import type { ImageEditTarget } from "../src/extensions/image-editor";

afterEach(() => cleanup());

function imageTarget(alt: string, title = ""): ImageEditTarget {
  const el = document.createElement("img");
  document.body.append(el);
  return { pos: 3, alt, title, element: el };
}

describe("ImagePopover", () => {
  it("applies edited alt text on Enter", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<ImagePopover open={imageTarget("")} onApply={onApply} onClose={onClose} />);
    const input = document.querySelector<HTMLInputElement>(".hiermark-link-input")!;
    fireEvent.change(input, { target: { value: "A red circle" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith(3, { alt: "A red circle", title: "" });
    expect(onClose).toHaveBeenCalled();
  });

  it("seeds the inputs from the node's current attrs", () => {
    render(
      <ImagePopover
        open={imageTarget("old alt", "old title")}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );
    const inputs = document.querySelectorAll<HTMLInputElement>(".hiermark-link-input");
    expect(inputs[0]!.value).toBe("old alt");
    expect(inputs[1]!.value).toBe("old title");
  });

  it("closes without applying on Escape", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<ImagePopover open={imageTarget("alt")} onApply={onApply} onClose={onClose} />);
    const input = document.querySelector<HTMLInputElement>(".hiermark-link-input")!;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(<ImagePopover open={null} onApply={() => {}} onClose={() => {}} />);
    expect(document.querySelector(".hiermark-image-popover")).toBeNull();
  });
});
