// Semantic color tokens — T-5.4 (audit A-27).
//
// The app today is dark-first with occasional bright "pop" cards (white
// cards with dark ink text, floating on the dark screen background). These
// tokens preserve every hex value already in use across the app; nothing
// was re-colored. See `README.md` in this folder for the full raw-color
// inventory and how it maps into these names.

/** Converts a `#rgb`/`#rrggbb` hex string to `rgba(r, g, b, alpha)`.
 * Used instead of hand-picking dozens of one-off translucency tokens —
 * matches the app's existing `rgba(R, G, B, alpha)` literals exactly
 * (e.g. `withOpacity('#1a1a1a', 0.7)` === `'rgba(26, 26, 26, 0.7)'`).
 */
export function withOpacity(hex: string, alpha: number): string {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map(c => c + c)
      .join('');
  }
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const colors = {
  // App/screen background (modals, ShareStudio dark templates: #0a0a0a).
  background: '#0a0a0a',
  // Dark elevated surface (cards/panels sitting on `background`).
  surface: '#1A1A1A',
  // Bright "pop" surface — white cards used by ActivityCard/StatsCard and
  // PrimaryButton's secondary variant.
  surfaceElevated: '#ffffff',
  // Hairline border on a bright surface (ActivityCard card border).
  border: '#ECECEC',
  // Slightly lighter hairline border variant (PrimaryButton secondary).
  borderSubtle: '#EFEFEF',

  text: {
    // Dark ink, used on bright surfaces (#1a1a1a / #1A1A1A in the wild).
    primary: '#1a1a1a',
    // Secondary/dimmed text on bright surfaces (#666).
    secondary: '#666666',
    // Muted/tertiary text (#888).
    muted: '#888888',
    // Text on dark/accent surfaces (#fff).
    inverse: '#ffffff',
  },

  // Brand blue — primary CTA / active state (#274dd3).
  accent: '#274dd3',
  // Tinted accent surface + border, used behind small accent chips
  // (ActivityCard's "AI Analytic" pill).
  accentSurface: 'rgba(39, 77, 211, 0.08)',
  accentSurfaceBorder: 'rgba(39, 77, 211, 0.1)',

  success: '#10b981',
  // Distinct darker green used by the scoreDelta/TrendBadge convention
  // (ProgressChart, TrendBadge, PowerAnalysis/HeartAnalysis/
  // CadenceAnalysis/GarageScreen positive-trend text) — kept separate from
  // `success` since it's a different shade already in use, not a typo.
  successStrong: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
  // Light pink danger surface, used by PrimaryButton's danger variant (#FDECEC).
  dangerSurface: '#FDECEC',

  // Shadow color for elevated bright cards (#10101E) — see shadows.ts.
  shadow: '#10101E',
  // Pure black, used as the base for `withOpacity`-derived translucent
  // overlays/muted text on bright surfaces (e.g. StatsCard's statLabel).
  black: '#000000',
  // Dark scrim over background images (TrainingCard overlay).
  scrim: 'rgba(0, 0, 0, 0.3)',

  chart: {
    series1: '#274dd3',
    series2: '#10b981',
    series3: '#FF5E00',
    series4: '#8B5CF6',
    series5: '#00B2FF',
    series6: '#f59e0b',
  },
} as const;

export type Colors = typeof colors;
