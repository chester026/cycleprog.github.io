# Apple Health Integration Spec — BikeLab

> **Goal**: Pull body & recovery data from Apple Health into BikeLab so the AI Coach reasons through the lens of rider health — sleep, HRV, resting HR, weight trends — without being intrusive or medical.

---

## 1. Why This Matters for a Cycling Coach

BikeLab currently knows the rider's *training* (Strava activities, power, HR during rides) but nothing about their *recovery*. The coach has no way to say "you slept 5 hours, maybe skip intervals today" or "your resting HR is 8bpm above baseline — you might be overreaching."

Apple Health bridges this gap. Apple Watch (+ Oura, Whoop, Garmin — all write to HealthKit) provides overnight biometrics that are the best non-invasive proxy for recovery readiness. The data is already sitting on the user's phone — we just need to read it.

### What the coach gains

| Signal | Training impact |
|---|---|
| **Resting HR trend** | Elevated RHR (5-10bpm above baseline) = incomplete recovery, illness, or overtraining. Coach should suggest easier sessions. |
| **HRV trend** | HRV below personal baseline = sympathetic dominance, poor recovery. HRV above = parasympathetic dominance, ready to push. |
| **Sleep duration + stages** | <6h or poor deep sleep = impaired glycogen replenishment, hormonal recovery. Coach should scale back intensity. |
| **Weight trend** | Gradual changes affect power-to-weight, climbing performance, FTP estimates. Sudden drops may signal dehydration. |
| **Body fat %** (if available) | Better power-to-weight context than raw weight alone. |
| **VO2max** (Apple's estimate) | Cross-reference with BikeLab's own VO2max from analytics snapshots. |
| **Active Energy / Basal Energy** | Total daily load beyond cycling — useful for caloric guidance. |

### What the coach does NOT do

- **No medical advice.** The coach is a cycling training advisor, not a doctor.
- **No alarmist language.** "Your HRV dropped" → "Consider an easier ride today" (not "warning: health risk").
- **No unsolicited health commentary.** Health data enriches ride analysis and training suggestions — the coach doesn't open conversations with "I noticed your sleep was bad."
- **No sensitive data storage.** Health data stays on-device, synced to a local cache — NOT sent to the backend/Postgres.

---

## 2. Library Choice

### Recommended: `react-native-health` (AE Studio)

| | react-native-health | @kingstinct/react-native-healthkit |
|---|---|---|
| **npm** | ~30K weekly downloads | ~3K weekly |
| **API style** | Callback-based (simple) | Promise + TypeScript-first |
| **Coverage** | 70+ data types, all we need | 100+ types, closer to native |
| **Arch** | Old Architecture (bridge) | Nitro Modules (JSI/New Arch) |
| **Swift rewrite** | In progress, opt-in soon | Already Swift |
| **Maturity** | 1.1K stars, battle-tested | 400 stars, actively maintained |
| **Our RN setup** | Old Arch (Hermes, no New Arch) | Requires `react-native-nitro-modules` |

**Pick `react-native-health`** — matches our current architecture, lower risk, extensive docs. Migrate to `@kingstinct` if/when we enable New Architecture.

```
npm install react-native-health
cd ios && pod install
```

### Xcode setup required

1. **Capabilities**: Add "HealthKit" capability to the app target in Xcode
2. **Info.plist**: Add usage descriptions:
   - `NSHealthShareUsageDescription` — "BikeLab reads your health data to provide personalized coaching based on your recovery, sleep, and body metrics."
   - `NSHealthUpdateUsageDescription` — (not needed initially — read-only)
3. **Entitlements**: `com.apple.developer.healthkit` = YES
4. **Background delivery** (optional, Phase 2): `com.apple.developer.healthkit.background-delivery`

### App Store privacy

- Declare "Health & Fitness" data collection in App Privacy Details
- Purpose: "App Functionality" (not analytics, not advertising)
- Apple requires a clear privacy policy explaining health data usage
- Health data MUST NOT be used for advertising — we don't, but the policy must say so

---

## 3. Data We Read from HealthKit

### Tier 1 — Core (request on first sync)

| HealthKit Type | Permission Constant | Method | Cycling relevance |
|---|---|---|---|
| Resting Heart Rate | `RestingHeartRate` | `getRestingHeartRateSamples` | Recovery baseline — most reliable single recovery indicator |
| Heart Rate Variability | `HeartRateVariability` | `getHeartRateVariabilitySamples` | SDNN, recovery readiness |
| Sleep Analysis | `SleepAnalysis` | `getSleepSamples` | Duration + stages (INBED/ASLEEP/DEEP/CORE/REM) |
| Weight (Body Mass) | `Weight` | `getLatestWeight` + `getWeightSamples` | Power-to-weight, trend tracking |
| VO2 Max | `Vo2Max` | `getVo2MaxSamples` | Cross-ref with BikeLab's own estimate |
| Active Energy Burned | `ActiveEnergyBurned` | `getActiveEnergyBurned` | Total daily load beyond cycling |

### Tier 2 — Enhanced (request if user opts in)

| HealthKit Type | Permission Constant | Method | Cycling relevance |
|---|---|---|---|
| Body Fat % | `BodyFatPercentage` | `getBodyFatPercentageSamples` | Better power-to-weight context |
| Respiratory Rate | `RespiratoryRate` | `getRespiratoryRateSamples` | Overtraining / illness signal |
| Blood Oxygen (SpO2) | `OxygenSaturation` | `getOxygenSaturationSamples` | Altitude adaptation, overtraining |
| Walking HR Average | `WalkingHeartRateAverage` | `getWalkingHeartRateAverage` | Cardiovascular fitness trend independent of rides |
| Distance Cycling | `DistanceCycling` | `getDistanceCycling` | Cross-ref with Strava |

### NOT reading (out of scope)

Blood pressure, blood glucose, medications, clinical records, reproductive health, mental health — no cycling relevance, high privacy sensitivity.

---

## 4. Architecture — On-Device Only

**Critical design decision: health data NEVER leaves the phone.**

```
┌─────────────────────────────────────────────────┐
│                    iPhone                        │
│                                                  │
│  ┌──────────┐    ┌────────────────┐             │
│  │ HealthKit │───▶│ healthService  │             │
│  │  (Apple)  │    │ .ts utility    │             │
│  └──────────┘    └───────┬────────┘             │
│                          │                       │
│                  ┌───────▼────────┐             │
│                  │  AsyncStorage  │             │
│                  │  health_cache  │             │
│                  │  (7-day window)│             │
│                  └───────┬────────┘             │
│                          │                       │
│           ┌──────────────▼──────────────┐       │
│           │      useHealthData()        │       │
│           │    React hook, provides:    │       │
│           │  - recoveryScore (0-100)    │       │
│           │  - sleepSummary             │       │
│           │  - restingHR + trend        │       │
│           │  - hrvTrend                 │       │
│           │  - weightTrend              │       │
│           └──────────────┬──────────────┘       │
│                          │                       │
│            ┌─────────────▼────────────┐         │
│            │    AI Coach Chat         │         │
│            │  health context injected │         │
│            │  into system prompt      │         │
│            │  (sent with each POST    │         │
│            │   /api/coach/chat)       │         │
│            └──────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

### Why on-device only?

1. **Privacy** — Apple's guidelines: health data can't be sent to third-party servers for non-health-management purposes. We're a cycling app, not a health platform.
2. **Simplicity** — No new DB tables, no GDPR health data controller obligations, no "delete my health data" flows.
3. **Performance** — AsyncStorage read is instant; no network round trip for health context.

### How it reaches the coach

The health summary is **injected into the SSE POST body** alongside messages. The backend passes it through to the system prompt — it never stores or logs it.

```
POST /api/coach/chat
{
  "messages": [...],
  "conversation_id": "...",
  "health_context": {                    // ← NEW, optional
    "recovery_score": 72,
    "resting_hr_bpm": 52,
    "resting_hr_baseline_bpm": 48,
    "hrv_ms": 42,
    "hrv_baseline_ms": 55,
    "sleep_hours": 6.2,
    "sleep_deep_pct": 15,
    "weight_kg": 78.5,
    "weight_trend_30d_kg": -0.8,
    "vo2max": 48.2,
    "data_freshness": "2026-07-04T06:00:00Z"
  }
}
```

The backend appends this to the system prompt **if present**, does NOT log it, does NOT store it in `coach_messages`.

---

## 5. Recovery Score — Composite Calculation

BikeLab computes its own recovery score on-device. This is a 0–100 number the coach can reference.

### Formula (based on published sports science + Whoop/Oura/Garmin patterns)

```typescript
function calculateRecoveryScore(data: HealthSnapshot): number {
  const weights = {
    hrv: 0.30,
    restingHR: 0.25,
    sleep: 0.30,
    sleepQuality: 0.15,
  };

  // 1. HRV component (0-100)
  //    Compare last night's HRV to 14-day rolling baseline
  //    At baseline = 70, 20% above = 100, 30% below = 0
  const hrvRatio = data.hrv / data.hrvBaseline;
  const hrvScore = clamp((hrvRatio - 0.7) / 0.5 * 100, 0, 100);

  // 2. Resting HR component (0-100)
  //    Lower than baseline = good, higher = bad
  //    At baseline = 80, 5bpm below = 100, 10bpm above = 0
  const rhrDiff = data.restingHR - data.rhrBaseline;
  const rhrScore = clamp(80 - rhrDiff * 8, 0, 100);

  // 3. Sleep duration component (0-100)
  //    7-9h = 100, <5h = 0, linear between
  const sleepScore = clamp((data.sleepHours - 5) / 2 * 100, 0, 100);

  // 4. Sleep quality component (0-100)
  //    Based on deep sleep percentage (15-25% = optimal)
  const deepPct = data.deepSleepPct;
  const qualityScore = deepPct >= 15
    ? clamp(60 + (deepPct - 15) * 4, 60, 100)
    : clamp(deepPct / 15 * 60, 0, 60);

  return Math.round(
    hrvScore * weights.hrv +
    rhrScore * weights.restingHR +
    sleepScore * weights.sleep +
    qualityScore * weights.sleepQuality
  );
}
```

### Score interpretation

| Score | Label | Coach behavior |
|---|---|---|
| 85-100 | Peak | "Great recovery — good day for hard intervals or threshold work" |
| 70-84 | Good | Normal training, no adjustments |
| 50-69 | Moderate | "Consider keeping it moderate today" (only if user asks about training) |
| 30-49 | Low | "Your body is recovering — an easy spin or rest day might serve you better" |
| 0-29 | Very Low | "Strong signal to rest. If this persists, consider looking at sleep or stress factors" |

**The coach mentions recovery proactively ONLY when score ≤ 49 AND the user asks about training/goals/plans.** It never opens with health warnings.

---

## 6. New Files

### `utils/healthService.ts`

Core HealthKit interaction layer.

```typescript
import AppleHealthKit, { HealthKitPermissions, HealthValue } from 'react-native-health';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const HEALTH_CACHE_KEY = 'bikelab_health_cache';

// Permissions we request
const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.RestingHeartRate,
      AppleHealthKit.Constants.Permissions.HeartRateVariability,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.Weight,
      AppleHealthKit.Constants.Permissions.Vo2Max,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
    ],
    write: [], // Read-only
  },
};

export interface HealthSnapshot {
  // Raw values
  restingHR: number | null;         // bpm, last night
  rhrBaseline: number | null;       // bpm, 14-day rolling avg
  hrv: number | null;               // ms SDNN, last night
  hrvBaseline: number | null;       // ms, 14-day rolling avg
  sleepHours: number | null;        // total sleep last night
  deepSleepPct: number | null;      // % of sleep in deep stage
  sleepStages: { deep: number; core: number; rem: number; awake: number } | null;
  weightKg: number | null;          // latest
  weightTrend30d: number | null;    // kg change over 30 days
  vo2max: number | null;            // latest Apple estimate
  activeEnergyKcal: number | null;  // yesterday total

  // Computed
  recoveryScore: number | null;     // 0-100
  dataFreshness: string | null;     // ISO timestamp of most recent sample

  // Meta
  isAvailable: boolean;             // false on Android or if user denied
  isConnected: boolean;             // true if user has granted permissions
}

export async function initHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (error: string) => {
      if (error) {
        console.log('[Health] HealthKit init error:', error);
        resolve(false);
      } else {
        console.log('[Health] HealthKit initialized');
        resolve(true);
      }
    });
  });
}

export async function fetchHealthSnapshot(): Promise<HealthSnapshot> {
  // ... fetch from HealthKit, compute baselines from 14-day window,
  // compute recovery score, cache to AsyncStorage
}

export async function getCachedHealth(): Promise<HealthSnapshot | null> {
  const raw = await AsyncStorage.getItem(HEALTH_CACHE_KEY);
  return raw ? JSON.parse(raw) : null;
}

// Build the health_context object for the coach API
export function buildHealthContext(snapshot: HealthSnapshot) {
  if (!snapshot.isConnected || snapshot.recoveryScore === null) return undefined;

  return {
    recovery_score: snapshot.recoveryScore,
    resting_hr_bpm: snapshot.restingHR,
    resting_hr_baseline_bpm: snapshot.rhrBaseline,
    hrv_ms: snapshot.hrv,
    hrv_baseline_ms: snapshot.hrvBaseline,
    sleep_hours: snapshot.sleepHours,
    sleep_deep_pct: snapshot.deepSleepPct,
    weight_kg: snapshot.weightKg,
    weight_trend_30d_kg: snapshot.weightTrend30d,
    vo2max: snapshot.vo2max,
    data_freshness: snapshot.dataFreshness,
  };
}
```

### `hooks/useHealthData.ts`

React hook that initializes HealthKit, fetches data, and provides the snapshot.

```typescript
export function useHealthData() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Try cached first
      const cached = await getCachedHealth();
      if (cached && isRecent(cached.dataFreshness, 4 * 60 * 60 * 1000)) {
        setSnapshot(cached);
        setLoading(false);
        return;
      }
      // Fresh fetch
      const connected = await initHealthKit();
      if (!connected) {
        setSnapshot({ isAvailable: Platform.OS === 'ios', isConnected: false, ...nullSnapshot });
        setLoading(false);
        return;
      }
      const fresh = await fetchHealthSnapshot();
      setSnapshot(fresh);
      setLoading(false);
    }
    load();
  }, []);

  return { healthSnapshot: snapshot, healthLoading: loading };
}
```

---

## 7. Integration Points

### 7A. Coach Chat — System Prompt Injection

In `server/aiCoach.js`, modify `buildSystemPrompt()` to accept optional health context:

```js
function buildSystemPrompt(healthContext) {
  let prompt = `You are BikeLab Coach...`; // existing prompt

  if (healthContext) {
    prompt += `\n\n## Rider Health Context (today)
This data comes from the rider's Apple Health. Use it to inform training suggestions — never to diagnose conditions.
- Recovery Score: ${healthContext.recovery_score}/100
- Resting HR: ${healthContext.resting_hr_bpm} bpm (baseline: ${healthContext.resting_hr_baseline_bpm})
- HRV: ${healthContext.hrv_ms} ms (baseline: ${healthContext.hrv_baseline_ms})
- Last night sleep: ${healthContext.sleep_hours}h (${healthContext.sleep_deep_pct}% deep)
- Weight: ${healthContext.weight_kg} kg (30-day trend: ${healthContext.weight_trend_30d_kg > 0 ? '+' : ''}${healthContext.weight_trend_30d_kg} kg)
${healthContext.vo2max ? `- VO2max (Apple estimate): ${healthContext.vo2max}` : ''}

Guidelines for using this data:
- Reference recovery/sleep ONLY when it's directly relevant to the user's question (training plan, goal timeline, ride analysis)
- If recovery score is ≤49 and user asks about training: gently suggest adjusting intensity. Don't alarm them.
- Never say "your health data shows" — instead say "looks like your body is still recovering" or "your recovery metrics suggest an easy day"
- Weight trends: only mention if user asks about climbing/power-to-weight or weight goals
- Never compare their HRV/RHR to population norms — only to their own baseline
- This is NOT medical data — don't use medical language`;
  }

  return prompt;
}
```

### 7B. SSE Client — Send Health Context

In `utils/coachSSE.ts`, modify `streamChat` to accept and forward health context:

```typescript
export async function streamChat(
  messages: OutgoingChatMessage[],
  conversationId: string | null,
  callbacks: StreamCallbacks,
  healthContext?: Record<string, any>,  // ← NEW
): Promise<() => void> {
  // ...existing token logic...

  const es = new EventSource<'message'>(`${API_BASE_URL}/api/coach/chat`, {
    method: 'POST',
    headers: { /* same */ },
    body: JSON.stringify({
      messages,
      conversation_id: conversationId,
      health_context: healthContext || undefined,  // ← NEW
    }),
    // ...rest same...
  });
```

### 7C. useCoachChat — Wire Health Through

In `hooks/useCoachChat.ts`, import `useHealthData` and pass context to `streamChat`:

```typescript
// Inside useCoachChat, or accept healthContext as a parameter:
const sendMessage = useCallback(async (text: string, healthContext?: Record<string, any>) => {
  // ...existing logic...
  cancelRef.current = await streamChat(
    historyForRequest,
    conversationId,
    { onToken, onToolCall, ... },
    healthContext,  // ← forward
  );
}, [...]);
```

### 7D. CoachChatScreen — Provide Health Data

```typescript
const { healthSnapshot } = useHealthData();
const healthContext = healthSnapshot ? buildHealthContext(healthSnapshot) : undefined;

// Pass to sendMessage:
const handleSend = (text: string) => sendMessage(text, healthContext);
```

### 7E. Backend — Pass Through, Don't Store

In `server/server.js`, the `/api/coach/chat` route:

```js
// Parse health_context from request body
const healthContext = req.body.health_context || null;

// Pass to system prompt builder
const systemPrompt = coach.buildSystemPrompt(healthContext);

// Use systemPrompt in the OpenAI call
// Do NOT store healthContext in coach_messages or log it
```

---

## 8. UX — Settings & Onboarding

### Settings screen: "Apple Health" toggle

Add to existing Settings/Profile screen:

```
┌──────────────────────────────────┐
│  Apple Health                    │
│  ┌─ Connected ─────── [Toggle] ─│
│  │                               │
│  │  Recovery data    ✓ reading   │
│  │  Sleep            ✓ reading   │
│  │  Weight           ✓ reading   │
│  │  HRV              ✓ reading   │
│  │                               │
│  │  Your health data stays on    │
│  │  your phone. It's never sent  │
│  │  to our servers or stored in  │
│  │  the cloud.                   │
│  └───────────────────────────────│
└──────────────────────────────────┘
```

### First-time prompt

DON'T ask on app launch or onboarding. Instead, prompt contextually:

1. **After 3+ coach conversations**: show a subtle suggestion chip: "Connect Apple Health for smarter coaching"
2. **When user asks about recovery/rest/sleep**: coach says "I don't have access to your recovery data yet. Want to connect Apple Health? I can factor in your sleep and HRV."
3. **Never block any feature** on Health connection — it's purely additive.

### Recovery Score widget (optional, Phase 2)

Small card on the Home tab showing today's recovery score. Tapping opens a 7-day trend mini-chart. Only visible if Health is connected.

---

## 9. Privacy & Compliance

| Requirement | How we comply |
|---|---|
| HealthKit data not for advertising | We have no ads. Privacy policy states this. |
| Must explain data use to user | `NSHealthShareUsageDescription` + in-app explanation in Settings |
| User can revoke at any time | Standard iOS Settings → Privacy → Health → BikeLab |
| No cloud storage of health data | Health data stays in AsyncStorage on device. Backend receives it transiently in the POST body, does not log or persist. |
| App Store privacy labels | Declare "Health & Fitness" as collected, purpose "App Functionality", not linked to identity |
| GDPR "special category" data | Not applicable — data never reaches our servers. If it did, we'd need explicit consent + DPA. |

---

## 10. Implementation Phases

### Phase 1 — Core Read + Coach Integration (MVP)

1. Install `react-native-health`, Xcode HealthKit capability
2. Create `utils/healthService.ts` — init, fetch Tier 1 data, cache to AsyncStorage
3. Create `hooks/useHealthData.ts` — provides `HealthSnapshot`
4. Compute recovery score on-device
5. Modify `coachSSE.ts` + `useCoachChat.ts` — pass `health_context`
6. Modify `server/aiCoach.js` — accept health_context in system prompt
7. Settings screen toggle for Apple Health connection
8. i18n keys (en + ru)
9. **pod install**, test on physical device (HealthKit doesn't work in Simulator without manual data)

### Phase 2 — Polish

1. Recovery Score card on Home tab
2. 7-day HRV/RHR/sleep trend mini-chart (reuse `react-native-gifted-charts` pattern)
3. Smart coach suggestions: "You've slept <6h three nights running — consider a deload week"
4. Background delivery for overnight data (fetch when app wakes)
5. Tier 2 health data (body fat, respiratory rate, SpO2)

### Phase 3 — Android (if needed)

1. `react-native-health-connect` for Google Health Connect
2. Same `healthService` interface, platform-specific implementation
3. Separate permissions flow (Health Connect is a separate app on Android)

---

## 11. New Backend Tool — `get_health_context` (Optional)

We could also add a tool that the coach can explicitly call. But since health data is already in the system prompt, this is only useful if we want the coach to request a "deep dive" refresh mid-conversation.

Decision: **Skip for Phase 1.** System prompt injection is sufficient. The coach already has the numbers — it doesn't need a tool to fetch them again.

---

## 12. File Changes Summary

| File | Action |
|---|---|
| `utils/healthService.ts` | **NEW** — HealthKit init, fetch, cache, recovery score |
| `hooks/useHealthData.ts` | **NEW** — React hook providing HealthSnapshot |
| `utils/coachSSE.ts` | **EDIT** — accept + forward `health_context` in POST body |
| `hooks/useCoachChat.ts` | **EDIT** — pass health context through to `streamChat` |
| `screens/CoachChatScreen.tsx` | **EDIT** — call `useHealthData()`, pass to chat |
| `server/aiCoach.js` | **EDIT** — `buildSystemPrompt(healthContext)` with health section |
| `server/server.js` | **EDIT** — parse `health_context` from request, pass to prompt builder, do NOT store |
| Settings screen | **EDIT** — add Apple Health toggle + status |
| `ios/BikeLabApp/Info.plist` | **EDIT** — add `NSHealthShareUsageDescription` |
| `ios/BikeLabApp.xcodeproj` | **EDIT** — add HealthKit capability |
| `package.json` | **EDIT** — add `react-native-health` |
| i18n (en.json, ru.json) | **EDIT** — health-related strings |

### NOT changing

- No new DB tables
- No new backend API endpoints (health context goes through existing `/api/coach/chat`)
- `types/coach.ts` — no changes needed
- `GoalDetailsScreen` — no changes
- `RideAnalyticsScreen` — no changes (recovery context flows through coach, not dashboard)
