import { FloatingPortal, autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
import { useEffect, useState } from "react";
import { isTextSelection, type Editor } from "@tiptap/core";

export interface BubbleToolbarProps {
  editor: Editor | null;
  /** Show the toolbar on text selection. Default true; set false to disable. */
  enabled?: boolean;
}

interface MarkButton {
  name: string;
  label: string;
  title: string;
  run: (editor: Editor) => void;
  active: (editor: Editor) => boolean;
}

// Plain formatting only — link/image have their own click popovers, and these
// toggles are no-ops inside a code block (handled by hiding the toolbar there).
const BUTTONS: MarkButton[] = [
  {
    name: "bold",
    label: "B",
    title: "Bold (⌘B)",
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    name: "italic",
    label: "I",
    title: "Italic (⌘I)",
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  {
    name: "strike",
    label: "S",
    title: "Strikethrough",
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive("strike"),
  },
  {
    name: "code",
    label: "</>",
    title: "Inline code",
    run: (e) => e.chain().focus().toggleCode().run(),
    active: (e) => e.isActive("code"),
  },
];

/**
 * A floating formatting toolbar shown over a non-empty text selection (bold /
 * italic / strikethrough / inline code). Anchored to the selection rect via a
 * Floating-UI virtual element; mirrors the link/math popover styling. Hidden in
 * code blocks (marks don't apply) and whenever the editor isn't editable.
 */
export function BubbleToolbar({ editor, enabled = true }: BubbleToolbarProps) {
  const [open, setOpen] = useState(false);
  // Bumped on every editor transaction so active states re-render live.
  const [, setTick] = useState(0);

  const { refs, floatingStyles } = useFloating({
    open,
    placement: "top",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!editor || !enabled) {
      setOpen(false);
      return;
    }
    const update = () => {
      setTick((t) => t + 1);
      const { state, view } = editor;
      const { from, to, empty } = state.selection;
      // isTextSelection (not constructor.name) — minifiers rename classes in
      // production bundles, which silently made this always-false.
      const isText = isTextSelection(state.selection);
      const show =
        editor.isEditable && !empty && isText && !editor.isActive("codeBlock") && view.hasFocus();
      if (!show) {
        setOpen(false);
        return;
      }
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      const left = Math.min(start.left, end.left);
      const right = Math.max(start.right, end.right);
      refs.setReference({
        getBoundingClientRect: () => ({
          x: left,
          y: top,
          top,
          left,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        }),
      });
      setOpen(true);
    };
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("blur", update);
    editor.on("focus", update);
    update();
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("blur", update);
      editor.off("focus", update);
    };
  }, [editor, enabled, refs]);

  if (!open || !editor) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="hiermark-bubble-toolbar"
        role="toolbar"
        aria-label="Text formatting"
        // Don't let clicking the toolbar collapse the selection.
        onMouseDown={(e) => e.preventDefault()}
      >
        {BUTTONS.map((b) => (
          <button
            key={b.name}
            type="button"
            className={"hiermark-bubble-btn" + (b.active(editor) ? " hiermark-bubble-btn-active" : "")}
            data-mark={b.name}
            title={b.title}
            aria-label={b.title}
            aria-pressed={b.active(editor)}
            onClick={() => b.run(editor)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </FloatingPortal>
  );
}
