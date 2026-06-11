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

import type { LinkEditTarget } from "../extensions/link-editor";

export interface LinkPopoverProps {
  open: LinkEditTarget | null;
  onApply: (from: number, to: number, href: string) => void;
  onRemove: (from: number, to: number) => void;
  onClose: () => void;
  /**
   * Policy gate for the "Open" anchor — a stored href that fails it renders no
   * navigation affordance (the sanitizer strips such links from the doc, but
   * the popover must not offer to navigate one mid-strip either).
   */
  isAllowedHref?: (href: string) => boolean;
  /** Called when a keyboard cancel should hand focus back to the editor. */
  onRequestEditorFocus?: () => void;
}

/**
 * Edit the link over a range: type/Enter applies `setLink`, Remove clears it,
 * Open follows it. Anchored with Floating-UI to the clicked `<a>` (or selection).
 */
export function LinkPopover({
  open,
  onApply,
  onRemove,
  onClose,
  isAllowedHref,
  onRequestEditorFocus,
}: LinkPopoverProps) {
  const [href, setHref] = useState("");

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
    setHref(open.href);
    refs.setReference(open.element);
  }, [open, refs]);

  if (!open) return null;
  const apply = () => {
    const trimmed = href.trim();
    if (trimmed) onApply(open.from, open.to, trimmed);
    else onRemove(open.from, open.to);
    onClose();
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="hiermark-link-popover"
        {...getFloatingProps()}
      >
        <input
          className="hiermark-link-input"
          type="url"
          inputMode="url"
          placeholder="https://…"
          aria-label="Link URL"
          autoFocus
          value={href}
          onChange={(e) => setHref(e.target.value)}
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
        <div className="hiermark-link-actions">
          <button
            type="button"
            className="hiermark-link-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={apply}
          >
            Apply
          </button>
          {open.href && (isAllowedHref?.(open.href) ?? true) && (
            <a
              className="hiermark-link-btn"
              href={open.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open
            </a>
          )}
          {open.href && (
            <button
              type="button"
              className="hiermark-link-btn hiermark-link-remove"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onRemove(open.from, open.to);
                onClose();
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
