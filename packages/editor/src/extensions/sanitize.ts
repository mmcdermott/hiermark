import { Extension } from "@tiptap/core";
import type { Fragment, MarkType, NodeType } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

/** Schemes that can execute script or load active content — never allowed in an href. */
const DANGEROUS_URI = /^\s*(?:javascript:|vbscript:|file:|data:text\/html)/i;

/** Whether a link `href` is safe (rejects javascript:/vbscript:/file:/data:text/html). */
export function isSafeUri(uri: string | null | undefined): boolean {
  return !uri || !DANGEROUS_URI.test(uri);
}

/** Default image `src` policy: same dangerous-scheme block (data:image/* stays allowed). */
export function isSafeImageSrc(src: string | null | undefined): boolean {
  return !src || !DANGEROUS_URI.test(src);
}

export interface SanitizeOptions {
  /** Override the image-src policy (default {@link isSafeImageSrc}). */
  isAllowedImageSrc?: (src: string) => boolean;
}

/** Whether a fragment contains a link mark or an image node (recursively). */
function fragmentHasLinkOrImage(
  frag: Fragment,
  link: MarkType | undefined,
  image: NodeType | undefined,
): boolean {
  let found = false;
  frag.forEach((node) => {
    if (found) return;
    if (image && node.type === image) found = true;
    else if (link && node.marks.some((m) => m.type === link)) found = true;
    else if (node.content.size) found = fragmentHasLinkOrImage(node.content, link, image);
  });
  return found;
}

/** Whether a step could introduce a link mark or image (so we only walk when needed). */
function stepMayAddLinkOrImage(
  step: unknown,
  link: MarkType | undefined,
  image: NodeType | undefined,
): boolean {
  const s = step as { slice?: { content: Fragment }; mark?: { type: MarkType }; attr?: string };
  if (s.mark && link && s.mark.type === link) return true; // AddMarkStep(link)
  if (s.attr === "href" || s.attr === "src") return true;
  return !!s.slice && fragmentHasLinkOrImage(s.slice.content, link, image);
}

/** Build a transaction stripping every unsafe link href / image src, or null. */
function buildSanitizeTr(
  state: EditorState,
  allowImg: (src: string) => boolean,
): Transaction | null {
  const link = state.schema.marks.link;
  const image = state.schema.nodes.image;
  if (!link && !image) return null;

  // Collect first (positions are from state.doc), then apply size-stable
  // removeMarks before reverse-ordered deletes so positions stay valid.
  const linkRemoves: { from: number; to: number }[] = [];
  const imageDeletes: { from: number; to: number }[] = [];
  state.doc.descendants((node, pos) => {
    if (image && node.type === image && !allowImg(node.attrs.src as string)) {
      imageDeletes.push({ from: pos, to: pos + node.nodeSize });
      return false;
    }
    if (link) {
      for (const mark of node.marks) {
        if (mark.type === link && !isSafeUri(mark.attrs.href as string)) {
          linkRemoves.push({ from: pos, to: pos + node.nodeSize });
          break;
        }
      }
    }
    return undefined;
  });

  if (!linkRemoves.length && !imageDeletes.length) return null;
  const tr = state.tr;
  for (const { from, to } of linkRemoves) tr.removeMark(from, to, link!);
  imageDeletes.sort((a, b) => b.from - a.from).forEach(({ from, to }) => tr.delete(from, to));
  tr.setMeta("addToHistory", false);
  return tr;
}

/**
 * Strips dangerous link `href`s and image `src`s from the document, regardless
 * of how they got in (initial content, typing, paste, markdown parse,
 * `setContent`, collab seed). The Link extension's own `isAllowedUri` guards the
 * typed/pasted/autolink paths; this is the defense-in-depth that also covers the
 * markdown parser — which builds marks/nodes directly — and the initial seed, so
 * a `[x](javascript:…)` link or a `data:text/html` image can never persist
 * (stored-XSS). `onCreate` sanitizes the seed; the plugin sanitizes every edit.
 */
export const Sanitize = Extension.create<SanitizeOptions>({
  name: "hamSanitize",

  addOptions() {
    return {};
  },

  onCreate() {
    const allowImg = this.options.isAllowedImageSrc ?? isSafeImageSrc;
    const tr = buildSanitizeTr(this.editor.state, allowImg);
    if (tr) this.editor.view.dispatch(tr);
  },

  addProseMirrorPlugins() {
    const allowImg = this.options.isAllowedImageSrc ?? isSafeImageSrc;
    return [
      new Plugin({
        key: new PluginKey("hamSanitize"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const link = newState.schema.marks.link;
          const image = newState.schema.nodes.image;
          if (!link && !image) return null;
          if (
            !transactions.some((t) => t.steps.some((s) => stepMayAddLinkOrImage(s, link, image)))
          ) {
            return null;
          }
          return buildSanitizeTr(newState, allowImg);
        },
      }),
    ];
  },
});
