import { findCitations } from "../markdown/citations";
import { findResources } from "../markdown/resources";
import type { HiermarkAnnotationRegistry, HiermarkAnnotationType } from "../types";
import { annotationId } from "./identity";

/**
 * Context shape understood by the bundled example recognizers. The framework
 * never interprets it; each recognizer reads only the keys it owns (spec §5.13).
 */
export interface HiermarkExampleAnnotationContext {
  tasksByBlockId?: Record<string, unknown>;
  references?: Record<string, { title?: string; year?: number }>;
  people?: Record<string, { name?: string }>;
}

type Ctx = HiermarkExampleAnnotationContext;

/**
 * A checklist item, rendered as a block chip. Clicking the chip opens a popover
 * whose "Done" checkbox writes back to the block: `update({ setAttrs: { checked } })`
 * flips the `taskItem`'s canonical `checked` attr (`- [ ]` ⇄ `- [x]`) as one
 * transaction, so done-ness syncs via Yjs and survives save — no sidecar drift.
 */
export function createTaskAnnotation(): HiermarkAnnotationType<Ctx> {
  return {
    name: "task",
    priority: 100,
    placement: "block-chip",
    recognize({ block, text, context }) {
      if (block.type !== "taskItem") return [];
      return [
        {
          id: `task:${block.id}`,
          type: "task",
          blockId: block.id,
          label: text,
          data: {
            checked: !!block.attrs?.checked,
            record: context.tasksByBlockId?.[block.id] ?? null,
          },
        },
      ];
    },
    render: ({ hit, update, close }) => {
      const checked = !!(hit.data as { checked?: boolean } | null)?.checked;
      return (
        <label className="hiermark-task-chip">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              update({ setAttrs: { checked: e.target.checked } });
              close?.();
            }}
          />
          {hit.label}
        </label>
      );
    },
  };
}

/** `@key` citation pill, resolved against `context.references`. */
export function createCitationAnnotation(): HiermarkAnnotationType<Ctx> {
  return {
    name: "citation",
    priority: 100,
    placement: "inline",
    recognize({ block, text, context }) {
      return findCitations(text).map((c) => ({
        id: annotationId("citation", block.id, c.key, c.index),
        type: "citation",
        blockId: block.id,
        from: c.index,
        to: c.index + c.key.length + 1, // include the leading '@'
        label: c.key,
        data: {
          key: c.key,
          known: !!context.references?.[c.key],
          ref: context.references?.[c.key],
        },
      }));
    },
    inlineClass: (hit) =>
      (hit.data as { known?: boolean })?.known
        ? "hiermark-citation-known"
        : "hiermark-citation-unknown",
    render: ({ hit }) => (
      <span className="hiermark-annotation-chip hiermark-citation-chip">@{hit.label}</span>
    ),
    // Type `@` to search the project's references and insert `@key`.
    suggest: {
      trigger: "@",
      search: (query, context) => {
        const q = query.toLowerCase();
        return Object.entries(context.references ?? {})
          .filter(
            ([key, ref]) =>
              key.toLowerCase().includes(q) || (ref.title ?? "").toLowerCase().includes(q),
          )
          .map(([key, ref]) => ({
            id: `citation:${key}`,
            label: key,
            detail: [ref.title, ref.year].filter(Boolean).join(" · "),
            insert: `@${key} `,
          }));
      },
    },
  };
}

/**
 * `@token` mention when the token names someone in `context.people`. Higher
 * priority than citations, so the conflict resolver keeps the mention over a
 * citation for the same range when the token is a known person.
 */
export function createMentionAnnotation(): HiermarkAnnotationType<Ctx> {
  return {
    name: "mention",
    priority: 110,
    placement: "inline",
    recognize({ block, text, context }) {
      if (!context.people) return [];
      return findCitations(text)
        .filter((c) => !!context.people?.[c.key])
        .map((c) => ({
          id: annotationId("mention", block.id, c.key, c.index),
          type: "mention",
          blockId: block.id,
          from: c.index,
          to: c.index + c.key.length + 1,
          label: c.key,
          data: context.people?.[c.key] ?? null,
        }));
    },
    inlineClass: () => "hiermark-mention",
    render: ({ hit }) => (
      <span className="hiermark-annotation-chip hiermark-mention-chip">
        @{(hit.data as { name?: string })?.name ?? hit.label}
      </span>
    ),
    // Type `@` to search people and insert `@handle` (shown ahead of references).
    suggest: {
      trigger: "@",
      search: (query, context) => {
        const q = query.toLowerCase();
        return Object.entries(context.people ?? {})
          .filter(
            ([key, p]) => key.toLowerCase().includes(q) || (p.name ?? "").toLowerCase().includes(q),
          )
          .map(([key, p]) => ({
            id: `mention:${key}`,
            label: p.name ?? key,
            detail: `@${key}`,
            insert: `@${key} `,
          }));
      },
    },
  };
}

/** URLs, classified by kind (arxiv/github/doi/pdf/youtube/url). */
export function createUrlAnnotation(): HiermarkAnnotationType<Ctx> {
  return {
    name: "url",
    priority: 50,
    placement: "inline",
    recognize({ block, text }) {
      return findResources(text).map((r) => ({
        id: annotationId("url", block.id, r.url, r.index),
        type: "url",
        blockId: block.id,
        from: r.index,
        to: r.index + r.url.length,
        label: r.url,
        data: { url: r.url, kind: r.kind },
      }));
    },
    inlineClass: (hit) =>
      `hiermark-url hiermark-url-${(hit.data as { kind?: string })?.kind ?? "url"}`,
    render: ({ hit }) => (
      <a
        className="hiermark-annotation-chip hiermark-url-chip"
        href={hit.label}
        target="_blank"
        rel="noreferrer"
      >
        {hit.label}
      </a>
    ),
  };
}

/** The bundled example registry: tasks, mentions, citations, and URLs. */
export function createExampleAnnotationRegistry(): HiermarkAnnotationRegistry<Ctx> {
  return {
    types: [
      createTaskAnnotation(),
      createMentionAnnotation(),
      createCitationAnnotation(),
      createUrlAnnotation(),
    ],
  };
}
