import { Extension } from "@tiptap/core";
import type { Fragment, MarkType, NodeType } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

/**
 * URL normalization mirroring the WHATWG URL parser's preprocessing: browsers
 * remove ASCII tab / newline ANYWHERE in a URL and trim C0-control/space from
 * the ends BEFORE scheme detection — so `java\tscript:alert(1)` navigates as
 * `javascript:`. Any scheme test that skips this normalization is bypassable
 * by content that arrives without browser-side validation (a `tiptap-json`
 * seed, a collab/Yjs update).
 */
function normalizeUri(uri: string): string {
  // eslint-disable-next-line no-control-regex -- C0 controls are exactly what the URL spec trims
  return uri.replace(/[\t\r\n]/g, "").replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "");
}

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

/** The scheme of a normalized URI, lowercased — or null for relative URLs. */
function schemeOf(uri: string): string | null {
  const match = SCHEME_RE.exec(normalizeUri(uri));
  return match ? match[1]!.toLowerCase() : null;
}

const ALLOWED_LINK_SCHEMES = new Set(["http", "https", "mailto"]);
const BLOCKED_IMAGE_SCHEMES = new Set(["javascript", "vbscript", "file"]);

/**
 * Default link-`href` policy: an explicit ALLOWLIST — `http:` / `https:` /
 * `mailto:` plus scheme-less URLs (relative paths, `#fragment`, `?query`,
 * protocol-relative `//…`). This matches the Link extension's typed-path
 * protocol allowlist, and is normalization-first, so control-char-obfuscated
 * schemes (`java\tscript:`) and novel active schemes are rejected by
 * construction rather than enumerated. Hosts can widen or tighten via
 * {@link SanitizeOptions.isAllowedLinkHref}.
 */
export function isSafeUri(uri: string | null | undefined): boolean {
  if (!uri) return true;
  const scheme = schemeOf(uri);
  return scheme === null || ALLOWED_LINK_SCHEMES.has(scheme);
}

/**
 * Default image-`src` policy. An `<img>` src is not a navigation context, so
 * unknown/custom schemes (e.g. a host upload handler returning
 * `stored://bucket/x` for later resolution) are inert and stay allowed; what's
 * stripped is the script-capable set — `javascript:` / `vbscript:` / `file:`
 * and every non-image `data:` payload (`data:text/html`,
 * `data:application/*`, …) — after the same control-char normalization as
 * links. `data:image/svg+xml` stays usable (SVG via an `<img>` src is
 * script-inert in browsers) — hosts whose downstream pipelines inline SVG
 * markup into the DOM should tighten this via
 * {@link SanitizeOptions.isAllowedImageSrc}.
 */
export function isSafeImageSrc(src: string | null | undefined): boolean {
  if (!src) return true;
  const scheme = schemeOf(src);
  if (scheme === null) return true;
  if (BLOCKED_IMAGE_SCHEMES.has(scheme)) return false;
  if (scheme === "data") return /^data:image\//i.test(normalizeUri(src));
  return true;
}

export interface SanitizeOptions {
  /** Override the image-src policy (default {@link isSafeImageSrc}). */
  isAllowedImageSrc?: (src: string) => boolean;
  /** Override the link-href policy (default {@link isSafeUri}). */
  isAllowedLinkHref?: (href: string) => boolean;
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
  allowHref: (href: string) => boolean,
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
        if (mark.type === link && !allowHref(mark.attrs.href as string)) {
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
  name: "hiermarkSanitize",

  addOptions() {
    return {};
  },

  onCreate() {
    const allowImg = this.options.isAllowedImageSrc ?? isSafeImageSrc;
    const allowHref = this.options.isAllowedLinkHref ?? isSafeUri;
    const tr = buildSanitizeTr(this.editor.state, allowImg, allowHref);
    if (tr) this.editor.view.dispatch(tr);
  },

  addProseMirrorPlugins() {
    const allowImg = this.options.isAllowedImageSrc ?? isSafeImageSrc;
    const allowHref = this.options.isAllowedLinkHref ?? isSafeUri;
    return [
      new Plugin({
        key: new PluginKey("hiermarkSanitize"),
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
          return buildSanitizeTr(newState, allowImg, allowHref);
        },
      }),
    ];
  },
});
