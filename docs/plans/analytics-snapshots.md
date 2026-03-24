# Analytics Snapshots — Implementation Plan

## Overview

Periodically snapshot computed analytics metrics (avg power, avg HR, avg speed, avg cadence, VO2max) and store them in the database. These become the app's "source of truth" for the user's current fitness profile, with Strava raw data as fallback.

## Architecture

```
AnalysisScreen opens
  → PowerAnalysis calculates → onStatsCalculated(powerStats)
  → HeartAnalysis calculates  → onStatsCalculated(heartStats)   [NEW]
  → SpeedAnalysis calculates  → onStatsCalculated(speedStats)   [NEW]
  → CadenceAnalysis calculates → onStatsCalculated(cadenceStats) [NEW]
  → VO2max calculated locally
  
All stats collected → check if snapshot needed (new activities since last) → POST /api/analytics-snapshot → DB
```

## Step 1: Database — `analytics_snapshots` table

**File:** `server/server.js` (in startup schema section)

```sql
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  last_activity_id BIGINT,
  avg_power NUMERIC,
  max_power NUMERIC,
  min_power NUMERIC,
  avg_hr NUMERIC,
  max_hr NUMERIC,
  min_hr NUMERIC,
  avg_speed NUMERIC,
  max_speed NUMERIC,
  min_speed NUMERIC,
  avg_cadence NUMERIC,
  max_cadence NUMERIC,
  min_cadence NUMERIC,
  vo2max NUMERIC,
  activities_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_user 
  ON analytics_snapshots(user_id, snapshot_date DESC);
```

One row per user per day (UPSERT), keeps history for trends.

## Step 2: Server endpoints

**File:** `server/server.js`

### POST /api/analytics-snapshot

- Auth required
- Body: `{ lastActivityId, power: {avg, max, min}, heart: {avg, max, min}, speed: {avg, max, min}, cadence: {avg, max, min}, vo2max, activitiesCount }`
- Check if snapshot with same `last_activity_id` already exists → skip (no new data)
- Otherwise UPSERT on `(user_id, snapshot_date)` with today's date
- Return `{ saved: true }` or `{ saved: false, reason: 'no_new_data' }`

### GET /api/analytics-snapshot/latest

- Auth required
- Returns the most recent snapshot for the user
- Used by other screens to get current fitness metrics

### GET /api/analytics-snapshot/history?limit=N

- Auth required
- Returns last N snapshots (for future trends UI)

## Step 3: Add `onStatsCalculated` callbacks to Heart/Speed/Cadence

Currently only `PowerAnalysis` reports stats back. Need to add the same pattern to:

### HeartAnalysis (`BikeLabApp/src/components/HeartAnalysis.tsx`)

- Add to props: `onStatsCalculated?: (stats: HeartStats) => void`
- Define `HeartStats`: `{ avgHR, maxHR, minHR }`
- Add `useEffect` to call back when stats are computed (same pattern as PowerAnalysis)

### SpeedAnalysis (`BikeLabApp/src/components/SpeedAnalysis.tsx`)

- Add to props: `onStatsCalculated?: (stats: SpeedStats) => void`
- Define `SpeedStats`: `{ avgSpeed, maxSpeed, minSpeed }`
- Add `useEffect` callback

### CadenceAnalysis (`BikeLabApp/src/components/CadenceAnalysis.tsx`)

- Add to props: `onStatsCalculated?: (stats: CadenceStats) => void`
- Define `CadenceStats`: `{ avgCadence, maxCadence, minCadence }`
- Add `useEffect` callback

## Step 4: Collect and save snapshot in AnalysisScreen

**File:** `BikeLabApp/src/screens/AnalysisScreen.tsx`

- Add state: `heartStats`, `speedStats`, `cadenceStats` (powerStats already exists)
- Wire new callbacks to Heart/Speed/CadenceAnalysis components
- Add `useEffect` that watches all 4 stats + VO2max:
  - When ALL are populated, check if snapshot is needed
  - Compare `lastActivityId` from activities[0].id vs last saved snapshot
  - If different → `POST /api/analytics-snapshot` with collected data
  - Store `lastSnapshotActivityId` in AsyncStorage to avoid redundant API calls

## Step 5: Create `analyticsSnapshot` utility

**New file:** `BikeLabApp/src/utils/analyticsSnapshot.ts`

- `getLatestSnapshot()` — fetches from `/api/analytics-snapshot/latest`, caches in memory + AsyncStorage
- `AnalyticsSnapshot` interface — typed shape of the snapshot data
- Export for use across the app

## Step 6: Use snapshot data across the app

Replace Strava raw data with snapshot where applicable:

- **BikeGarageScreen** — use `snapshot.avgPower` for wear calculations instead of Strava `average_watts`
- **RideAnalyticsScreen** — show user's baseline power from snapshot for comparison
- **GoalDetailsScreen** — use snapshot metrics for progress context
- **SkillsRadarChart** — already uses powerStats, no change needed
- **Fallback pattern**: `snapshot?.avgPower ?? activity.average_watts ?? 0`

## Step 7: Localization

Add keys to `en.json` / `ru.json` for any new UI elements (if we show "last updated" badge or similar).

## Migration notes

- First snapshot will be created next time user opens AnalysisScreen
- No migration needed for existing data — old users simply won't have snapshots until they visit Analysis
- Snapshot history builds up naturally over time

## Data flow diagram

```
User opens AnalysisScreen
        │
        ▼
┌─────────────────────────────────┐
│  4 Analysis components compute  │
│  Power / Heart / Speed / Cadence│
│  + VO2max in parent             │
└──────────────┬──────────────────┘
               │ onStatsCalculated callbacks
               ▼
┌─────────────────────────────────┐
│  AnalysisScreen collects all    │
│  Checks: new activities?        │
│  If yes → POST snapshot         │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  analytics_snapshots table      │
│  (user_id, date, metrics...)    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Other screens fetch latest     │
│  GET /api/analytics-snapshot    │
│  Use as primary metric source   │
└─────────────────────────────────┘
```
