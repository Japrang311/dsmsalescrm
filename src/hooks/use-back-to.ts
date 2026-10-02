import { useEffect } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

// Pathname shown at each browser-history index during this session, so a
// "Kembali" button can tell whether the previous entry is really its list.
const pathAtIndex = new Map<number, string>();

// Mount once in the app shell.
export function useRecordVisitedPaths() {
  const index = useRouterState({
    select: (s) => s.location.state.__TSR_index,
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (index !== undefined) pathAtIndex.set(index, pathname);
  }, [index, pathname]);
}

// A "Kembali" button: returns to the list through browser history when that is
// where the user came from (so the list keeps its filters), otherwise opens
// the list as a fresh visit.
export function useBackTo(listPath: string) {
  const router = useRouter();
  const navigate = useNavigate();
  return () => {
    const index = router.state.location.state.__TSR_index;
    if (index !== undefined && pathAtIndex.get(index - 1) === listPath) {
      router.history.back();
    } else {
      void navigate({ to: listPath });
    }
  };
}
