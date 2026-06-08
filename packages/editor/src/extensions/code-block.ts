import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

/**
 * A lowlight instance preloaded with highlight.js' "common" grammar set (~35
 * widely used languages: js/ts, python, rust, go, json, bash, css, html, sql,
 * yaml, markdown, …). Shared across every editor so the grammars load once.
 */
export const hamLowlight = createLowlight(common);

/** Languages offered in the code block's language picker (""/auto first). */
const PICKER_LANGUAGES = ["", ...hamLowlight.listLanguages().sort()];

const PRETTY: Record<string, string> = {
  "": "plain text",
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
};

function prettyLang(lang: string): string {
  return PRETTY[lang] ?? lang;
}

/**
 * The HAM code block: {@link CodeBlockLowlight} (syntax highlighting via
 * highlight.js when the fence carries a language) plus a vanilla node view that
 * adds a header with a language picker and a copy-to-clipboard button.
 *
 * The view keeps the `<pre><code>` content element as `contentDOM` so both the
 * lowlight highlight decorations and the block gutter widget (placed just inside
 * the node) keep working, and mirrors the block-id / language attributes onto
 * the wrapper so the canvas connectors and CSS still resolve the block.
 */
export const HamCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;

      const dom = document.createElement("div");
      dom.className = "ham-code-block";

      const header = document.createElement("div");
      header.className = "ham-code-block-header";
      header.contentEditable = "false";
      // Don't let clicks in the header move the editor selection into the block.
      header.addEventListener("mousedown", (e) => e.preventDefault());

      const select = document.createElement("select");
      select.className = "ham-code-lang";
      select.setAttribute("aria-label", "Code language");
      for (const lang of PICKER_LANGUAGES) {
        const opt = document.createElement("option");
        opt.value = lang;
        opt.textContent = prettyLang(lang);
        select.append(opt);
      }
      select.value = (node.attrs.language as string) || "";
      select.disabled = !editor.isEditable;
      select.addEventListener("change", () => {
        if (typeof getPos !== "function") return;
        const pos = getPos();
        if (pos == null) return;
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr }) => {
            tr.setNodeAttribute(pos, "language", select.value || null);
            return true;
          })
          .run();
      });

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "ham-code-copy";
      copy.textContent = "Copy";
      let copyTimer: ReturnType<typeof setTimeout> | undefined;
      copy.addEventListener("click", () => {
        const text = current.textContent;
        const flash = (label: string) => {
          copy.textContent = label;
          if (copyTimer) clearTimeout(copyTimer);
          copyTimer = setTimeout(() => {
            copy.textContent = "Copy";
          }, 1400);
        };
        const clipboard = navigator.clipboard;
        if (clipboard?.writeText) {
          clipboard.writeText(text).then(
            () => flash("Copied!"),
            () => flash("Press ⌘C"),
          );
        } else {
          flash("Press ⌘C");
        }
      });

      header.append(select, copy);

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      const applyLang = (n: typeof node) => {
        const lang = (n.attrs.language as string) || "";
        code.className = lang ? `language-${lang}` : "";
        dom.setAttribute("data-language", lang);
        if (select.value !== lang) select.value = lang;
      };
      const applyBlockId = (n: typeof node) => {
        const id = n.attrs.dataBlockId as string | null;
        if (id) dom.setAttribute("data-block-id", id);
        else dom.removeAttribute("data-block-id");
      };
      applyLang(node);
      applyBlockId(node);
      pre.append(code);
      dom.append(header, pre);

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== current.type) return false;
          current = updated;
          applyLang(updated);
          applyBlockId(updated);
          select.disabled = !editor.isEditable;
          return true;
        },
        destroy() {
          if (copyTimer) clearTimeout(copyTimer);
        },
        // Let ProseMirror own everything inside the content; only ignore mutations
        // in our chrome (the header is contentEditable=false so PM already skips it).
        ignoreMutation(mutation) {
          return !code.contains(mutation.target) && header.contains(mutation.target);
        },
      };
    };
  },
}).configure({ lowlight: hamLowlight });
