import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";

import { BlockId } from "./block-id";
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
}

/**
 * Build the standard HAM editor extension set: StarterKit, task lists,
 * placeholder, official Markdown import/export, optional math, and the stable
 * block-id extension.
 */
export function createHamEditorExtensions(opts: HamEditorExtensionOptions = {}): Extensions {
  const { placeholder = "Write…", blockIdTypes, math = true, collab } = opts;
  const collaboration = opts.collaboration || !!collab;

  const extensions: Extensions = [
    StarterKit.configure({
      // Yjs provides collaborative history; StarterKit's would conflict.
      ...(collaboration ? { undoRedo: false } : {}),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    Markdown,
    BlockId.configure(blockIdTypes ? { types: blockIdTypes } : {}),
  ];

  if (math) {
    extensions.push(Mathematics);
  }

  if (collab) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extensions.push(Collaboration.configure({ document: collab.ydoc as any }));
    if (collab.provider?.awareness) {
      extensions.push(
        CollaborationCaret.configure({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: collab.provider as any,
          ...(collab.user ? { user: collab.user } : {}),
        }),
      );
    }
  }

  return extensions;
}
