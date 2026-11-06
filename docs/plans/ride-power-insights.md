# Ride screen: Power block (implemented 2026-11-06)

Owner brief: after the stream charts and before the time-in-zones bars, for rides with a
power meter, show power in a way that points at momentum and makes the rider want to go
again — not a table of deficits. Standard five durations (5 s / 1 / 5 / 20 / 60 min).

## Principles (how the copy and the rows are chosen)

1. **Lead with the ride's strongest duration.** Rank this ride against every power-meter ride
   of the last 12 weeks per duration; the lowest rank (longer duration wins ties) becomes the
   headline when it is top-3: "New best 20-min power of the last 12 weeks" / "#2 5-min effort".
2. **Judge a ride by what it was.** Intensity from IF (NP/FTP): recovery < 0.65 < endurance
   < 0.8 < tempo < 0.9 < threshold < 1.05 < race. On recovery/endurance rides the 5 s / 1 min
   rows show watts but no gap badge (nobody was sprinting) unless they are a top-3 or a best.
3. **Trend, not a point.** Weekly bests for 5 and 20 min over 12 weeks as a bar sparkline with
   the change since the first week; only drawn with ≥ 3 weeks of data.
4. **Next step, not deficit.** Rows show "+8 W to best" with a fill bar at 96 %, or a BEST pill,
   or "#2 of 14". Pacing line is advice ("hold back on the first climb"), not a verdict.

## Pieces

- `packages/shared/src/calc/ridePowerInsights.ts` — `ridePowerInsights()`: ranks, window best,
  gap, highlight, weekly trends, pacing kind. 100 % coverage.
- `GET /api/activities/:id/power-breakdown` (contract `activities.powerBreakdown`) →
  `{ breakdown, insights }`; `services/rideAnalysis.js#getRidePowerInsights` reuses
  `powerProfile.getRideEffortsHistory` (per-ride efforts cached in `activity_analysis`), so a
  ride open costs no Strava call once the profile has been computed.
- App: `data/hooks/useRidePowerInsights.ts`, `screens/RideAnalytics/PowerInsights.tsx` (+
  `powerInsightsLib.ts` for the copy decisions), wired through `RideStats`' `powerSlot` ahead
  of `PowerProfileBars`. i18n under `rideAnalytics.power.*` (en/ru).

## Not done / later

- Climb rows compare climbs within the ride only; "vs your typical climb power" needs climb
  segments aggregated across rides (ride_power rows for the window) — a follow-up.
- Web (react-spa) does not render the block yet; the calc and the endpoint are shared, so it is
  a component-only job there.
