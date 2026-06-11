import { useMemo, useState } from "react";
import {
  HiermarkEditor,
  type HiermarkBranchabilityRules,
  type HiermarkBranchPolicy,
} from "@hiermark/editor";

import { DemoFrame } from "./DemoFrame";

// A small tree with headings, paragraphs, and a nested list so the different
// policies visibly light up different blocks in the right-hand branch gutter.
const SOURCE_MD = `# Background

Transformers replaced recurrence with self-attention.

## Attention

Scaled dot-product attention weights every token against every other token.

## Limitations

- Quadratic memory in sequence length
  - Mitigated by sparse and linear attention
- Positional encoding is bolted on

Retrieval augmentation is a promising direction.`;

// "Only blocks that have no sub-blocks" — the recursive leaves-only filter,
// expressed as a branchability rules object.
const LEAVES_ONLY: HiermarkBranchabilityRules = {
  kind: "rules",
  leaves: true,
  multiChildContainers: false,
  singleChildContainers: false,
  alwaysHeadings: false,
};

interface PolicyOption {
  key: string;
  label: string;
  policy: HiermarkBranchPolicy;
  blurb: string;
}

const OPTIONS: PolicyOption[] = [
  {
    key: "bubble-up",
    label: "Bubble-up",
    policy: "bubble-up",
    blurb:
      "Default. A branch button only where there's a meaningful alternative branch point — a linear heading→heading→paragraph chain collapses to one button at the top; a real fork (≥2 nested points) shows the fork and each branch.",
  },
  {
    key: "smart",
    label: "Smart",
    policy: "smart",
    blurb:
      "Per-block: leaves and forks branch, single-child chains hoist to their top container, headings always — but without the whole-subtree bubble-up absorption.",
  },
  {
    key: "headings-only",
    label: "Headings only",
    policy: "headings-only",
    blurb: "Only heading blocks branch — the “only nodes of this type” filter.",
  },
  {
    key: "leaves-only",
    label: "Leaves only",
    policy: LEAVES_ONLY,
    blurb:
      "Only blocks with no sub-blocks — the recursive “keep just the ones without children”. Containers and headings are suppressed (a HiermarkBranchabilityRules object).",
  },
  {
    key: "any",
    label: "Every block",
    policy: "any-nonempty-block",
    blurb: "Every non-empty block gets a branch button — the most permissive preset.",
  },
  {
    key: "off",
    label: "Off",
    policy: "off",
    blurb: "No branch affordances at all (e.g. a standalone editor with nowhere to branch into).",
  },
];

const SOURCE = `import { HiermarkEditor, type HiermarkBranchabilityRules } from "@hiermark/editor";

// A named preset…
<HiermarkEditor branchPolicy="headings-only" /* … */ />;

// …a declarative rules object (recursive "leaves only")…
const leavesOnly: HiermarkBranchabilityRules = {
  kind: "rules",
  leaves: true,
  multiChildContainers: false,
  singleChildContainers: false,
  alwaysHeadings: false,
};
<HiermarkEditor branchPolicy={leavesOnly} /* … */ />;

// …or an arbitrary predicate for "only nodes of this type":
<HiermarkEditor branchPolicy={(block) => block.type === "listItem"} /* … */ />;`;

export function BranchPolicyDemo() {
  const [policyKey, setPolicyKey] = useState("bubble-up");
  const [reset, setReset] = useState(0);
  const option = useMemo(
    () => OPTIONS.find((o) => o.key === policyKey) ?? OPTIONS[0]!,
    [policyKey],
  );

  const controls = (
    <span className="gallery-controls">
      <span className="gallery-control">
        <span className="gallery-control-label">Branch policy</span>
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={"gallery-seg" + (o.key === policyKey ? " gallery-seg-on" : "")}
            aria-pressed={o.key === policyKey}
            onClick={() => setPolicyKey(o.key)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );

  return (
    <DemoFrame
      title="@hiermark/editor — branch policy controls"
      controls={controls}
      onReset={() => setReset((r) => r + 1)}
      source={SOURCE}
      height="auto"
    >
      <div className="demo-editor-wrap branch-policy-demo">
        <HiermarkEditor
          // Remount on policy change so the gutter re-evaluates against the new
          // policy, and on reset to restore the original content.
          key={`${policyKey}-${reset}`}
          surfaceId="branch-policy-demo"
          rootBlockId="blk_root"
          title="Background"
          value={{ kind: "markdown", markdown: SOURCE_MD }}
          branchPolicy={option.policy}
          onBranchRequest={(e) => console.log("branch", e.blockId, e.textPreview)}
        />
        <p className="demo-hint">
          The faint marks in the right gutter are <strong>branch buttons</strong> (hover a block to
          light them up). Switch the policy above to see which blocks may be branched —{" "}
          <strong>{option.label}:</strong> {option.blurb}
        </p>
      </div>
    </DemoFrame>
  );
}
