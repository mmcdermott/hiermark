/** URL extraction and classification. */

export type ResourceKind = "arxiv" | "github" | "doi" | "pdf" | "youtube" | "url";

const URL_RE = /https?:\/\/[^\s)<>\]"']+/g;

/** Best-effort classification of a URL into a resource kind. */
export function detectResourceKind(url: string): ResourceKind {
  const u = url.toLowerCase();
  if (/arxiv\.org/.test(u)) return "arxiv";
  if (/github\.com/.test(u)) return "github";
  if (/(doi\.org|\/doi\/)/.test(u)) return "doi";
  if (/\.pdf($|[?#])/.test(u)) return "pdf";
  if (/(youtube\.com|youtu\.be)/.test(u)) return "youtube";
  return "url";
}

export interface ResourceRef {
  url: string;
  kind: ResourceKind;
  /** Offset of the URL within the text. */
  index: number;
}

/** Find every URL occurrence with its offset and kind. Trailing punctuation trimmed. */
export function findResources(text: string): ResourceRef[] {
  const out: ResourceRef[] = [];
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[0]!;
    const trimmed = raw.replace(/[.,;:!?]+$/, "");
    out.push({ url: trimmed, kind: detectResourceKind(trimmed), index: m.index });
  }
  return out;
}

/** Extract distinct resource links from a block body. */
export function extractResourceLinks(bodyMarkdown: string): ResourceRef[] {
  const seen = new Set<string>();
  const out: ResourceRef[] = [];
  for (const r of findResources(bodyMarkdown)) {
    if (!seen.has(r.url)) {
      seen.add(r.url);
      out.push(r);
    }
  }
  return out;
}
