import { FloatingPortal, autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
import { useEffect } from "react";
import type { Editor } from "@tiptap/core";

import type { HiermarkAnnotationSuggestion } from "../types";
import type { AnnotationSuggestState } from "./suggest";

export interface SuggestPopoverProps {
  state: AnnotationSuggestState;
  /** Index of the highlighted candidate (host-owned, so keyboard + mouse agree). */
  index: number;
  editor: Editor | null;
  onHover: (index: number) => void;
  onSelect: (item: HiermarkAnnotationSuggestion) => void;
}

/**
 * Presentational type-ahead popover: a Floating-UI list anchored at the trigger
 * position. All state (open, items, highlighted index) is owned by the host
 * (HiermarkEditor) so the keyboard handler the plugin forwards to and the rendered
 * highlight never disagree.
 */
export function SuggestPopover({ state, index, editor, onHover, onSelect }: SuggestPopoverProps) {
  const { refs, floatingStyles } = useFloating({
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const from = state.range?.from;
  useEffect(() => {
    if (!state.active || !editor || from == null) return;
    // Virtual reference tracking the trigger character's caret position.
    refs.setReference({
      getBoundingClientRect: () => {
        try {
          const c = editor.view.coordsAtPos(from);
          return new DOMRect(c.left, c.top, 0, c.bottom - c.top);
        } catch {
          // coordsAtPos can throw transiently (or under jsdom with no layout).
          return new DOMRect(0, 0, 0, 0);
        }
      },
    });
  }, [state.active, from, editor, refs]);

  if (!state.active || state.items.length === 0) return null;
  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="hiermark-suggest-popover"
        role="listbox"
        aria-label="Annotation suggestions"
      >
        {state.items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === index}
            className={"hiermark-suggest-item" + (i === index ? " hiermark-suggest-item-active" : "")}
            onMouseEnter={() => onHover(i)}
            // mousedown (not click) + preventDefault so the editor keeps focus
            // and the selection/range is still valid when we insert.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className="hiermark-suggest-label">{item.label}</span>
            {item.detail ? <span className="hiermark-suggest-detail">{item.detail}</span> : null}
          </button>
        ))}
      </div>
    </FloatingPortal>
  );
}
