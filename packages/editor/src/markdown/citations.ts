import { stripStableIds } from "./stable-id";

/**
 * `@key` citation extraction. Recognizes BibTeX-style keys like `@vaswani2017`
 * or `@smith2020.eq` but not email-ish `a@b` (a `@` preceded by an
 * alphanumeric is ignored). First-seen wins for dedupe.
 */
const CITATION = /(?<![A-Za-z0-9])@([A-Za-z][\w+\-:]*(?:\.[\w+\-:]+)*)/g;

export interface CitationKey {
  key: string;
  /** Offset of the `@` within the (id-stripped) text. */
  index: number;
}

/** Extract distinct citation keys (first occurrence) from a block body. */
export function extractCitationKeys(bodyMarkdown: string): string[] {
  const clean = stripStableIds(bodyMarkdown);
  const seen = new Set<string>();
  const out: string[] = [];
  CITATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION.exec(clean)) !== null) {
    const key = m[1]!;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Extract citation occurrences with their offsets (every occurrence, not deduped). */
export function findCitations(text: string): CitationKey[] {
  const out: CitationKey[] = [];
  CITATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION.exec(text)) !== null) {
    out.push({ key: m[1]!, index: m.index });
  }
  return out;
}
