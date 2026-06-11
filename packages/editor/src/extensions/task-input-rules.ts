import { Extension, InputRule } from "@tiptap/core";

/**
 * Matches a typed markdown checkbox at the start of a block: `[ ]`, `[]`, or
 * `[x]` followed by a space. By the time this fires after `- `, StarterKit has
 * already turned the line into a bullet item, so the leading dash is gone and we
 * match the bare `[ ] ` inside it — then `toggleTaskList` converts that bullet
 * item into a task item. So both `[ ] ` and the markdown-muscle-memory `- [ ] `
 * produce a checklist.
 */
const TASK_INPUT = /^\s*\[([ xX]?)\]\s$/;

export const TaskInputRules = Extension.create({
  name: "hiermarkTaskInputRules",

  addInputRules() {
    return [
      new InputRule({
        find: TASK_INPUT,
        handler: ({ state, chain, range, match }) => {
          const checked = /[xX]/.test(match[1] ?? "");
          const $from = state.doc.resolve(range.from);

          // Find the nearest enclosing list item.
          let liDepth = -1;
          for (let depth = $from.depth; depth > 0; depth--) {
            const name = $from.node(depth).type.name;
            if (name === "taskItem") return null; // already a checklist item
            if (name === "listItem") {
              liDepth = depth;
              break;
            }
          }

          if (liDepth === -1) {
            // A plain paragraph (or blockquote) — wrap it into a task list.
            chain()
              .deleteRange(range)
              .toggleTaskList()
              .updateAttributes("taskItem", { checked })
              .run();
            return;
          }

          // Inside a bullet/ordered item. Only a SIMPLE, TOP-LEVEL item (one
          // paragraph, not nested under another item) can be lifted + converted
          // without corrupting surrounding/nested list structure. For anything
          // deeper, do nothing — leaving the typed `[ ]` as literal text rather
          // than silently flattening the user's outline.
          const li = $from.node(liDepth);
          const grandparent = liDepth - 2 >= 0 ? $from.node(liDepth - 2) : null;
          const nestedUnderItem =
            !!grandparent &&
            (grandparent.type.name === "listItem" || grandparent.type.name === "taskItem");
          const hasSublistOrExtra = li.childCount > 1;
          if (nestedUnderItem || hasSublistOrExtra) return null;

          chain()
            .deleteRange(range)
            .liftListItem("listItem")
            .toggleTaskList()
            .updateAttributes("taskItem", { checked })
            .run();
        },
      }),
    ];
  },
});
