// Border-radius tokens — T-5.4 (audit A-27).

export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 100,
} as const;

export type Radii = typeof radii;
