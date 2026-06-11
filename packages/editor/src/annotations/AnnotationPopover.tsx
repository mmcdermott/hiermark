import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useEffect } from "react";

import type { HiermarkAnnotationHit, HiermarkAnnotationType } from "../types";

export interface OpenAnnotation {
  hit: HiermarkAnnotationHit;
  /** The live annotation element, so the popover tracks scroll/layout shifts. */
  element: HTMLElement;
}

export interface AnnotationPopoverProps<Ctx = unknown> {
  open: OpenAnnotation | null;
  type: HiermarkAnnotationType<Ctx> | undefined;
  context: Ctx;
  onClose: () => void;
}

/**
 * Floating-UI-anchored popover that renders an annotation type's `render`
 * component when one of its hits is clicked. Collision-aware (flip/shift),
 * dismissed by outside-click or Escape, and focus-managed via `useRole`.
 */
export function AnnotationPopover<Ctx = unknown>({
  open,
  type,
  context,
  onClose,
}: AnnotationPopoverProps<Ctx>) {
  const {
    refs,
    floatingStyles,
    context: floatingContext,
  } = useFloating({
    open: !!open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(floatingContext);
  const role = useRole(floatingContext, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  useEffect(() => {
    // Reference the live element so autoUpdate re-anchors on scroll/resize and
    // attaches to the annotation's scroll ancestors.
    if (open) refs.setReference(open.element);
  }, [open, refs]);

  if (!open || !type?.render) return null;
  const Render = type.render;
  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="hiermark-annotation-popover"
        {...getFloatingProps()}
      >
        <Render hit={open.hit} context={context} close={onClose} />
      </div>
    </FloatingPortal>
  );
}
