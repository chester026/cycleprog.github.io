# Apple Health Integration — Implementation Plan

> Companion to `APPLE_HEALTH_SPEC.md`. That doc defines *what* and *why*; this defines *how*, checked against the actual state of the repo (2026-07-09). Several of the spec's assumptions about the codebase turned out to be wrong — corrected below before the phase breakdown.

---

## 1. Corrections to the spec (verified against the repo)

| Spec assumed | Actually true | Impact |
|---|---|---|
| "Old Architecture (Hermes, no New Arch)" — basis for picking `react-native-health` over `@kingstinct/react-native-healthkit` | `android/gradle.properties` has `newArchEnabled=true`. RN is `0.83.1`. iOS side needs the same check (`ios/.xcode.env` / Podfile) before we commit. | **Library choice is not settled.** `react-native-health` is a legacy bridge module with no Fabric UI component, so it will likely still work via RN's native-module interop layer — but "likely" isn't good enough for a HealthKit integration we don't want to redo. Added a Phase 0 spike below. |
| Files live at `utils/`, `hooks/`, `screens/`, `server/aiCoach.js` | Everything RN-side is under `BikeLabApp/src/` (`src/utils/`, `src/hooks/`, `src/screens/`). Server files (`aiCoach.js`, `server.js`) are correctly at repo-root `server/`, not inside `BikeLabApp/`. | Just path corrections, noted per-file below. |
| `buildSystemPrompt(healthContext)` — spec assumed the function already takes args | `server/aiCoach.js:388` — `function buildSystemPrompt() {}`, takes zero args today. Called once, at `server/server.js:4768`: `{ role: 'system', content: coach.buildSystemPrompt() }`. | Single call site, safe to change. Confirmed no other callers. |
| `streamChat(messages, conversationId, callbacks, healthContext)` — 4th positional param | Real signature in `src/utils/coachSSE.ts` is `streamChat(messages, conversationId, callbacks)` — no context param yet, confirmed unbuilt. | Matches spec's intent, just needs the new param added for real. |
| `sendMessage(text, healthContext?)` in `useCoachChat.ts` | Real signature is `sendMessage(text, options?: {hiddenContext?: string; revealDetail?: AnalysisDetailType})`. `hiddenContext` is *already* the exact mechanism the spec wants for health: a value attached only to the outgoing request, never displayed, never persisted (used today for the Strava activity id in "Discuss with Coach"). | Health context should NOT reuse `hiddenContext` itself (that's per-message and gets folded into chat history semantics) — but it should follow the same "new optional field on the `options` object, one-shot, server does the rest" shape rather than becoming a new positional arg. See §3 below for the exact diff. |
| Spec pictures a generic "Settings" screen with a health toggle | There's no single Settings hub — `ProfileScreen.tsx` is the hub with nav rows to `AccountSettingsScreen`, `TrainingSettingsScreen`, `StravaIntegrationScreen`, etc. (all in `ProfileStack` in `App.tsx`). `StravaIntegrationScreen.tsx` is the closest precedent: connect/disconnect status page, not a toggle-in-a-list. | Build `AppleHealthScreen.tsx` following the `StravaIntegrationScreen` pattern (own screen, own `ProfileStack` entry, nav row from `ProfileScreen`), not a toggle bolted onto an existing screen. |

Everything else in the spec — recovery score formula, Tier 1/2 data selection, on-device-only architecture, privacy stance, coach prompt guidelines — holds up and doesn't need rework.

---

## 2. Phase 0 — Library spike (new, ~0.5–1 day, blocks everything else)

Before writing any real code:

1. Check iOS New Architecture status directly (`RCT_NEW_ARCH_ENABLED` in `ios/.xcode.env` / Podfile), not just Android's `gradle.properties`.
2. Spike `react-native-health` on a real device build at RN 0.83.1 with New Arch on: `initHealthKit` + one `getRestingHeartRateSamples` call. If it throws, crashes, or the interop layer complains — switch to `@kingstinct/react-native-healthkit` instead (JSI/Nitro-native, no interop layer needed, but requires adding `react-native-nitro-modules` as a new dependency).
3. Decision recorded back into `APPLE_HEALTH_SPEC.md` §2 once known — don't guess.

This is the one part of the spec that could invalidate downstream work if skipped.

---

## 3. Phase 1 — Core read + coach integration (MVP)

File-by-file, in dependency order:

1. **`package.json`** — add chosen HealthKit library (from Phase 0) + `pod install`.
2. **`ios/BikeLabApp.xcodeproj`** — HealthKit capability; **`ios/BikeLabApp/Info.plist`** — `NSHealthShareUsageDescription`.
3. **`src/utils/healthService.ts`** (NEW) — `initHealthKit`, `fetchHealthSnapshot`, `getCachedHealth`, `buildHealthContext`, recovery score calc — per spec §5–6, paths corrected to `src/`.
4. **`src/hooks/useHealthData.ts`** (NEW) — wraps the service in a hook, cache-first with 4h freshness window, per spec §6.
5. **`src/utils/coachSSE.ts`** (EDIT) — add a 4th optional param to `streamChat(messages, conversationId, callbacks, healthContext?)`, forward it as `health_context` in the POST body (spec's diff is directionally correct here, just needs the `src/` path).
6. **`src/hooks/useCoachChat.ts`** (EDIT) — extend the existing `options` object on `sendMessage` with `options?.healthContext`, forward to `streamChat`. This deliberately does *not* touch `hiddenContext` — health context is a separate, orthogonal field on the same options bag.
7. **`src/screens/CoachChatScreen.tsx`** (EDIT) — call `useHealthData()`, build context via `buildHealthContext(healthSnapshot)`, pass as `options.healthContext` on send.
8. **`server/aiCoach.js`** (EDIT) — change `function buildSystemPrompt()` to `function buildSystemPrompt(healthContext)`, append the health section from spec §7A when present.
9. **`server/server.js`** (EDIT) — at the single call site (line ~4768): parse `health_context` from `req.body`, pass through as `coach.buildSystemPrompt(healthContext)`. Confirmed not logged or stored anywhere else in that route.
10. **`src/screens/AppleHealthScreen.tsx`** (NEW) — connect/disconnect + per-metric status, modeled on `StravaIntegrationScreen.tsx`. Add to `ProfileStack` in `App.tsx`, add nav row in `ProfileScreen.tsx`.
11. **`src/i18n/en.json`, `src/i18n/ru.json`** (EDIT) — health strings (screen copy, contextual connect prompt).
12. Test on a **physical device** — HealthKit doesn't return real data in Simulator without manually seeded samples.

## 4. Phase 2 — Polish (unchanged from spec §10)

Recovery score card on Home, 7-day trend mini-chart, proactive "3 nights <6h sleep" coach nudges, background delivery, Tier 2 metrics. No corrections needed here — revisit paths against `src/` when it's picked up.

## 5. Phase 3 — Android (unchanged from spec §10)

`react-native-health-connect`, same `healthService` interface, separate permission flow. Deferred until there's a reason to prioritize it.

---

## 6. Open decisions before starting Phase 1 — RESOLVED (2026-07-09)

- **Library**: `@kingstinct/react-native-healthkit`, decided directly — skipping the `react-native-health` spike. Repo is already committed to New Architecture (Skia v2, Reanimated added this same week), so a JSI/Nitro-native module removes the one real risk instead of gambling on the bridge interop layer. Adds `react-native-nitro-modules` as a new native dependency.
- **`AppleHealthScreen`**: build it in Phase 1, in `ProfileStack` right next to `StravaIntegrationScreen` — same connect/status pattern, same place in Profile. Confirmed this is a real screen, not skippable: health data is consumed by the model (system-prompt context), but the user still needs a place to see connection status and grant/revoke access, same as Strava.
- **Contextual connect prompt — spec §8's "3+ conversations" heuristic is OUT.** Replaced with an intent-based trigger: the coach itself decides, based on the system prompt guidelines, to suggest connecting Health only when the user asks something readiness/fatigue/recovery-shaped (e.g. "should I do intervals today", "analyse my health/recovery") AND health isn't connected yet. No new conversation-count tracking needed — this is a system-prompt copy addition in `buildSystemPrompt()`, not new app logic. The existing suggestion-chip mechanism can surface a "Connect Apple Health" chip when the coach says this, reusing existing infra rather than adding a new nudge system.
- **Phase 2 idea (new, from this discussion)**: a rich "Recovery" card in the chat (same pattern as `RideScoreCard`/`MetricComparisonCard`) when the coach references recovery/health data, instead of/alongside a Home-tab widget. Not required for MVP.
- **`AppleHealthScreen` copy/flow**: still need to confirm the "your data never leaves your phone" messaging text before i18n keys are finalized, since it's a compliance-facing statement.

---

## 7. Verification checklist (end of Phase 1)

- [ ] Phase 0 spike result confirms library choice and is recorded in the spec
- [ ] `node -c` / `tsc --noEmit` clean on all edited/new files
- [ ] Manual test on physical iPhone: grant permission → snapshot populates → recovery score computed → visible in coach's system prompt (log it server-side temporarily, remove before merge — must not ship persistent logging of health data)
- [ ] Denying permission doesn't break `CoachChatScreen` (falls back to `isConnected: false`, no context sent)
- [ ] Confirm `health_context` never appears in `coach_messages` rows after a real chat turn
- [ ] `AppleHealthScreen` connect/disconnect round-trips correctly against iOS Settings → Privacy → Health toggle
