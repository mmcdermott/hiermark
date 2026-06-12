import { useMemo, useState } from "react";
import {
  HiermarkCanvas,
  type HiermarkAddSiblingButtonProps,
  type HiermarkCanvasLayoutConfig,
  type HiermarkCanvasSlots,
} from "@hiermark/canvas";

import { DemoFrame } from "./DemoFrame";
import { useDemoCanvas } from "../lib/demoHost";
import { galleryCanvas } from "../lib/examples";

type Appearance = HiermarkCanvasLayoutConfig["appearance"];
type Connectors = HiermarkCanvasLayoutConfig["showConnectors"];
type Inactive = HiermarkCanvasLayoutConfig["inactiveColumnMode"];
type SiblingStyle = "plus" | "labeled" | "dot";

// --- Three interchangeable add-sibling button components ------------------- //
// Each is a drop-in for HiermarkCanvasSlots.AddSiblingButton, exactly like swapping
// the editor's branch button. They receive the resolved insert position so a
// custom button can label "insert" vs "append".

/** A pill that spells out the action (and the position it will insert at). */
function LabeledAddSibling({ isAppend, onAddSibling }: HiermarkAddSiblingButtonProps) {
  return (
    <div className="hiermark-add-sibling-rail">
      <button
        type="button"
        className="gallery-add-labeled"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          onAddSibling();
        }}
      >
        {isAppend ? "+ add sibling" : "+ insert here"}
      </button>
    </div>
  );
}

/** A tiny circular dot — the quietest possible affordance. */
function DotAddSibling({ onAddSibling }: HiermarkAddSiblingButtonProps) {
  return (
    <div className="hiermark-add-sibling-rail">
      <button
        type="button"
        className="gallery-add-dot"
        aria-label="Insert a sibling branch here"
        title="Insert a sibling branch here"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          onAddSibling();
        }}
      />
    </div>
  );
}

const SIBLING_BUTTONS: Record<SiblingStyle, HiermarkCanvasSlots["AddSiblingButton"]> = {
  plus: undefined, // the package default
  labeled: LabeledAddSibling,
  dot: DotAddSibling,
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <span className="gallery-control" role="group" aria-label={label}>
      <span className="gallery-control-label">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"gallery-seg" + (o.value === value ? " gallery-seg-on" : "")}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * Gallery demo: the same canvas re-themed live. Shows the three card appearances
 * (`card` / `flat` / `plain`), the connector modes, and that the add-sibling
 * affordance is a swappable component — exactly like the editor's branch button.
 */
export function CanvasStylesDemo() {
  const canvas = useDemoCanvas(galleryCanvas);
  const [appearance, setAppearance] = useState<Appearance>("card");
  const [connectors, setConnectors] = useState<Connectors>("all");
  const [siblingStyle, setSiblingStyle] = useState<SiblingStyle>("plus");
  const [groupHeaders, setGroupHeaders] = useState<"on" | "off">("off");
  const [columnScroll, setColumnScroll] = useState<"on" | "off">("off");
  const [inactive, setInactive] = useState<Inactive>("expanded");

  const slots = useMemo<HiermarkCanvasSlots>(() => {
    const Btn = SIBLING_BUTTONS[siblingStyle];
    return Btn ? { AddSiblingButton: Btn } : {};
  }, [siblingStyle]);

  return (
    <DemoFrame
      title="@hiermark/canvas — appearances, connectors, swappable buttons & navigation"
      onReset={canvas.reset}
      height={560}
      fillWidth
      controls={
        <span className="gallery-controls">
          <Segmented
            label="Cards"
            value={appearance}
            onChange={setAppearance}
            options={[
              { value: "card", label: "Separate cards" },
              { value: "flat", label: "Flat columns" },
              { value: "plain", label: "Plain" },
            ]}
          />
          <Segmented
            label="Edges"
            value={connectors}
            onChange={setConnectors}
            options={[
              { value: "active", label: "Active" },
              { value: "all", label: "All" },
              { value: "hover", label: "Hover" },
              { value: "off", label: "Off" },
            ]}
          />
          <Segmented
            label="+ button"
            value={siblingStyle}
            onChange={setSiblingStyle}
            options={[
              { value: "plus", label: "Default" },
              { value: "labeled", label: "Labeled" },
              { value: "dot", label: "Dot" },
            ]}
          />
          <Segmented
            label="Group headers"
            value={groupHeaders}
            onChange={setGroupHeaders}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
          />
          <Segmented
            label="Column scroll"
            value={columnScroll}
            onChange={setColumnScroll}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
          />
          <Segmented
            label="Inactive columns"
            value={inactive}
            onChange={setInactive}
            options={[
              { value: "expanded", label: "Editor" },
              { value: "card", label: "Card" },
              { value: "outline", label: "Outline" },
              { value: "rail", label: "Rail" },
            ]}
          />
        </span>
      }
    >
      <HiermarkCanvas
        key={canvas.resetToken}
        rootSurfaceId="s_root"
        surfaces={canvas.surfaces}
        branchEdges={canvas.branchEdges}
        handlers={canvas.handlers}
        slots={slots}
        behavior={{ deleteSurfacePolicy: "delete-subtree" }}
        layout={{
          appearance,
          showConnectors: connectors,
          showGroupHeaders: groupHeaders === "on",
          columnScroll: columnScroll === "on",
          inactiveColumnMode: inactive,
        }}
      />
    </DemoFrame>
  );
}
