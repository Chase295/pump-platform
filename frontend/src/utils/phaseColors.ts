// Curated palette for phases 1-10
const PHASE_PALETTE: string[] = [
  '#2196f3', // 1 - blue
  '#ff9800', // 2 - orange
  '#4caf50', // 3 - green
  '#00bcd4', // 4 - cyan
  '#e91e63', // 5 - pink
  '#ffeb3b', // 6 - yellow
  '#8bc34a', // 7 - light green
  '#03a9f4', // 8 - light blue
  '#ff5722', // 9 - deep orange
  '#673ab7', // 10 - deep purple
];

// Fixed colors for system phases
const SYSTEM_COLORS: Record<number, string> = {
  99: '#f44336',  // Finished - red
  100: '#9c27b0', // Graduated - purple
};

/**
 * Returns a consistent color for a given phase ID.
 * - Phases 1-10: curated palette
 * - Phases 99, 100: fixed system colors
 * - Phases 11+: HSL golden-angle fallback
 */
export const getPhaseColor = (id: number): string => {
  if (SYSTEM_COLORS[id]) return SYSTEM_COLORS[id];
  if (id >= 1 && id <= PHASE_PALETTE.length) return PHASE_PALETTE[id - 1];
  // Golden-angle HSL fallback for phases beyond the palette
  const hue = ((id - 1) * 137.508) % 360;
  return `hsl(${Math.round(hue)}, 70%, 55%)`;
};
