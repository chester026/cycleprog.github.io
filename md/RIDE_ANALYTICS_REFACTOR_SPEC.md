# RideAnalyticsScreen Refactor Spec

> **Goal**: Split `RideAnalyticsScreen.tsx` (~2100 lines) into a clean deterministic dashboard + extract reusable rich-card components for the AI Coach chat. Remove all AI/LLM-driven sections from the screen — the coach handles AI analysis now.

---

## Context

`RideAnalyticsScreen` currently mixes two fundamentally different things:

1. **Deterministic computations** — Ride Quality, Effort Score, HR zones, mini charts, baseline comparison, skills changes. All computed client-side from streams data and API numbers. Instant, reliable, interactive (touch tooltips on charts).

2. **AI-driven sections** — AI Analysis highlights (regex-parsed from `/api/activities/{id}/ai-analysis` text), Suggested Goals (keyword-matched to 7 hardcoded templates), Recommended Trainings (same keyword matching). All fragile, non-contextual, and now redundant because the AI Coach does this better with full user context and function calling.

The screen is opened via "Analyse Ride" button on the Home/Garage tab, receiving `route.params.activity`.

### What already exists (AI Coach)

The coach chat is fully implemented:

- **Screen**: `screens/CoachChatScreen.tsx` — list + chat views, SSE streaming, suggested actions
- **Hook**: `hooks/useCoachChat.ts` — conversation CRUD, streaming orchestration, token batching (50ms)
- **SSE**: `utils/coachSSE.ts` — POST streaming via `react-native-sse`
- **Types**: `types/coach.ts` — `ChatMessage`, `ToolCall`, `ConversationSummary`
- **Components**: `components/coach/` — `ChatMessageBubble`, `ChatInput`, `SuggestedActions`, `StreamingDots`, `ToolCallCard`, `GoalCreatedCard`, `ConversationListItem`
- **Backend**: `server/aiCoach.js` — 11 tool executors, system prompt, GPT-4.1-mini
- **Backend route**: `POST /api/coach/chat` SSE in `server/server.js`

`ChatMessageBubble` currently renders: tool call cards (spinner → green dot), minimal markdown (bold + bullets), `GoalCreatedCard` for created goals. It does NOT yet support rich visual cards (charts, scores, comparisons).

The coach already has `initialPrompt` support — `CoachChatScreen` reads `route.params.initialPrompt` and auto-sends it as the first message.

---

## Phase 1: Clean Up RideAnalyticsScreen (Dashboard Only)

### DELETE these sections from `RideAnalyticsScreen.tsx`:

#### 1. AI Analysis + Highlights (lines ~1061–1155)
- The `aiAnalysis` state, `loadAIAnalysis` useEffect, `parseRecommendations()`, `highlights` state/parsing
- The entire "AI Highlights" horizontal ScrollView with highlight cards
- The "Full Analysis" button + Modal
- The `/api/activities/${activity.id}/ai-analysis` fetch

#### 2. Suggested Goals (lines ~1157–1186)
- `SuggestedGoal` interface, `suggestedGoals`/`allParsedGoals` state
- `mapRecommendationsToGoals()` function (lines 92–205) — the keyword-matching logic
- Goal filtering useEffect (lines 400–432)
- The entire "Suggested Goals" horizontal ScrollView
- The `userGoals` state and its `useFocusEffect` loader (lines 320–334)

#### 3. Recommended Trainings (lines ~1268–1318)
- `suggestedTrainings` state
- `mapRecommendationsToTrainings()` function (lines 208–259)
- `trainingTypes` state + its loader useEffect (lines 370–381)
- The entire "Recommended Trainings" horizontal ScrollView
- `selectedTraining`, `trainingModalVisible` state
- `TrainingDetailsModal` import and component

#### 4. Full Analysis Modal (lines ~1469–1488)
- Remove entirely — the coach replaces this

### KEEP these sections (deterministic dashboard):

| Section | Data source | Why keep |
|---|---|---|
| Ride Quality score + label | Client-side math from streams (cardiac eff, cadence, speed, HR zone eff) | Instant, deterministic |
| Mini Charts (speed/HR/cadence/power/elevation) | `getActivityStreams()` → `react-native-gifted-charts` LineChart | Interactive touch tooltips, can't fit in chat |
| Effort Score (circular SVG gauge) | Client-side: intensity × duration factor | Instant, visual |
| HR Zone Distribution (bar chart) | Client-side: Karvonen/LT calculation from HR streams | Deterministic |
| Impact on Goals (meta-goals progress cards) | `/api/activities/{id}/meta-goals-progress` | Stays, but also exposed via coach |
| Impact on Stats (skills changes grid) | `/api/skills-history/range?limit=2` | Deterministic delta |
| Similar Ride + Metrics Comparison | Client-side search in recent activities | Deterministic |
| vs Baseline (analytics snapshot) | `getLatestSnapshot()` | Deterministic |

### ADD: "Discuss with Coach" button

Add a prominent button at the top of the screen (below Ride Quality, above mini charts) that navigates to the coach with ride context:

```tsx
<TouchableOpacity
  style={styles.discussButton}
  onPress={() => {
    const distKm = (activity.distance / 1000).toFixed(1);
    const elevM = Math.round(activity.total_elevation_gain);
    const prompt = `Analyse my ride "${activity.name}" from ${rideDate}: ${distKm}km, ${elevM}m elevation, ${Math.floor(activity.moving_time / 60)} min`;
    navigation.navigate('Main', {
      screen: 'GoalsTab',
      params: {screen: 'CoachChat', params: {initialPrompt: prompt}},
    });
  }}>
  <Text style={styles.discussButtonText}>Discuss with Coach</Text>
</TouchableOpacity>
```

Style: full-width, `backgroundColor: '#274dd3'`, white text, 48px height, borderRadius 12, marginHorizontal 16.

### After cleanup

The screen should drop from ~2100 lines to ~800–900 lines. Remove all unused imports (`TrainingCard`, `TrainingDetailsModal`, `SuggestedGoal` interface). Remove the `loading` state for AI analysis (the screen no longer loads AI analysis). Remove the `showFullAnalysis` state.

---

## Phase 2: New Backend Tool — `get_activity_analysis`

Add a new tool to `server/aiCoach.js` so the coach can fetch detailed activity data for analysis.

### Tool schema

```js
{
  type: 'function',
  function: {
    name: 'get_activity_analysis',
    description:
      'Get detailed metrics for a specific activity: streams summary (HR/speed/cadence/power stats), ' +
      'HR zone time distribution, ride quality score, effort score, comparison with similar past ride, ' +
      'and delta vs the user\'s baseline averages. Use for "analyse my ride", "how was my last ride", ' +
      'or any question about a specific activity.',
    parameters: {
      type: 'object',
      properties: {
        activity_id: {
          type: 'integer',
          description: 'Strava activity ID. If not provided, uses the most recent activity.',
        },
      },
      required: [],
    },
  },
}
```

### Tool executor

The executor should replicate the **deterministic computations** from `RideAnalyticsScreen` server-side. This is the key insight: the dashboard computes Ride Quality, Effort Score, HR zones etc. in the RN client from streams data. The coach can't use `react-native-gifted-charts`, but it CAN receive the computed numbers and describe them in natural language.

```js
async get_activity_analysis(args, { userId }) {
  const activities = await getCachedActivities(userId);
  if (activities.length === 0) return { note: 'No activities available.' };

  let activity;
  if (args?.activity_id) {
    activity = activities.find(a => a.id === Number(args.activity_id));
    if (!activity) return { error: 'Activity not found' };
  } else {
    // Most recent
    activity = [...activities].sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    )[0];
  }

  // Get user profile for HR zone calculations
  const profileResult = await pool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1', [userId]
  );
  const profile = profileResult.rows[0] || {};

  // Get analytics snapshot for baseline comparison
  const snapshotResult = await pool.query(
    'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [userId]
  );
  const snapshot = snapshotResult.rows[0] || null;

  // Build result — note: we do NOT replicate the full streams-based
  // Ride Quality / Effort Score / HR Zone computation here (that requires
  // fetching streams from Strava, which is a heavy call). Instead we return
  // the summary metrics the model needs to give a good analysis.
  const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  const distKm = round1((activity.distance || 0) / 1000);
  const movingMin = round1((activity.moving_time || 0) / 60);
  const avgSpeedKmh = round1((activity.average_speed || 0) * 3.6);
  const maxSpeedKmh = round1((activity.max_speed || 0) * 3.6);

  const result = {
    activity: {
      id: activity.id,
      name: activity.name,
      date: activity.start_date,
      distance_km: distKm,
      moving_time_min: movingMin,
      elevation_gain_m: Math.round(activity.total_elevation_gain || 0),
      avg_speed_kmh: avgSpeedKmh,
      max_speed_kmh: maxSpeedKmh,
      avg_hr_bpm: activity.average_heartrate || null,
      max_hr_bpm: activity.max_heartrate || null,
      avg_cadence_rpm: activity.average_cadence || null,
      avg_watts: activity.average_watts || null,
      max_watts: activity.max_watts || null,
      weighted_avg_watts: activity.weighted_average_watts || null,
    },
  };

  // Baseline comparison
  if (snapshot) {
    result.vs_baseline = {};
    if (activity.average_speed && snapshot.avg_speed) {
      result.vs_baseline.speed_kmh = {
        ride: avgSpeedKmh,
        avg: round1(Number(snapshot.avg_speed)),
        diff: round1(avgSpeedKmh - Number(snapshot.avg_speed)),
      };
    }
    if (activity.average_heartrate && snapshot.avg_hr) {
      result.vs_baseline.hr_bpm = {
        ride: activity.average_heartrate,
        avg: round1(Number(snapshot.avg_hr)),
        diff: round1(activity.average_heartrate - Number(snapshot.avg_hr)),
      };
    }
    if (activity.average_watts && snapshot.avg_power) {
      result.vs_baseline.power_watts = {
        ride: activity.average_watts,
        avg: round1(Number(snapshot.avg_power)),
        diff: round1(activity.average_watts - Number(snapshot.avg_power)),
      };
    }
    if (activity.average_cadence && snapshot.avg_cadence) {
      result.vs_baseline.cadence_rpm = {
        ride: activity.average_cadence,
        avg: round1(Number(snapshot.avg_cadence)),
        diff: round1(activity.average_cadence - Number(snapshot.avg_cadence)),
      };
    }
  }

  // Find similar past ride for comparison
  const others = activities.filter(a => a.id !== activity.id);
  const similar = others.find(a => {
    const distDiff = Math.abs((a.distance || 0) - (activity.distance || 0));
    const elevDiff = Math.abs((a.total_elevation_gain || 0) - (activity.total_elevation_gain || 0));
    return distDiff < (activity.distance || 1) * 0.4 &&
           elevDiff < Math.max((activity.total_elevation_gain || 1) * 0.6, 200);
  });

  if (similar) {
    result.similar_ride = {
      name: similar.name,
      date: similar.start_date,
      distance_km: round1((similar.distance || 0) / 1000),
      avg_speed_kmh: round1((similar.average_speed || 0) * 3.6),
      avg_hr_bpm: similar.average_heartrate || null,
      avg_watts: similar.average_watts || null,
      avg_cadence_rpm: similar.average_cadence || null,
    };
  }

  // Skills delta (last 2 snapshots)
  try {
    const skillsResult = await pool.query(
      'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 2',
      [userId]
    );
    if (skillsResult.rows.length >= 2) {
      const [current, previous] = skillsResult.rows;
      const skillNames = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];
      const deltas = {};
      for (const s of skillNames) {
        const diff = Math.round((current[s] || 0)) - Math.round((previous[s] || 0));
        if (diff !== 0) deltas[s] = { current: Math.round(current[s] || 0), previous: Math.round(previous[s] || 0), diff };
      }
      if (Object.keys(deltas).length > 0) result.skills_delta = deltas;
    }
  } catch (e) { /* non-critical */ }

  return result;
}
```

### Add to TOOLS array

Add the schema object to the `TOOLS` array in `aiCoach.js` (after `get_recent_activities`).

### Add to ToolCallCard labels

In `components/coach/ToolCallCard.tsx`, add:

```ts
get_activity_analysis: 'coach.toolActivityAnalysis',
```

And add the i18n key `coach.toolActivityAnalysis` = "Analyzing your ride..." (and the Russian equivalent).

---

## Phase 3: Extract Rich Card Components

Extract visual components from `RideAnalyticsScreen` into standalone, reusable card components that can be rendered both on the dashboard AND inside coach chat bubbles.

### 3A. `components/coach/RideScoreCard.tsx`

A compact card showing Ride Quality OR Effort Score. Used in the coach chat when the model calls `get_activity_analysis`.

```tsx
interface RideScoreCardProps {
  label: string;          // "Ride Quality" | "Effort Score"
  score: number;          // 0-100
  scoreLabel: string;     // "Excellent" | "Tempo" etc.
  advice?: string;        // short tip
}
```

Renders a compact version of the existing Ride Quality header block: colored dot + label + score number + advice text. Does NOT include the full SVG circular gauge (too complex for a chat bubble; keep that on the dashboard only).

Style: dark card (`backgroundColor: 'rgba(0,0,0,0.04)'` for light theme, matches coach chat), 280px max width, padding 14.

### 3B. `components/coach/MetricComparisonCard.tsx`

Shows "vs Baseline" or "vs Similar Ride" comparison rows.

```tsx
interface MetricRow {
  label: string;
  oldValue: string;
  newValue: string;
  isPositive?: boolean;  // green highlight
}

interface MetricComparisonCardProps {
  title: string;          // "vs Your Averages" | "vs Morning Ride 12.06"
  subtitle?: string;      // date or description
  rows: MetricRow[];
}
```

Renders the comparison rows in a compact card. Reuse the existing `comparisonRow` styling pattern from `RideAnalyticsScreen`.

### 3C. `components/coach/SkillsDeltaCard.tsx`

Shows skills changes in a compact grid.

```tsx
interface SkillChange {
  name: string;
  previous: number;
  current: number;
  diff: number;
}

interface SkillsDeltaCardProps {
  changes: SkillChange[];
}
```

Renders a 2-column grid of skill changes with green/red diff badges. Same visual as the "Impact on Stats" section but as a standalone card.

---

## Phase 4: Render Rich Cards in ChatMessageBubble

### Modify `ChatMessageBubble.tsx`

After the coach calls `get_activity_analysis`, it gets structured data back. The model should include key numbers in its text response. But we can ALSO render rich cards based on the tool result.

**Approach**: When a `tool_result` for `get_activity_analysis` comes in with data, render the appropriate cards below the text bubble.

In `ChatMessageBubble.tsx`:

```tsx
import {RideScoreCard} from './RideScoreCard';
import {MetricComparisonCard} from './MetricComparisonCard';
import {SkillsDeltaCard} from './SkillsDeltaCard';

// Inside the component, after the existing GoalCreatedCard logic:
const activityAnalysisCall = message.toolCalls?.find(
  tc => tc.name === 'get_activity_analysis' && tc.status === 'done' && tc.result?.activity,
);
```

Then in the render, after the `{createdGoalCall && <GoalCreatedCard .../>}` block:

```tsx
{activityAnalysisCall && (
  <View style={styles.richCards}>
    {activityAnalysisCall.result.vs_baseline && (
      <MetricComparisonCard
        title={t('coach.vsBaseline')}
        rows={Object.entries(activityAnalysisCall.result.vs_baseline).map(
          ([key, val]: [string, any]) => ({
            label: key.replace(/_/g, ' '),
            oldValue: `${val.avg}`,
            newValue: `${val.ride}`,
            isPositive: val.diff > 0,
          })
        )}
      />
    )}
    {activityAnalysisCall.result.similar_ride && (
      <MetricComparisonCard
        title={`vs ${activityAnalysisCall.result.similar_ride.name}`}
        subtitle={new Date(activityAnalysisCall.result.similar_ride.date).toLocaleDateString()}
        rows={[/* build rows from similar_ride vs activity */]}
      />
    )}
    {activityAnalysisCall.result.skills_delta && (
      <SkillsDeltaCard
        changes={Object.entries(activityAnalysisCall.result.skills_delta).map(
          ([name, val]: [string, any]) => ({ name, ...val })
        )}
      />
    )}
  </View>
)}
```

Add style:
```tsx
richCards: {
  marginTop: 8,
  gap: 8,
  maxWidth: '90%',
},
```

---

## Phase 5: Update System Prompt

In `aiCoach.js` `buildSystemPrompt()`, add to the Tools section:

```
- When analyzing a specific ride, call get_activity_analysis first to get the real numbers. Cite specific metrics: speed, HR, power, cadence, elevation. Compare against baseline and similar past rides when available. If skills changed, mention what improved or declined.
```

---

## File Changes Summary

| File | Action |
|---|---|
| `screens/RideAnalyticsScreen.tsx` | **HEAVY EDIT** — delete AI Analysis, Suggested Goals, Recommended Trainings, Full Analysis Modal. Add "Discuss with Coach" button. Remove ~1200 lines of code + styles. |
| `server/aiCoach.js` | **EDIT** — add `get_activity_analysis` to TOOLS array + add executor |
| `components/coach/RideScoreCard.tsx` | **NEW** — compact score card |
| `components/coach/MetricComparisonCard.tsx` | **NEW** — comparison rows card |
| `components/coach/SkillsDeltaCard.tsx` | **NEW** — skills delta grid card |
| `components/coach/ChatMessageBubble.tsx` | **EDIT** — import + render rich cards from `get_activity_analysis` results |
| `components/coach/ToolCallCard.tsx` | **EDIT** — add `get_activity_analysis` label |
| i18n files | **EDIT** — add `coach.toolActivityAnalysis`, `coach.vsBaseline`, `coach.discussWithCoach` keys |

### Files NOT changed

- `CoachChatScreen.tsx` — no changes needed, `initialPrompt` flow already works
- `useCoachChat.ts` — no changes needed, tool results already flow through
- `coachSSE.ts` — no changes needed
- `types/coach.ts` — no changes needed (ToolCall is already generic)
- `GoalDetailsScreen.tsx` — untouched

---

## Implementation Order

1. **Backend first**: Add `get_activity_analysis` tool to `aiCoach.js` (schema + executor). Update system prompt.
2. **Dashboard cleanup**: Strip AI sections from `RideAnalyticsScreen.tsx`, add "Discuss with Coach" button.
3. **Rich cards**: Create `RideScoreCard`, `MetricComparisonCard`, `SkillsDeltaCard`.
4. **Chat integration**: Wire rich cards into `ChatMessageBubble.tsx`, add `ToolCallCard` label.
5. **i18n**: Add all new translation keys (en + ru).
6. **Verify**: `tsc --noEmit` must pass. Test: open Analyse Ride → dashboard loads without AI sections → tap "Discuss with Coach" → coach chat opens → send "analyse my last ride" → coach calls `get_activity_analysis` → rich cards render inline.

---

## Existing Patterns to Follow

- **Dark theme** on dashboard (`#111216` background, `rgba(255,255,255,0.X)` text) — keep unchanged
- **Light theme** in coach chat (`#fafafa` background, `#1a1a1a` text) — rich cards should match coach theme
- **Card sizing**: dashboard cards are 212px wide; coach cards should be `maxWidth: '85%'` to match bubble width
- **Navigation**: use `navigation.navigate('Main', { screen: 'GoalsTab', params: { screen: 'CoachChat', params: { initialPrompt } } })` — this is the existing pattern from the Suggested Goals cards
- **Tool result flow**: tool results arrive via SSE `tool_result` event → `useCoachChat` attaches to the ToolCall object → `ChatMessageBubble` reads `message.toolCalls` — same pattern as `GoalCreatedCard`
- **i18n**: all user-facing strings via `useTranslation()` / `t()`, keys in `en.json` + `ru.json`

---

## What NOT to Do

- Do NOT add streams fetching to the backend tool. Streams are large arrays (thousands of data points per channel) that belong on the client for charting. The coach doesn't need raw streams — it needs computed summaries.
- Do NOT remove `RideAnalyticsScreen` from the navigation stack. It stays as a dashboard. Only the AI-driven sections are removed.
- Do NOT change the Effort Score / Ride Quality computation logic on the dashboard — it works, leave it.
- Do NOT modify `GoalDetailsScreen`, `useCoachChat`, `coachSSE`, or `CoachChatScreen` — they don't need changes.
- Do NOT create a separate screen for coach ride analysis — it goes through the existing `CoachChatScreen` via `initialPrompt`.
