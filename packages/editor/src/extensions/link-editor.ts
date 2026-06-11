import { Extension, getMarkRange } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** What a link interaction reports so the host can open an edit popover. */
export interface LinkEditTarget {
  /** Document range the link covers (or the selection, for a fresh link). */
  from: number;
  to: number;
  /** Current href, or "" when creating a link over a selection. */
  href: string;
  /** A DOM element to anchor the popover to (the `<a>` or the selection node). */
  element: HTMLElement;
}

export interface LinkEditorContext {
  onEdit: (target: LinkEditTarget) => void;
}

export interface LinkEditorOptions {
  getContext: () => LinkEditorContext | null;
}

export const linkEditorKey = new PluginKey("hiermarkLinkEditor");

/**
 * Wires link editing UX: clicking a link opens the host's edit popover anchored
 * to it, and `Mod-k` over a selection opens it to create/edit a link. The actual
 * popover + `setLink`/`unsetLink` live in `HiermarkEditor`; this extension only
 * detects the interaction and resolves the link's range + DOM anchor.
 */
export const LinkEditor = Extension.create<LinkEditorOptions>({
  name: "hiermarkLinkEditor",

  addOptions() {
    return { getContext: () => null };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        const ctx = this.options.getContext();
        const { state, view } = this.editor;
        const { from, to, empty } = state.selection;
        if (empty || !ctx) return false;
        const linkType = state.schema.marks.link;
        const href =
          (linkType &&
            state.doc.rangeHasMark(from, to, linkType) &&
            (state.selection.$from.marks().find((m) => m.type === linkType)?.attrs
              .href as string)) ||
          "";
        const node = view.domAtPos(from).node;
        const element = (node instanceof HTMLElement ? node : node.parentElement) ?? view.dom;
        ctx.onEdit({ from, to, href, element });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    return [
      new Plugin({
        key: linkEditorKey,
        props: {
          handleClickOn(view, _pos, _node, _nodePos, event) {
            const ctx = getContext();
            const linkType = view.state.schema.marks.link;
            if (!ctx || !linkType) return false;
            const $pos = view.state.selection.$from;
            const range = getMarkRange($pos, linkType);
            if (!range) return false;
            const mark = $pos.marks().find((m) => m.type === linkType);
            const target = event.target as HTMLElement;
            const element = target.closest("a") ?? target;
            ctx.onEdit({
              from: range.from,
              to: range.to,
              href: (mark?.attrs.href as string) ?? "",
              element: element as HTMLElement,
            });
            return false; // don't swallow the click (selection still updates)
          },
        },
      }),
    ];
  },
});
