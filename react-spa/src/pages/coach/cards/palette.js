// Ring/risk colours for the score and chart cards, copied from the app's
// theme (`colors.coach.*`) so both clients bucket to the same hue. Plain
// strings rather than `var(--…)` because they feed SVG gradient stops and
// inline pill tints that are composed in JS (hexToRgba).
export const EFFORT_RINGS = {
  recovery: ['#7CC2FF', '#4DA3FF'],
  easy: ['#2FD37E', '#14A863'],
  moderate: ['#FFC24B', '#F5A11E'],
  tempo: ['#A4D96B', '#7CB342'],
  hard: ['#FF8A50', '#F26B1D'],
  heavy: ['#9B7EEA', '#6A4CCF'],
  exhausted: ['#EF6B6B', '#D84343'],
};

// Opposite direction from effort: a high recovery score is the good/green end.
export const RECOVERY_RINGS = {
  peak: ['#2FD37E', '#14A863'],
  good: ['#A4D96B', '#7CB342'],
  moderate: ['#FFC24B', '#F5A11E'],
  low: ['#FF8A50', '#F26B1D'],
  veryLow: ['#EF6B6B', '#D84343'],
};

export const NEUTRAL_RING = ['#D8D8DE', '#B0B0B7'];

export const OVERTRAINING_RISK_COLORS = {
  high: '#D84343',
  elevated: '#F26B1D',
  moderate: '#F9A825',
  low: '#7CB342',
};

/** `rgba()` of a `#rrggbb` hex at `alpha` — for StatusPill tints derived from a ring colour. */
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
