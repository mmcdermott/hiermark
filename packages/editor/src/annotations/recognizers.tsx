import { findCitations } from "../markdown/citations";
import { findResources } from "../markdown/resources";
import type { HamAnnotationRegistry, HamAnnotationType } from "../types";
import { annotationId } from "./identity";

/**
 * Context shape understood by the bundled example recognizers. The framework
 * never interprets it; each recognizer reads only the keys it owns (spec §5.13).
 */
export interface HamExampleAnnotationContext {
  tasksByBlockId?: Record<string, unknown>;
  references?: Record<string, { title?: string; year?: number }>;
  people?: Record<string, { name?: string }>;
}

type Ctx = HamExampleAnnotationContext;

/** A checklist item, rendered as a block chip carrying its sidecar task record. */
export function createTaskAnnotation(): HamAnnotationType<Ctx> {
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
          data: context.tasksByBlockId?.[block.id] ?? null,
        },
      ];
    },
    render: ({ hit }) => <span className="ham-annotation-chip ham-task-chip">✓ {hit.label}</span>,
  };
}

/** `@key` citation pill, resolved against `context.references`. */
export function createCitationAnnotation(): HamAnnotationType<Ctx> {
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
      (hit.data as { known?: boolean })?.known ? "ham-citation-known" : "ham-citation-unknown",
    render: ({ hit }) => (
      <span className="ham-annotation-chip ham-citation-chip">@{hit.label}</span>
    ),
  };
}

/**
 * `@token` mention when the token names someone in `context.people`. Higher
 * priority than citations, so the conflict resolver keeps the mention over a
 * citation for the same range when the token is a known person.
 */
export function createMentionAnnotation(): HamAnnotationType<Ctx> {
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
    inlineClass: () => "ham-mention",
    render: ({ hit }) => (
      <span className="ham-annotation-chip ham-mention-chip">
        @{(hit.data as { name?: string })?.name ?? hit.label}
      </span>
    ),
  };
}

/** URLs, classified by kind (arxiv/github/doi/pdf/youtube/url). */
export function createUrlAnnotation(): HamAnnotationType<Ctx> {
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
    inlineClass: (hit) => `ham-url ham-url-${(hit.data as { kind?: string })?.kind ?? "url"}`,
    render: ({ hit }) => (
      <a
        className="ham-annotation-chip ham-url-chip"
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
export function createExampleAnnotationRegistry(): HamAnnotationRegistry<Ctx> {
  return {
    types: [
      createTaskAnnotation(),
      createMentionAnnotation(),
      createCitationAnnotation(),
      createUrlAnnotation(),
    ],
  };
}
