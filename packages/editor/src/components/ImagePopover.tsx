import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useEffect, useState } from "react";

import type { ImageEditTarget } from "../extensions/image-editor";

export interface ImagePopoverProps {
  open: ImageEditTarget | null;
  /** Write edited alt / title back to the image node at `pos`. */
  onApply: (pos: number, attrs: { alt: string; title: string }) => void;
  onClose: () => void;
  /** Called when a keyboard cancel should hand focus back to the editor. */
  onRequestEditorFocus?: () => void;
}

/** Edit an image's alt text (a11y) + title. Anchored to the clicked `<img>`. */
export function ImagePopover({ open, onApply, onClose, onRequestEditorFocus }: ImagePopoverProps) {
  const [alt, setAlt] = useState("");
  const [title, setTitle] = useState("");

  const {
    refs,
    floatingStyles,
    context: floatingContext,
  } = useFloating({
    open: !!open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(floatingContext);
  const role = useRole(floatingContext, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  useEffect(() => {
    if (!open) return;
    setAlt(open.alt);
    setTitle(open.title);
    refs.setReference(open.element);
  }, [open, refs]);

  if (!open) return null;
  const apply = () => {
    onApply(open.pos, { alt: alt.trim(), title: title.trim() });
    onClose();
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="ham-link-popover ham-image-popover"
        {...getFloatingProps()}
      >
        <label className="ham-image-field">
          <span>Alt text</span>
          <input
            className="ham-link-input"
            aria-label="Image alt text"
            placeholder="Describe the image…"
            autoFocus
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                // Escape must not strand keyboard focus on <body>.
                onRequestEditorFocus?.();
              }
            }}
          />
        </label>
        <label className="ham-image-field">
          <span>Title</span>
          <input
            className="ham-link-input"
            aria-label="Image title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
          />
        </label>
        <div className="ham-link-actions">
          <button
            type="button"
            className="ham-link-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </FloatingPortal>
  );
}
