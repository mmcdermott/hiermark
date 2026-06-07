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
  name: "hamTaskInputRules",

  addInputRules() {
    return [
      new InputRule({
        find: TASK_INPUT,
        handler: ({ state, chain, range, match }) => {
          const checked = /[xX]/.test(match[1] ?? "");

          // If the cursor is inside a plain bullet/ordered list item (the `- [ ]`
          // case, where StarterKit already made a bullet), lift it out first so
          // toggleTaskList wraps a fresh paragraph into a task list.
          const $from = state.doc.resolve(range.from);
          let inPlainList = false;
          for (let depth = $from.depth; depth > 0; depth--) {
            const name = $from.node(depth).type.name;
            if (name === "taskItem") {
              inPlainList = false;
              break;
            }
            if (name === "listItem") inPlainList = true;
          }

          const c = chain().deleteRange(range);
          if (inPlainList) c.liftListItem("listItem");
          c.toggleTaskList().updateAttributes("taskItem", { checked }).run();
        },
      }),
    ];
  },
});
