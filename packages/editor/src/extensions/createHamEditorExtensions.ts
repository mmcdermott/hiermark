import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";

import { BlockId } from "./block-id";
import { HamCodeBlock } from "./code-block";
import { HamBlockMath, HamInlineMath, type HamMathClick } from "./math";
import { ImageUpload, type ImageUploadContext } from "./image-upload";
import { ImageEditor, type ImageEditorContext } from "./image-editor";
import { LinkEditor, type LinkEditorContext } from "./link-editor";
import { Sanitize, isSafeUri } from "./sanitize";
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
  /** Fired when an editable math node is clicked (drives the LaTeX edit popover). */
  onMathClick?: (info: HamMathClick) => void;
  /**
   * Wire image paste / drop / picker uploads to a host handler. When omitted,
   * the image node still renders/round-trips but no upload path is installed.
   */
  imageUpload?: { getContext: () => ImageUploadContext | null };
  /**
   * Image-`src` policy for the sanitizer (defaults to blocking
   * javascript:/vbscript:/file:/data:text/html; `data:image/*` stays allowed).
   */
  isAllowedImageSrc?: (src: string) => boolean;
  /** Wire link click / Mod-k to a host edit popover. */
  linkEditor?: { getContext: () => LinkEditorContext | null };
  /** Wire image click to a host alt-text / title edit popover. */
  imageEditor?: { getContext: () => ImageEditorContext | null };
}

/**
 * Build the standard HAM editor extension set: StarterKit, task lists,
 * placeholder, official Markdown import/export, optional math, and the stable
 * block-id extension.
 */
export function createHamEditorExtensions(opts: HamEditorExtensionOptions = {}): Extensions {
  const {
    placeholder = "Write…",
    blockIdTypes,
    math = true,
    collab,
    imageUpload,
    onMathClick,
    isAllowedImageSrc,
    linkEditor,
    imageEditor,
  } = opts;
  const collaboration = opts.collaboration || !!collab;

  const extensions: Extensions = [
    StarterKit.configure({
      // Replaced by HamCodeBlock (lowlight highlighting + copy button).
      codeBlock: false,
      // Restrict link schemes (stored-XSS): no javascript:/data: etc., and open
      // external links safely. The Sanitize extension below is the catch-all.
      link: {
        protocols: ["http", "https", "mailto"],
        defaultProtocol: "https",
        openOnClick: false, // clicking opens the edit popover (LinkEditor), not a nav
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && isSafeUri(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      },
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
    // Defense-in-depth: strip dangerous link hrefs / image srcs from any source
    // (paste, markdown parse, setContent, collab seed).
    Sanitize.configure(isAllowedImageSrc ? { isAllowedImageSrc } : {}),
    Placeholder.configure({ placeholder }),
    Markdown,
    BlockId.configure(blockIdTypes ? { types: blockIdTypes } : {}),
  ];

  if (imageUpload) {
    extensions.push(ImageUpload.configure({ getContext: imageUpload.getContext }));
  }
  if (linkEditor) {
    extensions.push(LinkEditor.configure({ getContext: linkEditor.getContext }));
  }
  if (imageEditor) {
    extensions.push(ImageEditor.configure({ getContext: imageEditor.getContext }));
  }

  if (math) {
    // Markdown-aligned input rules ($…$ inline, $$…$$ block) + click-to-edit;
    // throwOnError:false renders malformed LaTeX as a red error token.
    const mathOpts = onMathClick ? { onClick: onMathClick } : {};
    extensions.push(HamInlineMath(mathOpts), HamBlockMath(mathOpts));
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
