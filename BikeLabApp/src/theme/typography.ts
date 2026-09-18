// Typography tokens — T-5.4 (audit A-27). Values match font sizes,
// weights and line heights already in use across the app.

export const typography = {
  fontSize: {
    xs: 10,
    sm: 11,
    md: 12,
    base: 13,
    lg: 14,
    xl: 16,
    xxl: 20,
    xxxl: 24,
  },
  fontWeight: {
    regular: '400',
    medium: '600',
    bold: '700',
    black: '900',
  },
  lineHeight: {
    tight: 18,
  },
  letterSpacing: {
    wide: 0.3,
  },
} as const;

export type Typography = typeof typography;
