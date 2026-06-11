import { Extension } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import type { HiermarkImageUploadHandler, HiermarkUploadedImage } from "../types";

export interface ImageUploadContext {
  /** Host-provided upload: decides where bytes are stored, returns the `src`. */
  upload: HiermarkImageUploadHandler | null;
  /** Surface the upload belongs to (passed through to the handler). */
  surfaceId: string;
  /** Reports an upload rejection so the host can toast/log it. */
  onError?: ((error: unknown, file: File) => void) | undefined;
}

export interface ImageUploadOptions {
  getContext: () => ImageUploadContext | null;
}

export const imageUploadKey = new PluginKey("hiermarkImageUpload");

/** Files whose type is an image (drag-drop / paste / file picker all funnel here). */
function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}

/**
 * Insert each file as an image node at `pos`, awaiting the host upload for the
 * real `src`. Sequential so multiple drops keep their order; a rejected upload
 * is reported via `onError` and skipped (no broken node is inserted).
 */
async function insertUploads(
  view: EditorView,
  ctx: ImageUploadContext,
  files: File[],
  pos: number,
): Promise<void> {
  if (!ctx.upload) return;
  let at = pos;
  for (const file of files) {
    let uploaded: HiermarkUploadedImage | null;
    try {
      uploaded = await ctx.upload(file, { surfaceId: ctx.surfaceId });
    } catch (error) {
      ctx.onError?.(error, file);
      continue;
    }
    if (!uploaded) continue;
    const imageType = view.state.schema.nodes.image;
    if (!imageType) return;
    const node = imageType.create({
      src: uploaded.src,
      ...(uploaded.alt ? { alt: uploaded.alt } : { alt: file.name }),
      ...(uploaded.title ? { title: uploaded.title } : {}),
      ...(uploaded.width ? { width: uploaded.width } : {}),
      ...(uploaded.height ? { height: uploaded.height } : {}),
    });
    // Re-clamp against the *current* doc — earlier inserts/edits may have shifted
    // positions while this upload was in flight.
    const safePos = Math.min(at, view.state.doc.content.size);
    const tr = view.state.tr.insert(safePos, node);
    view.dispatch(tr);
    at = safePos + node.nodeSize;
  }
}

/**
 * Routes image bytes from paste, drag-drop, and the programmatic picker through
 * a host {@link HiermarkImageUploadHandler}, so the editor never decides how images
 * are stored — the host returns a `src` (an uploaded URL, an object URL, a
 * base64 data URI, …) and the editor inserts a standard image node (which
 * round-trips to `![alt](src)` markdown).
 */
export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: "hiermarkImageUpload",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    return [
      new Plugin({
        key: imageUploadKey,
        props: {
          handlePaste(view, event) {
            const ctx = getContext();
            if (!ctx?.upload) return false;
            const files = imageFilesFrom(event.clipboardData?.files);
            if (!files.length) return false;
            event.preventDefault();
            void insertUploads(view, ctx, files, view.state.selection.from);
            return true;
          },
          handleDrop(view, event) {
            const ctx = getContext();
            if (!ctx?.upload) return false;
            const dt = (event as DragEvent).dataTransfer;
            const files = imageFilesFrom(dt?.files);
            if (!files.length) return false;
            event.preventDefault();
            const coords = {
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            };
            const at = view.posAtCoords(coords)?.pos ?? view.state.selection.from;
            void insertUploads(view, ctx, files, at);
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * Programmatic entry point for a host "insert image" button: upload `files`
 * through the editor's configured handler and insert them at the cursor. Shares
 * the exact path used by paste/drop.
 */
export function uploadHiermarkImages(
  view: EditorView,
  ctx: ImageUploadContext,
  files: FileList | File[],
): Promise<void> {
  return insertUploads(view, ctx, imageFilesFrom(files), view.state.selection.from);
}
