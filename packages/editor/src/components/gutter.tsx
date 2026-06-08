import type { GutterEntry } from "../extensions/block-gutter";
import type {
  HamBlockSlotProps,
  HamBranchChildChipProps,
  HamBranchChildSummary,
  HamBranchMode,
  HamBlockId,
  HamEditorSlots,
  HamSurfaceId,
} from "../types";

/**
 * Default branch affordance: a full-height button on the block's right. Renders
 * `+` to create the first child surface, or `⊕` once the block already has a
 * child (mode `"add-sibling"`) — a clicked sibling-add creates another branch
 * alongside the existing ones.
 */
export function DefaultBranchButton({ blockId, mode, onBranch }: HamBlockSlotProps) {
  const sibling = mode === "add-sibling";
  const label = sibling
    ? "Add a sibling branch from this block"
    : "Branch this block into a new surface";
  return (
    <button
      type="button"
      className={"ham-branch-button" + (sibling ? " ham-branch-button-sibling" : "")}
      title={label}
      aria-label={label}
      data-ham-branch-for={blockId}
      data-ham-branch-mode={mode}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onBranch();
      }}
    >
      {sibling ? "⊕" : "+"}
    </button>
  );
}

/** Default branch-child chip: a pill linking to an existing child surface. */
export function DefaultBranchChildChip({ child, onOpen }: HamBranchChildChipProps) {
  return (
    <button
      type="button"
      className={"ham-branch-child-chip" + (child.active ? " ham-branch-child-chip-active" : "")}
      aria-label={`Open branch child: ${child.title ?? "Untitled"}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      → {child.title ?? "Untitled"}
    </button>
  );
}

export interface BlockGutterAffordancesProps {
  entry: GutterEntry;
  surfaceId: HamSurfaceId;
  slots?: HamEditorSlots;
  branchChildren: HamBranchChildSummary[];
  onBranch: (blockId: HamBlockId, mode: HamBranchMode) => void;
  onOpenChild: (child: HamBranchChildSummary, blockId: HamBlockId) => void;
}

/**
 * The contents React renders into a block's gutter overlay: any existing
 * branch-child chips, then the branch button — laid out on the block's right
 * (children appear to the right). Both default components are replaceable via
 * `HamEditorSlots.BlockBranchButton` / `BranchChildChip`.
 */
export function BlockGutterAffordances({
  entry,
  surfaceId,
  slots,
  branchChildren,
  onBranch,
  onOpenChild,
}: BlockGutterAffordancesProps) {
  const BranchButton = slots?.BlockBranchButton ?? DefaultBranchButton;
  // The sibling-add affordance defaults to the (mode-aware) branch button, so a
  // host can style both at once via BlockBranchButton, or swap just the
  // sibling-add via BlockSiblingBranchButton.
  const SiblingButton = slots?.BlockSiblingBranchButton ?? BranchButton;
  const Chip = slots?.BranchChildChip ?? DefaultBranchChildChip;
  const sorted = [...branchChildren].sort((a, b) => a.order - b.order);
  const Affordance = entry.mode === "add-sibling" ? SiblingButton : BranchButton;

  return (
    <div className="ham-block-gutter-affordances">
      {sorted.length > 0 && (
        <span className="ham-branch-children">
          {sorted.map((child) => (
            <Chip
              key={child.edgeId}
              surfaceId={surfaceId}
              blockId={entry.blockId}
              child={child}
              onOpen={() => onOpenChild(child, entry.blockId)}
            />
          ))}
        </span>
      )}
      {entry.mode !== "none" && (
        <Affordance
          surfaceId={surfaceId}
          blockId={entry.blockId}
          blockType={entry.blockType}
          mode={entry.mode}
          onBranch={() => onBranch(entry.blockId, entry.mode)}
        />
      )}
    </div>
  );
}
