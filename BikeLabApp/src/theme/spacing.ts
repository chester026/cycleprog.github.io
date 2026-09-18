// 4-pt spacing scale — T-5.4 (audit A-27).
//
// Base unit is 4px. Most spacing in the app is a multiple of 4, but a
// handful of existing values sit off the strict grid (6, 10, 14, 18) —
// those are kept as named steps too so migrating a component to tokens
// never changes a pixel value.

export const spacing = {
  0: 0,
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  32: 32,
} as const;

export type Spacing = typeof spacing;
