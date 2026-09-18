# Theme foundation (T-5.4, audit A-27)

Semantic design tokens for `BikeLabApp`. Goal: stop every screen/component
from hand-rolling its own hex colors, spacing, radii and shadows, without
changing a single visible pixel today. The app is dark-first (dark screen
backgrounds, occasional bright "pop" cards); **all token values below are
copied 1:1 from the existing raw literals** — nothing was re-colored.

## Files

- `colors.ts` — semantic color tokens + `withOpacity(hex, alpha)` helper.
- `spacing.ts` — 4-pt spacing scale (`spacing[4]`, `spacing[16]`, ...).
- `typography.ts` — font sizes / weights / line heights / letter spacing.
- `radii.ts` — border-radius tokens.
- `shadows.ts` — shadow presets (`shadows.card`, `shadows.buttonPrimary`).
- `index.ts` — exports `theme`, `useTheme()`, `ThemeProvider`, `makeStyles(fn)`.
- `theme.test.ts` — snapshot + shape test for the token tree.

## Usage

```tsx
import {makeStyles, useTheme} from '../theme';

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: theme.spacing[16],
  },
}));

// or, inside a component body:
const theme = useTheme();
```

`ThemeProvider` isn't required for `useTheme()` to work today (the context
has `theme` as its default value), but mounting it now means a future
light-mode theme only requires swapping what the provider passes down —
no call site changes. **App.tsx wiring (for the owning agent):**

```tsx
import {ThemeProvider} from './src/theme';

export default function App() {
  return (
    <ThemeProvider>
      {/* ...existing tree... */}
    </ThemeProvider>
  );
}
```

## Raw-color inventory (source of the token mapping)

Generated with:

```
grep -rhoE "#[0-9a-fA-F]{3,8}\b" src | sort | uniq -c | sort -rn
grep -rhoE "rgba\([^)]*\)" src | sort | uniq -c | sort -rn
```

Top hex literals across `src` (count, value) at the time this module was
written — kept here so the next migration wave knows which token a given
raw literal should become:

| count | hex | → token |
|---|---|---|
| 220 | `#fff` | `colors.text.inverse` / `colors.surfaceElevated` |
| 110 | `#274dd3` | `colors.accent` |
| 104 | `#1a1a1a` | `colors.text.primary` |
| 92 | `#888` | `colors.text.muted` |
| 80 | `#1A1A1A` | `colors.text.primary` / `colors.surface` |
| 39 | `#666` | `colors.text.secondary` |
| 34 | `#8E8E93` | (iOS gray — not yet tokenized; candidate `colors.text.muted` alt) |
| 33 | `#999` | (untokenized muted gray) |
| 30 | `#333` | (untokenized dark border/text) |
| 25 | `#ffffff` | `colors.text.inverse` / `colors.surfaceElevated` |
| 25 | `#FF5E00` | `colors.chart.series3` (brand orange / "most-recommended" badge) |
| 25 | `#000` | (untokenized black) |
| 21 | `#10101E` | `colors.shadow` |
| 19 | `#ccc` | (untokenized light border) |
| 18 | `#4CAF50` | (untokenized green — close to `colors.success`) |
| 17 | `#aaa` | (untokenized muted gray) |
| 17 | `#F5F5F5` | (untokenized light background) |
| 16 | `#8B5CF6` | `colors.chart.series4` |
| 15 | `#e3e3e3` | (untokenized light border) |
| 15 | `#C7C7CC` | (untokenized iOS separator) |
| 15 | `#0a0a0a` | `colors.background` |
| 14 | `#ef4444` | `colors.danger` |
| 13 | `#10b981` | `colors.success` / `colors.chart.series2` |
| 12 | `#555` | (untokenized gray) |
| 11 | `#222` | (untokenized dark gray) |
| 11 | `#0E0E12` | (untokenized near-black text — close to `colors.text.primary`) |
| 10 | `#f0f0f0` | (untokenized light background) |
| 9 | `#f1f0f0` | (untokenized light background) |
| 9 | `#e0e0e0` | (untokenized light border) |
| 8 | `#00B2FF` | `colors.chart.series5` |
| 7 | `#FC5200` | (untokenized — Strava brand orange, keep literal) |
| 6 | `#f59e0b` | `colors.warning` / `colors.chart.series6` |
| 6 | `#ECECEC` | `colors.border` |
| 5 | `#16a34a` | (untokenized green — TrendBadge positive) |

Full-precision rgba literals worth noting for the next wave:

- `rgba(255,255,255,0.5)` / `rgba(255, 255, 255, 0.5)` (26 combined) and the
  other `rgba(255,255,255, N)` variants → all reproducible as
  `withOpacity(colors.text.inverse, N)`.
- `rgba(0, 0, 0, 0.5)` and siblings → `withOpacity('#000000', N)`.
- `rgba(39, 77, 211, N)` (accent tints, 10 combined) → these are
  `colors.accent` at various alphas; `colors.accentSurface` /
  `colors.accentSurfaceBorder` cover the two exact values used by the
  migrated leaf components (`ActivityCard`'s "AI Analytic" pill).

`Dimensions.get(` appeared at 17 call sites (19 total calls) across `src`
at inventory time. Only one of the 5 leaf components owned by this wave
(`TrainingCard.tsx`) referenced it, and that binding (`screenWidth`) was
dead code (computed, never read) — removed rather than migrated to
`useWindowDimensions`. The other 16 call sites are in screens/components
outside this wave's ownership and are unchanged.

## What's still untokenized

Grays like `#8E8E93`, `#999`, `#333`, `#ccc`, `#4CAF50`, `#C7C7CC`,
`#f0f0f0`, `#e0e0e0`, `#555`, `#222`, `#0E0E12`, and iOS-style separators
are widespread but weren't pulled into a token in this pass — they belong
to screens outside this wave's file ownership (`src/theme/**` +
`PrimaryButton`/`StatsCard`/`TrendBadge`/`ActivityCard`/`TrainingCard`
only). When the next wave migrates those screens, either reuse an existing
token where the value already matches (e.g. `#10b981`/`#16a34a` are both
"green" — decide if they should collapse to one `colors.success`, which
*would* be a visible change and needs a design call) or extend `colors.ts`
with a new named token and update this table.
