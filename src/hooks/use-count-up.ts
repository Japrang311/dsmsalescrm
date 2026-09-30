import { useEffect, useRef, useState } from "react";

const DURATION_MS = 550;

// Eases out so the number decelerates into its final value instead of stopping
// dead — the same feel as the progress bars it sits next to.
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts from the previously rendered value up to `value`. Returns `value`
 * unchanged during SSR and whenever the viewer asked for reduced motion, so
 * the number is always correct even if the animation never runs.
 */
export function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setDisplay(from + (value - from) * easeOut(t));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      // Land exactly on the target so the formatted text is never off by a
      // rounding error.
      setDisplay(value);
      fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== undefined)
        cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value]);

  return display;
}
