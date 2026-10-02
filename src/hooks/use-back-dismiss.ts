import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

// Open overlays, oldest first. Only the newest answers a Back press, so
// stacked overlays (a Select inside a Dialog) close one layer per press.
const openOverlays: object[] = [];

// While `open`, the browser's Back button (and the phone's back gesture)
// calls `dismiss` and stays on the page, instead of leaving it. No history
// entries are added, so closing the overlay normally leaves history untouched.
export function useBackDismiss(open: boolean, dismiss: () => void) {
  // No router outside the app (isolated renders/tests): nothing to intercept.
  const router = useRouter({ warn: false });
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  });

  useEffect(() => {
    if (!open || !router) return;
    const token = {};
    openOverlays.push(token);
    const unblock = router.history.block({
      enableBeforeUnload: false,
      blockerFn: ({ action }) => {
        if (action !== "BACK") return false;
        if (openOverlays[openOverlays.length - 1] !== token) return false;
        dismissRef.current();
        return true;
      },
    });
    return () => {
      unblock();
      openOverlays.splice(openOverlays.indexOf(token), 1);
    };
  }, [open, router]);
}

type OverlayProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

// For Radix-style roots that may be controlled or uncontrolled: always run
// them controlled so the open state is known, and wire in useBackDismiss.
export function useBackDismissibleOpen({
  open,
  defaultOpen = false,
  onOpenChange,
}: OverlayProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const isControlled = open !== undefined;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  useBackDismiss(isOpen, () => handleOpenChange(false));
  return { open: isOpen, onOpenChange: handleOpenChange };
}
