import { useIsMobile } from "@/hooks/use-mobile";

// Consistent responsive chart config shared by every chart card.
export function useChartConfig() {
  const isMobile = useIsMobile();
  return {
    isMobile,
    axisTick: {
      fontSize: isMobile ? 10 : 11,
      fill: "var(--color-muted-foreground)",
    } as const,
    // Axis labels are compact single tokens ("28,5 M"); this gutter fits the
    // widest one on a single line without stealing much plot area.
    yWidth: isMobile ? 46 : 56,
    // `top: 16` keeps the highest Y tick from clipping against the card edge.
    margin: {
      top: 16,
      right: isMobile ? 4 : 8,
      bottom: 0,
      left: isMobile ? 0 : -4,
    } as const,
    height: isMobile ? 240 : 260,
    legendStyle: { fontSize: isMobile ? 10 : 11, paddingTop: 4 },
  };
}

// Shared responsive padding for chart cards — trims default p-6 on mobile
// so the plot area gets ~24px more horizontal space.
export const chartCardHeader = "px-3 pt-4 pb-2 sm:px-6 sm:pt-6";
export const chartCardContent = "px-1 pb-4 pt-2 sm:px-4 sm:pb-6";
