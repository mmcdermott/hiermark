import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { Mathematics } from "@tiptap/extension-mathematics";

import { BlockId } from "./block-id";

export interface HamEditorExtensionOptions {
  /** Placeholder text shown in an empty editor. */
  placeholder?: string;
  /**
   * Disable StarterKit's built-in undo/redo history. Required when collaboration
   * is enabled (Yjs owns history); harmless otherwise.
   */
  collaboration?: boolean;
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
  const { placeholder = "Write…", collaboration = false, blockIdTypes, math = true } = opts;

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

  return extensions;
}
