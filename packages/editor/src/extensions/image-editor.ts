import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** What an image click reports so the host can open an alt/title editor. */
export interface ImageEditTarget {
  pos: number;
  alt: string;
  title: string;
  element: HTMLElement;
}

export interface ImageEditorContext {
  onEdit: (target: ImageEditTarget) => void;
}

export interface ImageEditorOptions {
  getContext: () => ImageEditorContext | null;
}

export const imageEditorKey = new PluginKey("hiermarkImageEditor");

/**
 * Opens the host's image editor (alt text — accessibility-critical — + title)
 * when an image is clicked. The popover + `setNodeMarkup` live in `HiermarkEditor`;
 * this only detects the click and reports the node's position + current attrs.
 */
export const ImageEditor = Extension.create<ImageEditorOptions>({
  name: "hiermarkImageEditor",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    return [
      new Plugin({
        key: imageEditorKey,
        props: {
          handleClickOn(view, _pos, node, nodePos, event) {
            const ctx = getContext();
            const imageType = view.state.schema.nodes.image;
            if (!ctx || !imageType || node.type !== imageType) return false;
            const target = event.target as HTMLElement;
            const el = (target.tagName === "IMG" ? target : target.closest("img")) ?? target;
            ctx.onEdit({
              pos: nodePos,
              alt: (node.attrs.alt as string) ?? "",
              title: (node.attrs.title as string) ?? "",
              element: el as HTMLElement,
            });
            return false;
          },
        },
      }),
    ];
  },
});
