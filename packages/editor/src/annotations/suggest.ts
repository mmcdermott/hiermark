import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { findSuggestionMatch } from "@tiptap/suggestion";

import type { HamAnnotationRegistry, HamAnnotationSuggestion } from "../types";

/** The live state of the annotation type-ahead, pushed to React for rendering. */
export interface AnnotationSuggestState {
  active: boolean;
  trigger: string | null;
  query: string;
  /** Document range covering the trigger + query (what an insert replaces). */
  range: { from: number; to: number } | null;
  items: HamAnnotationSuggestion[];
}

const EMPTY: AnnotationSuggestState = {
  active: false,
  trigger: null,
  query: "",
  range: null,
  items: [],
};

export interface AnnotationSuggestContext<Ctx = unknown> {
  registry: HamAnnotationRegistry<Ctx>;
  context: Ctx;
  /** Max candidates shown (default 8). */
  maxItems?: number;
  /** Receives the current type-ahead state so React can render the popover. */
  onState: (state: AnnotationSuggestState) => void;
  /** React's keydown handler while the popover is open (nav / commit / dismiss). */
  onKeyDown?: ((event: KeyboardEvent) => boolean) | null;
}

export interface AnnotationSuggestOptions {
  getContext: () => AnnotationSuggestContext | null;
}

export const annotationSuggestKey = new PluginKey<PluginState>("hamAnnotationSuggest");

interface PluginState {
  suggest: AnnotationSuggestState;
  /** A range the user dismissed with Escape — suppressed until it changes. */
  dismissed: { from: number; to: number } | null;
}

/** Single-entry memo so an unchanged (trigger, query, context) skips search(). */
interface SearchCache {
  trigger: string | null;
  query: string | null;
  context: unknown;
  items: HamAnnotationSuggestion[];
}

/** Distinct trigger chars across the registry's suggest-capable types. */
function triggerChars(registry: HamAnnotationRegistry): string[] {
  const set = new Set<string>();
  for (const t of registry.types) if (t.suggest) set.add(t.suggest.trigger);
  return [...set];
}

/**
 * Aggregate candidates from every suggest-capable type that shares `trigger`,
 * de-duplicated by id and capped at `maxItems`. Pure over `context` — the editor
 * never interprets the domain — so it's unit-testable without ProseMirror.
 */
export function collectSuggestions<Ctx>(
  registry: HamAnnotationRegistry<Ctx>,
  trigger: string,
  query: string,
  context: Ctx,
  maxItems = 8,
): HamAnnotationSuggestion[] {
  const out: HamAnnotationSuggestion[] = [];
  const seen = new Set<string>();
  for (const t of registry.types) {
    if (t.suggest?.trigger !== trigger) continue;
    for (const s of t.suggest.search(query, context)) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out.slice(0, maxItems);
}

/** Resolve the active type-ahead at the cursor against the registry's triggers. */
function compute(
  state: EditorState,
  getContext: () => AnnotationSuggestContext | null,
  cache: SearchCache,
): AnnotationSuggestState {
  const ctx = getContext();
  if (!ctx) return EMPTY;
  const { selection } = state;
  if (!selection.empty) return EMPTY; // only on a collapsed cursor
  const triggers = triggerChars(ctx.registry);
  if (!triggers.length) return EMPTY;
  const $position = selection.$from;
  for (const trigger of triggers) {
    const allowSpaces = ctx.registry.types.some(
      (t) => t.suggest?.trigger === trigger && t.suggest.allowSpaces,
    );
    const match = findSuggestionMatch({
      char: trigger,
      allowSpaces,
      allowToIncludeChar: false,
      allowedPrefixes: null,
      startOfLine: false,
      $position,
    });
    if (!match) continue;
    // Require a non-word boundary before the trigger, mirroring the citation
    // recognizer's `(?<![A-Za-z0-9])@` — so `email@host.com` isn't a trigger but
    // `(@key`, a leading `@`, or `@` after a space all are.
    const $at = state.doc.resolve(match.range.from);
    const before = $at.parent.textBetween(Math.max(0, $at.parentOffset - 1), $at.parentOffset);
    if (before && /[A-Za-z0-9]/.test(before)) continue;
    // Reuse the last result for an identical (trigger, query, context) — so a
    // cursor move within the same token doesn't re-run the host's search().
    let items: HamAnnotationSuggestion[];
    if (cache.trigger === trigger && cache.query === match.query && cache.context === ctx.context) {
      items = cache.items;
    } else {
      items = collectSuggestions(ctx.registry, trigger, match.query, ctx.context, ctx.maxItems);
      cache.trigger = trigger;
      cache.query = match.query;
      cache.context = ctx.context;
      cache.items = items;
    }
    if (items.length === 0) continue; // nothing to show — let another trigger try
    return { active: true, trigger, query: match.query, range: match.range, items };
  }
  return EMPTY;
}

/**
 * Drives an annotation type-ahead: typing a registered `trigger` opens a popover
 * of candidates from that type's `search`; choosing one inserts its text, which
 * the recognizers then pick up (e.g. an `@key` citation pill). Reads triggers
 * dynamically from the registry (via `getContext`), so adding a suggest-capable
 * annotation type "just works" without reconfiguring the editor.
 */
export const AnnotationSuggest = Extension.create<AnnotationSuggestOptions>({
  name: "hamAnnotationSuggest",

  addOptions() {
    return { getContext: () => null };
  },

  addProseMirrorPlugins() {
    const getContext = this.options.getContext;
    let lastSig: string | null = null;
    const cache: SearchCache = { trigger: null, query: null, context: undefined, items: [] };
    return [
      new Plugin<PluginState>({
        key: annotationSuggestKey,
        state: {
          init: () => ({ suggest: EMPTY, dismissed: null }),
          apply(tr, value, _oldState, newState): PluginState {
            // Escape dismisses the current token (keyed by its trigger position).
            if (tr.getMeta(annotationSuggestKey)?.dismiss) {
              return { suggest: EMPTY, dismissed: value.suggest.range };
            }
            const next = compute(newState, getContext, cache);
            // Stay suppressed only while still typing within the SAME token (same
            // trigger position). Moving the cursor away, or a new token, clears
            // the dismissal — so the type-ahead can never get permanently stuck
            // (e.g. after undo/redo returns to the same offset).
            if (next.active && value.dismissed && next.range?.from === value.dismissed.from) {
              return { suggest: EMPTY, dismissed: value.dismissed };
            }
            return { suggest: next, dismissed: null };
          },
        },
        props: {
          handleKeyDown(view, event) {
            const st = annotationSuggestKey.getState(view.state);
            if (!st?.suggest.active) return false;
            return getContext()?.onKeyDown?.(event) ?? false;
          },
        },
        view: () => ({
          update(view) {
            const st = annotationSuggestKey.getState(view.state)?.suggest ?? EMPTY;
            const sig = st.active
              ? `${st.trigger}|${st.range?.from}-${st.range?.to}|${st.items.map((i) => i.id).join(",")}`
              : "";
            if (sig !== lastSig) {
              lastSig = sig;
              getContext()?.onState(st);
            }
          },
        }),
      }),
    ];
  },
});

/** Dismiss the open type-ahead (Escape) — suppressed until its range changes. */
export function dismissAnnotationSuggest(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(annotationSuggestKey, { dismiss: true }));
}
