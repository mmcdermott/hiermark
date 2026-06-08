import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";

import { BlockId } from "./block-id";
import { HamCodeBlock } from "./code-block";
import { ImageUpload, type ImageUploadContext } from "./image-upload";
import { TaskInputRules } from "./task-input-rules";
import type { HamCollaborationProvider, HamCollaborationUser } from "../types";

export interface HamCollabBinding {
  /** The shared Yjs document (typed loosely to avoid a hard yjs type here). */
  ydoc: unknown;
  provider?: HamCollaborationProvider;
  user?: HamCollaborationUser;
}

export interface HamEditorExtensionOptions {
  /** Placeholder text shown in an empty editor. */
  placeholder?: string;
  /**
   * Disable StarterKit's built-in undo/redo history. Required when collaboration
   * is enabled (Yjs owns history); harmless otherwise. Implied by `collab`.
   */
  collaboration?: boolean;
  /** Bind the editor to a shared Y.Doc (adds Collaboration + caret extensions). */
  collab?: HamCollabBinding;
  /** Node types that receive a stable block id. */
  blockIdTypes?: string[];
  /** Render `$…$` / `$$…$$` math with KaTeX. Default true. */
  math?: boolean;
  /**
   * Wire image paste / drop / picker uploads to a host handler. When omitted,
   * the image node still renders/round-trips but no upload path is installed.
   */
  imageUpload?: { getContext: () => ImageUploadContext | null };
}

/**
 * Build the standard HAM editor extension set: StarterKit, task lists,
 * placeholder, official Markdown import/export, optional math, and the stable
 * block-id extension.
 */
export function createHamEditorExtensions(opts: HamEditorExtensionOptions = {}): Extensions {
  const { placeholder = "Write…", blockIdTypes, math = true, collab, imageUpload } = opts;
  const collaboration = opts.collaboration || !!collab;

  const extensions: Extensions = [
    StarterKit.configure({
      // Replaced by HamCodeBlock (lowlight highlighting + copy button).
      codeBlock: false,
      // Yjs provides collaborative history; StarterKit's would conflict.
      ...(collaboration ? { undoRedo: false } : {}),
    }),
    HamCodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    TaskInputRules,
    // GFM tables (the snapshot already treats `table` as an opaque leaf block).
    TableKit.configure({ table: { resizable: true } }),
    // Inline image node — matches marked's inline `![alt](src)` token (so it
    // round-trips inside a paragraph) and accepts data URIs for object-URL/base64
    // hosts. Uploads are wired separately via ImageUpload.
    Image.configure({ inline: true, allowBase64: true }),
    Placeholder.configure({ placeholder }),
    Markdown,
    BlockId.configure(blockIdTypes ? { types: blockIdTypes } : {}),
  ];

  if (imageUpload) {
    extensions.push(ImageUpload.configure({ getContext: imageUpload.getContext }));
  }

  if (math) {
    // throwOnError:false → a malformed `$\frac$` renders as a red error token
    // instead of crashing the editor.
    extensions.push(Mathematics.configure({ katexOptions: { throwOnError: false } }));
  }

  if (collab) {
    extensions.push(Collaboration.configure({ document: collab.ydoc as any }));
    if (collab.provider?.awareness) {
      extensions.push(
        CollaborationCaret.configure({
          provider: collab.provider as any,
          ...(collab.user ? { user: collab.user } : {}),
        }),
      );
    }
  }

  return extensions;
}
