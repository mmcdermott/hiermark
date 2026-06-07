import type { GutterEntry } from "../extensions/block-gutter";
import type {
  HamBlockSlotProps,
  HamBranchChildChipProps,
  HamBranchChildSummary,
  HamBlockId,
  HamEditorSlots,
  HamSurfaceId,
} from "../types";

/** Default branch affordance: a full-height `+` button on the block's right. */
export function DefaultBranchButton({ blockId, onBranch }: HamBlockSlotProps) {
  return (
    <button
      type="button"
      className="ham-branch-button"
      title="Branch this block into a new surface"
      aria-label="Branch this block into a new surface"
      data-ham-branch-for={blockId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onBranch();
      }}
    >
      +
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
  onBranch: (blockId: HamBlockId) => void;
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
  const Chip = slots?.BranchChildChip ?? DefaultBranchChildChip;
  const sorted = [...branchChildren].sort((a, b) => a.order - b.order);

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
      {entry.branchable && (
        <BranchButton
          surfaceId={surfaceId}
          blockId={entry.blockId}
          blockType={entry.blockType}
          onBranch={() => onBranch(entry.blockId)}
        />
      )}
    </div>
  );
}
