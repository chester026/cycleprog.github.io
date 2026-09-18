# Analysis components — shared structure (T-5.3, audit A-24/A-28)

`PowerAnalysis` / `HeartAnalysis` / `SpeedAnalysis` / `CadenceAnalysis` /
`FTPAnalysis` were five independently hand-written components that had
drifted into five copies of largely the same layout. This folder holds the
pieces they now share; the five files under `src/components/` are thin
wrappers: metric-specific data shaping (filtering rides, computing stats,
grouping by week) + a small config object per chart, handed to these
components. Screens (`AnalysisScreen.tsx`) import the five wrapper files
unchanged — their props/exports were not touched.

## Common structure

Not all five actually share the same shape — only Heart/Speed/Cadence are
true siblings. The real picture:

| | Header (title/subtitle) | Stat cards | Charts | Per-activity list | Data source |
|---|---|---|---|---|---|
| **Power** | yes | yes (+2 conditional highlight cards) | 1 line chart, rich overlay | Top-5 cards | `activity.estimated_power` (server) + `summary.power` |
| **Heart** | yes | yes | 2 line + 1 bar + 1 donut | — | `activity.average_heartrate`/`max_heartrate`, `userProfile.hr_zones` (server `computeHrZones`/`zoneForHr`) |
| **Speed** | yes | yes (no trend badge) | 3 line + 1 bar | — | `activity.average_speed`/`max_speed`/`total_elevation_gain` |
| **Cadence** | yes | yes (+trend badge) | 2 line | — | `activity.average_cadence` |
| **FTP** | no (custom hero block) | yes (different, bigger-font layout) | none (VO2max gradient scale) | — | `GET /api/analytics/ftp` (server), `getFTPLevel` (shared) |

Heart/Speed/Cadence's "N line/bar charts, each with its own scrub- or
tap-to-reveal detail overlay" is the pattern `TrendLineChart`/`TrendBarChart`
share. Power's single chart + Top-5 list is close enough to reuse the same
shell with a different ("rich") overlay. FTP shares almost nothing
structurally with the other four (no chart-overlay hook, no per-activity
list, no `react-native-gifted-charts` at all) — it keeps its own
VO2max-scale/FTP-workload widgets in `FTPAnalysis.tsx`; only its stat-row
styling now flows through the same `StatCardRow` primitive is *not* reused
there because the visual (font sizes, gradient background) is genuinely
different — see `FTPAnalysis.tsx`'s own `statItem`/`statValue` styles.

## Shared pieces

- **`MetricAnalysisSection`** — the big translucent uppercase title +
  optional subtitle + optional "not enough data" short-circuit + container
  spacing. Used by Power/Heart/Speed/Cadence.
- **`StatCardRow`** — the horizontally-scrolling stat cards. Power's cards
  are narrower/denser (`width:140, padding:12, fontWeight:'800'`) than
  Heart/Speed/Cadence's (`width:160, padding:16, fontWeight:'700'`,
  `label color:'#b0b8c9'` vs Power's `'#888'`) — exposed as props rather than
  unified, to keep the pixel output identical.
- **`TrendLineChart`** / **`TrendBarChart`** (in `TrendLineChart.tsx`) — the
  title row + help button + scrub/tap detail overlay + gifted-charts
  `LineChart`/`BarChart` invocation. All axis/rules/point styling
  (`xAxisColor`, `rulesColor`, point radius, spacing formula, etc.) was
  byte-identical across every call site and is now baked in as fixed
  defaults; only what genuinely varied per instance (color(s), data,
  `noOfSections`, chart height, a handful of margin/offset numbers, the
  detail overlay's top offset) is a prop. `SimpleChartDetail` (Heart/Speed/
  Cadence's "Week{n}"/"Activity{n}" pill) and `RichChartDetail` (Power's
  name+date+value+pills overlay) are exported from the same file.
- **`ActivityMetricList`** — Power's Top-5 cards; unused by the other four.
- **`useChartOverlay`** (`src/hooks/useChartOverlay.tsx`, unchanged) — one
  instance per chart that needs scrub-to-reveal, created by the wrapper and
  passed into `TrendLineChart` as the `overlay` prop, rather than
  `TrendLineChart` calling the hook itself. A screen with N line charts still
  needs N instances (each chart's scrub state is independent) — the point is
  that the hook is instantiated once per *chart*, not once per chart
  *and* once again inside the shared component that renders it.
- **`groupActivitiesByIsoWeek`** (`types.ts`) — the `{[week]: {sum,count}}`
  reduction Heart/Speed/Cadence's weekly-trend charts each hand-rolled.

## Per-metric differences the wrappers still own

- **Field/formatter**: Power → `estimated_power.avgWatts` (rounded int, `W`
  suffix); Heart → `average_heartrate`/`max_heartrate` (bpm, rounded);
  Speed → `average_speed`/`max_speed` × 3.6 (km/h, 1 decimal); Cadence →
  `average_cadence` (rpm, rounded); FTP → server `/api/analytics/ftp` result
  + `getFTPLevel`/VO2max zones (shared calc, unchanged).
- **Color**: Power `#7eaaff`; Heart `#FF5E00` (+ `#00B2FF` for the speed
  overlay series); Speed `#4CAF50`/`#388B3C` (bar)/`#FF9800` (hills); Cadence
  `#8B5CF6` (+ `#00B2FF`).
- **Zones/thresholds**: Heart's HR-zone donut uses the server-derived
  `userProfile.hr_zones` (falling back to `computeHrZones`) and
  `zoneForHr` — both from `@bikelab/shared/calc`, unchanged. FTP's
  VO2max zone bands and FTP-workload level (`getFTPLevel`) are also shared
  calc, unchanged.
- **Extra widgets**: Power's "estimated" info note + Top-5 list; Heart's HR
  Zones donut (hand-drawn SVG, kept as-is — it's genuinely one-off); FTP's
  VO2max gradient scale + "facts" cards + `ImageBackground` hero block.

## Intentional micro-normalizations (documented, not silent)

A few numbers were clearly copy-paste drift rather than deliberate design
(no visible difference at the sizes involved) and were unified instead of
being threaded through as extra props:
- The scrub-overlay's shadow (`shadowOpacity`/`shadowRadius`): Cadence had
  `.4`/`12` where Heart/Speed had `.35`/`8`. Unified to `.35`/`8`.
- The scrub-overlay's divider color: Cadence used
  `rgba(255,255,255,0.15)` where Heart/Speed used `rgba(0,0,0,0.15)` (both
  render as a barely-visible hairline on the dark `#2b2b2b` background).
  Unified to `rgba(0,0,0,0.15)`.
- `chartContainer`'s `marginTop`/`overflow`/`zIndex`: Heart's version
  omitted `marginTop: 4`/`overflow: 'visible'`/`zIndex: 100` that Power/
  Speed/Cadence set explicitly; since nothing overlaps that container at a
  lower z-index and `overflow` defaults to `'visible'` in RN, this was a
  no-op difference. `TrendLineChart` always sets all three now.

## LOC

`wc -l` before → after (five wrapper files only; the ~985 lines of shared
code in this folder isn't counted against the 1500-line target — it exists
so those five didn't have to):

| File | Before | After |
|---|---|---|
| PowerAnalysis.tsx | 608 | 262 |
| HeartAnalysis.tsx | 839 | 378 |
| SpeedAnalysis.tsx | 662 | 204 |
| CadenceAnalysis.tsx | 564 | 172 |
| FTPAnalysis.tsx | 522 | 516 |
| **Total** | **3195** | **1532** |

FTPAnalysis barely moved — see the table under "Common structure" above:
it doesn't share the header/stat-cards/trend-chart/list shape at all
(no chart-overlay hook, no `react-native-gifted-charts`, no per-activity
list), so there was nothing in this folder for it to reuse beyond the one
dead-code removal noted in its own file. The other four account for the
reduction: 2673 → 1016 lines, ~62% smaller, with the removed ~1650 lines
of near-identical `LineChart`/`BarChart` JSX, touch-overlay wiring, and
per-week grouping now living once in this folder instead of four times.
