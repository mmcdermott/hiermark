import { InputRule } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";

/** What a math node click reports so the host can open a LaTeX editor. */
export interface HiermarkMathClick {
  /** The node's document position (where `updateInlineMath`/`updateBlockMath` write). */
  pos: number;
  /** Current LaTeX source. */
  latex: string;
  /** Inline `$…$` vs. display `$$…$$`. */
  kind: "inline" | "block";
}

export interface HiermarkMathOptions {
  /** Fired when an editable math node is clicked (drives the edit popover). */
  onClick?: (info: HiermarkMathClick) => void;
}

const KATEX_BASE = { throwOnError: false } as const;

/**
 * Inline math that recognizes the **markdown** convention `$…$` as you type —
 * the stock extension only fires its input rule on `$$…$$`, so single-dollar
 * math typed mid-sentence never converted. We override `addInputRules` with a
 * single-`$` rule (and keep `$$…$$` for block math, below).
 */
export const HiermarkInlineMath = (opts: HiermarkMathOptions = {}) =>
  InlineMath.extend({
    addInputRules() {
      return [
        new InputRule({
          // `$…$` ending at the cursor, not part of a `$$…$$` run, no inner `$`.
          find: /(?<!\$)\$([^$\n]+?)\$$/,
          handler: ({ state, range, match }) => {
            state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }));
          },
        }),
      ];
    },
  }).configure({
    katexOptions: { ...KATEX_BASE, displayMode: false },
    ...(opts.onClick
      ? { onClick: (node, pos) => opts.onClick!({ pos, latex: node.attrs.latex, kind: "inline" }) }
      : {}),
  });

/**
 * Display math from `$$…$$` (markdown convention). The stock rule used `$$$…$$$`;
 * this fires on `$$…$$` and lifts the whole host paragraph into the block node
 * when the rule consumes it entirely (mirrors the extension's own logic).
 */
export const HiermarkBlockMath = (opts: HiermarkMathOptions = {}) =>
  BlockMath.extend({
    addInputRules() {
      return [
        new InputRule({
          find: /^\$\$([^$\n]+?)\$\$$/,
          handler: ({ state, range, match }) => {
            const node = this.type.create({ latex: match[1] });
            const $from = state.doc.resolve(range.from);
            const consumesHostTextblock =
              $from.depth > 0 &&
              $from.parent.isTextblock &&
              range.from === $from.start() &&
              range.to === $from.end();
            const canReplaceHostTextblock =
              consumesHostTextblock &&
              $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type);
            const r = canReplaceHostTextblock
              ? { from: $from.before(), to: $from.after() }
              : { from: range.from, to: range.to };
            state.tr.replaceWith(r.from, r.to, node);
          },
        }),
      ];
    },
  }).configure({
    katexOptions: { ...KATEX_BASE, displayMode: true },
    ...(opts.onClick
      ? { onClick: (node, pos) => opts.onClick!({ pos, latex: node.attrs.latex, kind: "block" }) }
      : {}),
  });
