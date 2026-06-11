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
import { useEffect, useRef, useState } from "react";

export interface OpenMath {
  pos: number;
  latex: string;
  kind: "inline" | "block";
  /** The live math element, so the popover tracks scroll/layout shifts. */
  element: HTMLElement;
}

export interface MathPopoverProps {
  open: OpenMath | null;
  /** Write the edited LaTeX back to the node at `pos`. */
  onCommit: (pos: number, latex: string) => void;
  /** Remove the math node at `pos`. */
  onDelete: (pos: number) => void;
  onClose: () => void;
  /** Called when a keyboard cancel should hand focus back to the editor. */
  onRequestEditorFocus?: () => void;
}

/**
 * A small editor for the LaTeX behind a math node, opened by clicking the node.
 * Enter / outside-click commit; Escape cancels; a Delete button removes the
 * node. Anchored with Floating-UI so it tracks scroll.
 */
export function MathPopover({
  open,
  onCommit,
  onDelete,
  onClose,
  onRequestEditorFocus,
}: MathPopoverProps) {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  valueRef.current = value;
  // True while committing/canceling, so the dismiss handler doesn't double-fire.
  const closingRef = useRef(false);

  const {
    refs,
    floatingStyles,
    context: floatingContext,
  } = useFloating({
    open: !!open,
    onOpenChange: (next) => {
      if (next || closingRef.current) return;
      // Outside-click commits (treat like blur), then closes.
      if (open) onCommit(open.pos, valueRef.current);
      onClose();
    },
    placement: open?.kind === "block" ? "bottom" : "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  // Escape is handled manually (as cancel), so disable the dismiss escape key.
  const dismiss = useDismiss(floatingContext, { escapeKey: false });
  const role = useRole(floatingContext, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    setValue(open.latex);
    refs.setReference(open.element);
  }, [open, refs]);

  if (!open) return null;

  const commit = () => {
    closingRef.current = true;
    onCommit(open.pos, valueRef.current);
    onClose();
  };
  const cancel = () => {
    closingRef.current = true;
    onClose();
    // Escape must not strand keyboard focus on <body>.
    onRequestEditorFocus?.();
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="hiermark-math-popover"
        {...getFloatingProps()}
      >
        <textarea
          className="hiermark-math-input"
          aria-label="Edit LaTeX"
          placeholder="LaTeX…"
          autoFocus
          rows={open.kind === "block" ? 3 : 1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <div className="hiermark-math-popover-actions">
          <span className="hiermark-math-hint">Enter to save · Esc to cancel</span>
          <button
            type="button"
            className="hiermark-math-btn hiermark-math-del"
            // Keep the textarea's value from committing on blur before this fires.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              closingRef.current = true;
              onDelete(open.pos);
              onClose();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </FloatingPortal>
  );
}
