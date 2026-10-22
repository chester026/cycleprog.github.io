# Web → production quality + AI Coach parity — Implementation Plan

**Date:** 2026-10-16 · **Scope:** `react-spa` (+ minimal additive backend/shared changes) · **Target:** web app at the
same quality bar as the iOS app, with the AI Coach chat at full feature parity.

Based on a read of `react-spa/src`, `BikeLabApp/src/{hooks,components/coach,screens/CoachChat*}`, `server/routes/coach.js`,
`server/aiCoach.js`, `packages/shared/src/api/contract/coach.ts`. Owner decisions taken 2026-10-16 are in §0.

## Status (2026-10-16)

| Phase | State |
|---|---|
| 0 Streaming foundation + backend | ✅ landed |
| 1 Coach chat core | ✅ landed (`/coach`, `/coach/c/:id`, `/goals/:id`) |
| 2 Cards, attachments, memory tab | ✅ landed (`.ics` instead of Apple sync; Recovery = Oura only) |
| 2b Ride analysis modal, Checklist redesign | ✅ landed |
| 3 Calendar page | ✅ landed (`/calendar?date=&goal=&view=week`) |
| 4 Production hygiene | ✅ landed (Sentry via `VITE_SENTRY_DSN`, chunks, tokens, Skeleton, no-console) |
| 5 Hardening & tests | ✅ landed (web 666 vitest / 14 e2e, line coverage 84 %) |
| §9 Health bridge | ⏳ open question, not scheduled |

Owner manual steps: root `npm install`; add `react-spa/public/` binaries (og.jpg, favicon.svg/.ico, apple-touch-icon.png, icons/icon-192/512 + maskable); `VITE_SENTRY_DSN` on Render. Follow-ups flagged by agents: `GET /api/activities/:id` returns 401 `STRAVA_NOT_LINKED` (web treats 401 as session expiry → should be 403/409, API change = owner decision); `activities.analyzeSummary` + `analytics.activity` routes have no client left; hex literals 1 525 (report-only `lint:colors`).

---

## 0. Owner decisions (don't relitigate)

| Topic | Decision |
|---|---|
| Calendar on web | **Yes** — build a full `/calendar` page (deliberate feature transfer, needed so coach calendar cards have a target and "Plan with coach"/"Ask coach" entry points exist). |
| Backend changes | **Minimal, additive only**: early `conversation` SSE event, optional `client` body field, SSE heartbeat comments, `PATCH /api/coach/conversations/:id` (rename). No path/field renames (LEGACY_MOBILE_COMPAT still alive). |
| Old `AiGoalGenerator` | **Remove.** Goals are created by the coach (`create_goal`). `/goal-assistant` becomes the Coach home, exactly like the app's Goals tab. |
| Health integrations | **Phone only.** No Oura/Apple Health connect UI on web. Readiness/Recovery cards on web render only from server-side data (Oura via `analyze_readiness`/`get_oura_readiness`, or a future health snapshot — see §9 open question). "Connect Apple Health" chip is hidden on web. |
| Web UI | English only (existing rule). Code comments English (CODE_STYLE §2). |

---

## 1. Where web is today (summary of findings)

**Coach:** there is no chat. `/goal-assistant` = `GoalsHero` ("Hey {name}… Ask me anything") + `AiGoalGenerator`
(one-shot `POST /api/meta-goals/ai-generate` → creates a meta-goal) + `MetaGoalList` + duplicated VO₂max/nutrition
calculators. "Ask coach" buttons (`goals/ProgressSection.jsx:57`, `MaintenancePage.jsx:315`, `GoalDetailPage.jsx:182`)
navigate into the generator — a question becomes a new goal. Client keyword filter `goals/lib.js isRelevantToCycling`
(with Russian keywords) blocks requests before they're sent. Only coach endpoint in use: `coach.notes*`
(`useCoachNotes.js`, `profile/CoachMemoryCard.jsx`).

**Data layer:** `call()` wraps shared `callEndpoint` (JSON only, 15 s timeout, buffers `response.text()`); no streaming
primitive anywhere (`getReader|EventSource|TextDecoder` → 0 hits). Auth: access token in memory
(`AuthProvider.getInMemoryAccessToken`), refresh in localStorage; `attemptRefresh` in shared client is private. Query
persister dumps the whole cache to localStorage with buster `pkg.version === "0.0.0"` (never changes).

**UI kit:** `src/ui` has Modal/ConfirmDialog/Toast/Loader/ErrorMessage/Button + 22 `--ui-*` tokens, but `<Button>` has 0
consumers, 11 files roll their own modal markup, ~1 800 hex literals vs ~155 token usages. Missing: autosize textarea,
markdown renderer, chip, segmented control, sheet/drawer, skeleton, icon-button, `dvh`/safe-area handling.

**Prod hygiene gaps:** no error reporting (and prod build `drop: ['console']` erases errors silently); `errorElement`
only on root route (page crash kills the shell); `index.html` `og:image` points at `/src/...` (broken in build),
`manifest.webmanifest` `icons: []`, no favicon; global `h2 { opacity:.2; font-size:2vw }` (≈1.5:1 contrast — every page
heading fails WCAG); Vite template CSS leftovers; no `<main>`, no `document.title`; mobile drawer without
`aria-expanded`/Esc/focus mgmt; 7 components read queries without error states; dead code: `GpxElevationChart.jsx`
(only user of `html2canvas` + `gpxparser`, which drags `jsdom`/`tough-cookie` advisory), `admin/StravaTab` cache
section, `src/config.js`; 8 `console.log`; 3 bare `eslint-disable-next-line`; eslint config silently drops jsx-a11y if
import fails; 369 lines of Russian comments; `FTPAnalysis.jsx` does `useEffect`+`call()` (rule 3). e2e = 4 smoke tests;
Garage/Goals/Analysis/Trainings/Profile/Login/Register pages have no RTL tests.

**Backend (what web can reuse as-is):** all coach REST endpoints are contracted (`coach.conversations`,
`conversationByActivity`, `conversationDetail`, `deleteConversation`, `notes*`). `POST /api/coach/chat` is SSE
(`data: <json>\n\n`, no `event:`/`id:`/heartbeat), events `token | tool_call | tool_result | suggestions | redirect |
done | error`; body `{message, conversation_id|null, hidden_context?, health_context?}`; Bearer-only auth → browser
`EventSource` can't be used, must be `fetch` + `body.getReader()`. Cancel = close connection (server aborts OpenAI via
`res.on('close')`). Pre-stream errors are plain JSON (401, 429 `RATE_LIMITED`, 429 `AI_BUDGET_EXCEEDED{resetAt}`, 400).

---

## 2. Parity checklist (mobile → web)

Legend: ✅ exists on web · 🔧 build · 🚫 not applicable on web (needs substitute) · ⚪ optional

| Area | Mobile behaviour | Web plan |
|---|---|---|
| Home (Coach/Goals) | `CoachHomeHero` "Hey {firstName}…", `CoachHomePromptInput`, quick-start chips (Analyze last ride, Training progress, Schedule training, Set a new goal, Check my bike, Total stats), segmented Coach/Goals, `GoalsPanel` (Active/Completed), recent chats list | 🔧 `/coach` page replaces `GoalAssistantPage`; reuse `GoalsHero` + `MetaGoalList` |
| Conversations | list (`GET conversations`), open (`GET :id`), delete (×, confirm), implicit create on first send, by-activity de-dup, `redirect` event | 🔧 hooks + list UI; ⚪ rename via new `PATCH` |
| Streaming | token flush every 50 ms, StreamingDots, tool pills (grouped by consecutive name, spinner → green dot), stop button, cancel on back/unmount | 🔧 `useCoachChat` + `fetch` stream |
| Errors | `ContextBar` red strip; `AI_BUDGET_EXCEEDED` → "You've reached today's coach limit. It resets at HH:mm"; failed bubble keeps partial text | 🔧 same copy |
| Suggestions | chips after reply; `detail` chips (vs_baseline/similar_ride/skills_delta) set `revealDetail`; label sent **verbatim** as message | 🔧 same; `connect_health` chip → **hidden** on web |
| Attachments | paperclip → `ActivityPickerModal` (multi, max 5), pills, serialized into `hidden_context` | 🔧 `Modal`-based picker, same serializer (move to shared) |
| Entry points | RideAnalytics "Discuss with Coach" (by-activity check → open or `initialPrompt` + `activity_id`), Calendar "Plan with coach" / "Ask coach" (`calendar_event_id`), GoalDetails banner + Trainings tab "Ask coach for a plan", Checklist banner, BikeGarage footer, Profile → Memory | 🔧 `?prompt=&activity=&event=&open=` search params (survive reload); rewire existing buttons; add missing ones |
| Markdown | bold + `- ` bullets only | 🔧 port `renderFormatted` (no lib) |
| Cards | GoalCreated, GoalCompleted, CalendarEventCreated, CalendarPlanCreated, ChecklistUpdated, CoachMemory, ProfileUpdated, RideScore, MetricComparison ×2, SkillsDelta, RecoveryCard, OvertrainingTrendCard, ToolCallCard, CoachCardChrome/ProgressRing | 🔧 all; gating via `computeAnalysisMeta` (port to shared) |
| Apple Calendar sync | `SyncToAppleCalendarPrompt` (iOS) | 🚫 → ⚪ "Add to calendar (.ics)" download |
| Health | `health_context` from HealthKit each turn; RecoveryCard prefers local snapshot | 🚫 web sends no `health_context`; RecoveryCard from Oura result only; see §9 |
| Coach memory | `CoachMemoryScreen` (list, add/edit sheet, categories, 30/160 limits) | ✅ `CoachMemoryCard` — 🔧 give it its own Profile tab `?tab=coach` so cards can deep-link |
| Cache invalidation | checklist / coachNotes / metaGoals+goals / profile on tool_result; conversations on done | 🔧 same **plus** `calendar`, `bikes`/`bikeHealth` (app forgets these) |
| Keyboard | KeyboardAvoidingView, grow 48→100 px | 🔧 Enter = send, Shift+Enter = newline, autosize, `100dvh` + `visualViewport` on mobile web |
| Tab bar hidden in chat | yes | 🔧 chat layout = full height, sidebar stays on desktop, hidden header on mobile |

---

## 3. Phases

Order is dependency-driven. Phases 1→2→3 are the parity work; Phase 4 can run in parallel with 2–3 (different files);
Phase 5 last. Each task lists files so it can be handed to a worktree agent (see `docs/audit` recipe).

### Phase 0 — Streaming foundation + minimal backend (prerequisite)

**0.1 Shared streaming client** — `packages/shared/src/api/client.ts`
- Add `stream(path, body, {signal}) → Promise<Response>` to `createApiClient`: reuses `getToken`, no timeout, on
  pre-stream 401 → `attemptRefresh()` once → retry; throws `ApiError` with parsed JSON body for 4xx/5xx (so
  `AI_BUDGET_EXCEEDED{resetAt}` and `RATE_LIMITED` are typed).
- Add `packages/shared/src/api/sse.ts`: `async function* readSse(response, signal)` → yields parsed `data:` JSON
  objects; ignores comment lines (`: heartbeat`), tolerates chunk splits mid-frame. Unit tests with fake
  `ReadableStream` (split frames, heartbeat, abort).
- Add `packages/shared/src/types/coach.ts`: `CoachSseEvent` discriminated union (token/tool_call/tool_result/
  suggestions/redirect/done/error/**conversation**), `SuggestionItem`, `ToolCall{name,args,result?,status}`.
- Move pure chat logic to shared so app and web share it: `serializeAttachedActivities`, `groupToolCalls`,
  `computeAnalysisMeta`, `buildStreamErrorMessage`, card mappers (`mapChecklistUpdates`, `mapMemoryUpdates`,
  `mapProfileUpdates`, `mapCompletedGoal`, `pickRecoveryContext` minus HealthKit branch), overtraining-risk calc
  (`packages/shared/src/calc/overtraining.ts`, 100 % coverage rule). App switches to the shared versions in the same
  change (no dual paths).

**0.2 Web auth bridge** — `react-spa/src/utils/api.js`
- Export `stream = client.stream` next to `call`; no page ever touches `Authorization`.

**0.3 Backend (additive)** — `server/routes/coach.js`, `server/services/coach.js`, `server/aiCoach.js`
- Emit `{type:'conversation', conversation_id}` right after conversation creation (line ~276) — fixes orphan threads
  when a turn aborts before `done`. Mobile ignores unknown types (verify `useCoachChat.ts` switch has no default throw).
- Heartbeat: `: ping\n\n` every 15 s while a turn is open (timer cleared on end/close). Add
  `X-Accel-Buffering: no` header.
- Optional body field `client?: 'ios'|'web'` (zod, default `'ios'` for back-compat). When `'web'`: drop
  `suggest_connect_apple_health` from the tool list and the `connect_health` chip; swap the Apple-Health prompt
  paragraph for "health data comes from the rider's phone; if none, say so and continue". Replace hard app wording in
  tool `note`s ("Activities tab", "Garage tab", "open the Oura tab…") with platform-neutral text.
- `PATCH /api/coach/conversations/:id {title}` — contract `coach.renameConversation` (`packages/shared/src/api/contract/coach.ts`),
  route, repo, integration test. Title max 80.
- Integration tests: conversation event order, heartbeat present, `client:'web'` tool list, rename.

**Acceptance:** `npm -w packages/shared run test:coverage` green (calc 100 %), server integration green,
`contract.inventory.test.js` green, mobile `npm test` unchanged.

### Phase 1 — Coach chat core on web

**1.1 Routing** — `react-spa/src/App.jsx`, `components/Sidebar.jsx`
- `/coach` (home: hero + prompt + chips + Coach/Goals segmented + recent chats), `/coach/c/:conversationId` (chat),
  `/goals/:id` (GoalDetailPage). Redirects: `/goal-assistant` → `/coach`, `/goal-assistant/:id` → `/goals/:id`.
- Search params on `/coach`: `prompt`, `activity`, `event`, `open` → consumed once, then stripped
  (`setSearchParams(…, {replace:true})`), mirroring the app's `requestId` de-dup.
- Sidebar: "Goal Assistant" → "Coach" (sparkle icon); active match by prefix (`/coach`, `/goals`).
- `errorElement` on the protected layout too (keeps sidebar on page error).

**1.2 Data hooks** — `react-spa/src/data/hooks/`, `data/keys.js`
- `useCoachConversations`, `useCoachConversation(id)` (also exposed as `fetchQuery` helper), `useDeleteConversation`
  (optimistic), `useConversationByActivity(activityId)`, `useRenameConversation`. Keys: `coachConversations`,
  `coachConversation(id)`, `coachConversationByActivity(id)`.
- `queryClient.js`: `dehydrateOptions.shouldDehydrateQuery` excludes `coachConversation*` and `admin*`; buster =
  `__BUILD_HASH__` (Vite `define` from git sha / `Date.now()` at build).

**1.3 `useCoachChat`** — `react-spa/src/hooks/useCoachChat.js` (port of the app hook)
- State: `messages`, `streaming`, `suggestions`, `error`, `conversationId` (+ synchronous ref), `loadingConversation`.
- `sendMessage(text, {hiddenContext, revealDetail})`: optimistic user msg (`crypto.randomUUID()`), empty assistant msg,
  `stream('/api/coach/chat', {message, conversation_id, hidden_context, client:'web'}, {signal})`, token buffer flushed
  every 50 ms, tool pairing FIFO, invalidations per table in §2, `redirect` → `openConversation(existing)`,
  `conversation` → set id immediately, `done` → invalidate list + detail and `navigate('/coach/c/:id', {replace:true})`
  when it was a new chat.
- `cancelStream()` → `AbortController.abort()`, keep partial text, not an error. Cancel on unmount/route change.
- `startNewConversation()`, `openConversation(id)` (fetchQuery → map persisted `tool_calls` to `status:'done'`, restore
  last message's `suggestions`).
- Tests: RTL + mocked `ReadableStream` covering token flush, tool pairing, budget error, redirect, abort.

**1.4 Chat UI** — `react-spa/src/pages/CoachPage.jsx` (<600 lines) + `src/pages/coach/*`
- `ChatLayout` (full-height, `100dvh`, `visualViewport` resize on mobile), `ChatHeader` (back, "AI Coach", delete ×,
  new chat; icon buttons disabled while streaming, all with `aria-label`), `MessageList` (scroll-to-end only when count
  changes or streaming; "↓ new messages" pill when user scrolled up), `ChatMessageBubble` (user/coach, `renderFormatted`
  markdown port, `aria-live="polite"` on streaming bubble), `StreamingDots`, `ToolCallPill`
  (TOOL_LABEL map incl. the 10 tools the app lacks labels for: checklist, memory, profile, power profile, bike service,
  gear label), `SuggestedActions` (first chip gradient ring; hide `connect_health`), `ChatInput` (autosize textarea
  1–6 rows, Enter/Shift+Enter, 4 000-char limit, paperclip, attachment pills, send/stop), `ContextBar` (error strip),
  `ConversationList` + `ConversationListItem` (title/untitled, relative time via `Intl.RelativeTimeFormat`, msg count,
  delete with `useConfirm`), `CoachHome` (hero reuse, prompt input → new chat, quick-start chips incl. Total-stats long
  prompt, Coach/Goals segmented, `GoalsPanel` = restyled `MetaGoalList` with Active/Completed).
- New `src/ui` primitives (tested): `Textarea` (autosize), `Chip`, `SegmentedControl`, `IconButton` (required
  `aria-label`), `Skeleton`, `Sheet` (extracted from `MaintenancePage` maint-sheet; proper `role="dialog"`, focus trap).
- Delete: `AiGoalGenerator.jsx`, `useGenerateAiGoals.js`, `isRelevantToCycling` + Russian keyword lists, duplicated
  calculators in `GoalAssistantPage.jsx` (keep `GarageCalculators` only — moves ~600 dup lines out), `GoalAssistantPage.*`.
  `metaGoals.aiGenerate` contract/route stay (mobile compat) — mark `@deprecated` in contract.

**1.5 Entry points rewired**
- `goals/ProgressSection.jsx`, `GoalDetailPage.jsx` ("Ask the coach to build a training plan" → `/coach?prompt=…`),
  `MaintenancePage.jsx` footer (`bikeName` prompt), `ChecklistPage.jsx` (add coach banner like app's `Checklist/CoachBanner`),
  `TrainingsPage`/`RideAnalysisModal` ("Discuss with Coach": by-activity check → `open=` or `prompt=`+`activity=`).

**Acceptance:** send → stream → stop → resend works in prod (bikelab.app) and Vite dev (proxy); 401 mid-session
refreshes once; budget 429 shows reset time; refresh of `/coach/c/:id` restores history with tool pills; Lighthouse a11y
≥ 95 on `/coach`; eslint `--max-warnings 0`; RTL tests for every new piece; e2e: login → coach → send (mocked SSE via
Playwright `route.fulfill` streaming) → card rendered.

### Phase 2 — Rich cards, attachments, memory

**2.1 Cards** — `react-spa/src/pages/coach/cards/*` + `CoachCardChrome.jsx` (CoachCard/IconTile/Eyebrow/StatusPill/
FooterLink/Divider, ACCENT palette as CSS vars), `ProgressRing.jsx` (SVG).
- Render order inside an assistant message exactly as app: tool pills → RideScore → OvertrainingTrend → Recovery →
  text → MetricComparison(baseline) → MetricComparison(similar) → SkillsDelta → GoalCreated → GoalCompleted →
  CalendarEvent/CalendarPlan (+ `.ics` download button instead of Apple sync) → ChecklistUpdated ×N → CoachMemory ×N →
  ProfileUpdated ×N. Gating from shared `computeAnalysisMeta` + `revealDetail`.
- Deep links: Goal cards → `/goals/:id`; Checklist → `/checklist`; Memory → `/profile?tab=coach`; Profile →
  `/profile?tab=personal`; Calendar → `/calendar?date=YYYY-MM-DD` (Phase 3; until then `/goals/:goal_id` when
  present, else non-clickable).
- `OvertrainingTrendCard`: SVG chart (HR + speed×5, Catmull-Rom) from `useActivities()`; risk % from shared calc.
  Follow `src/components/charts/chartTheme.js` colours.
- `RecoveryCard`: Oura source only (`analyze_readiness.result.oura.days[0]` / `get_oura_readiness.days[0]`); when
  `connected:false` render nothing (web has no connect flow).
- `ProfileUpdatedCard` FIELD_SPECS: add `height` (app bug — missing).

**2.2 Attachments** — `ActivityPickerModal.jsx` on `src/ui/Modal`, multi-select max 5 (toast on overflow, not alert),
rows reuse `pages/trainings/ActivityRow`. Serializer from shared.

**2.3 Coach memory** — `ProfilePage`: new tab `coach` ("Coach memory") hosting `CoachMemoryCard`; remove it from
`personal`/`heart-rate` tabs; counter `{n}/30`, "Add note" hidden at limit, category chips — parity with
`CoachMemoryScreen`.

**2.4 Invalidations** — on `tool_result`: `create/update/complete/delete_goal` → `metaGoals`,`goals`;
`*_calendar_event` → `calendar`; `add/update_checklist_item(s)` → `checklist`; `remember/forget_about_rider` →
`coachNotes`; `update_rider_profile` → `profile`; `log_bike_service`, `set_bike_gear_label` → `bikes`,`bikeHealth`.

**Acceptance:** golden-fixture tests: a persisted conversation JSON (export one from prod, scrub) renders the same set of
cards on web as `ChatMessageBubble.test.tsx` expects on mobile; visual check on 375 px and 1440 px.

### Phase 2b — Ride analysis modal + Checklist redesign (owner request 2026-10-16)

**2b.1 Ride analysis = app's RideAnalytics** — replace `components/RideAnalysisModal.jsx` (101 lines, old
`useActivityAnalysis` text summary, hard-coded `includes('интервал')`) with a web port of
`BikeLabApp/src/screens/RideAnalyticsScreen.tsx` + `RideAnalytics/{RideHeader,RideStats,StreamsCharts,lib}`:
- `pages/ride/RideAnalysisModal.jsx` (on `src/ui/Modal`, full-height sheet on mobile) + `pages/ride/*` pieces:
  header (name, date, type, map thumbnail if polyline), stats grid (`RideStats` — all metrics, zones, effort score,
  comparisons vs baseline), `StreamsCharts` (HR / speed / cadence / power / elevation over time from
  `useActivityStreams` — hook exists on web, unused), meta-goals progress for this ride
  (`useActivityMetaGoalsProgress` → add web hook, contract exists), **"Discuss with Coach"** button (by-activity check →
  `/coach?open=` or `/coach?prompt=…&activity=`), same copy as app.
- Pure logic (`computeRideAnalysis`, `formatRideDate`, zone bucketing) moves to `packages/shared` and the app imports it
  from there (no dual paths). Charts via `src/components/charts/TrendChart`/`ChartFrame`.
- Wire it from Garage hero (`LastRideBanner`/`GarageLastRideCard` "Analyze"), Trainings page rows, and (later) coach cards.
- Delete the old modal, its test, `useActivityAnalysis` if nothing else uses it (check `aiAnalysis` contract stays for
  mobile). RTL tests for stats/charts with a fixture; e2e: open from Garage, see charts, click Discuss → `/coach`.

**2b.2 Checklist page in Maintenance style** — rebuild `pages/ChecklistPage.jsx` (390 lines) to match
`MaintenancePage` visual language (hero/overview card on top, then **columns of cards per section**, like
`maint-*` grid) and the app's `screens/Checklist/*` structure: `OverviewCard` (totals, progress, coach banner "Ask coach
about your checklist" → `/coach?prompt=`), `SectionGrid` → per-section column with `ItemCard`s (check toggle, link,
notes), `ItemDetailSheet`/`NewItemSheet`/`NewSectionSheet`/`SectionSheet` on the shared `Sheet` primitive (rename,
delete section). Keep data hooks (`useChecklist`) and contract untouched; keep `garage/ChecklistPreview` consistent.
Pure logic from `screens/Checklist/lib.ts` → shared. CSS modules, tokens only. RTL tests ported from the app's
`SectionGrid.test`, `OverviewCard.test`.

### Phase 3 — Calendar page (feature transfer, owner-approved)

- `/calendar` page (`pages/CalendarPage.jsx` + `pages/calendar/*`): month grid + week agenda, event types
  (planned_ride, rest_day, maintenance, purchase, event, note) with the app's colours, activities overlay from
  `useCalendar({from,to})`, `EventDetailSheet` (`Sheet` primitive) with edit/delete (`useCalendarMutations` already
  exists and is unused), "Plan with coach" button (`/coach?prompt=<calendar.planWithCoachPrompt text>`), per-event
  "Ask coach" (`/coach?prompt=…&event=:id`, `ASK_PROMPT_KEYS` texts ported to English constants in shared).
- `.ics` export per event / per plan (RFC 5545 string builder in shared, unit-tested) — web substitute for Apple sync.
- Sidebar item "Calendar". `GoalDetailPage` schedule tab links to `/calendar?goal=:id`.
- Coach calendar cards now deep-link to `/calendar?date=…`.

**Acceptance:** create event via coach → card → click → event visible on `/calendar`; RTL for grid lib (`pages/calendar/lib.js`
100 % branches), e2e one flow.

### Phase 4 — Production hygiene (parallel with 2–3)

| # | Task | Files |
|---|---|---|
| 4.1 | Error reporting: `@sentry/react` (DSN via `VITE_SENTRY_DSN`, release = build hash, `tracesSampleRate` 0.1), `build.sourcemap: 'hidden'` + upload; keep `drop: ['console','debugger']` but route `console.error` through `captureException` first via a tiny `lib/log.js`; `RouteErrorBoundary` → `Sentry.ErrorBoundary`. Stale-chunk detection (`vite:preloadError` → one reload). | `main.jsx`, `vite.config.js`, `components/RouteErrorBoundary.jsx`, `package.json` |
| 4.2 | `index.html`: favicon set + `apple-touch-icon`, `og:image` → `/og.jpg` in `public/`, title "BikeLab", meta description; `manifest.webmanifest` icons 192/512 + maskable, `theme_color`, `display: standalone`. (Owner adds binaries — agents must not.) | `index.html`, `public/` |
| 4.3 | Global CSS: delete Vite template leftovers (`App.css .logo/.card`, `index.css` light-scheme block, `a:hover #535bf2`); fix `h2` (`opacity:.2`, `2vw`) → tokenised heading scale ≥ 4.5:1; `h1` uppercase only where intended. | `index.css`, `App.css` |
| 4.4 | Shell a11y: `<main id="main">` + skip link; per-route `document.title` (`useDocumentTitle`); mobile drawer `aria-expanded/controls`, Esc closes, focus to first item, `inert` on content; logout `aria-label`; `type="button"` on 141 buttons (codemod); Profile tabs `role=tablist/tab/tabpanel`; make jsx-a11y import **mandatory** in `eslint.config.js`. | `Sidebar.jsx`, `ProtectedRoute.jsx`, `eslint.config.js`, many |
| 4.5 | Error/loading states: `GaragePage`, `MetaGoalList` (API error ≠ "No active goals"), `garage/ChecklistPreview`, `EventsHero`, `LastRideBanner`, `HeartRateZonesChart`, `FTPAnalysis` (→ `useFtp` query hook, fix stuck `loading`). Use `ErrorMessage` + `Skeleton`. | listed |
| 4.6 | Dead code & deps: delete `GpxElevationChart.jsx`(+test), `html2canvas`, `gpxparser` (clears jsdom/tough-cookie advisory), `admin/StravaTab` "Power Analysis cache" block, `src/config.js`, `useActivityStreams` (if still unused), stale `data/README.md` apiFetch line, false comment in `RouteErrorBoundary`. Run knip, fix report. | listed, `knip.json` |
| 4.7 | Lint debt: remove 8 `console.log`; replace bare `eslint-disable-next-line` (AddGoalModal:107, MaintenancePage:399,457) with scoped rules or fix; resolve 6 exhaustive-deps disables; translate 369 Russian comment lines to English (CODE_STYLE §2); remove Russian functional string `RideAnalysisModal.jsx:31 includes('интервал')`. | many |
| 4.8 | Theme: add `stylelint` with `declaration-property-value-disallowed-list` for hex outside `ui/theme.css` (report-only first, then error); extend tokens to the light palette actually used (`--bg`, `--surface`, `--text`, `--accent #274DD3`, `--strava #fc4c02`); migrate `Sidebar`, `App.jsx LoadingSpinner`, coach pages first. | `ui/theme.css`, `.stylelintrc`, `package.json` |
| 4.9 | Build: `manualChunks` (`recharts`, `leaflet`+`react-leaflet`, `@tanstack`), restore default `chunkSizeWarningLimit`, `define: {__BUILD_HASH__}`; `BlobOrb`: pause RAF when off-screen (`useInView`) and under `prefers-reduced-motion`, cap DPR at 1.5, `aria-hidden`, WebGL-missing fallback gradient. | `vite.config.js`, `components/BlobOrb.jsx` |
| 4.10 | Admin: delete dead "Strava tokens"/"Database" tabs if still present (audit follow-up). | `pages/admin/*` |

**Acceptance:** Lighthouse (mobile) on `/garage`, `/coach`, `/analysis`: Perf ≥ 80, A11y ≥ 95, Best-practices ≥ 95;
`npm audit` without high advisories from web deps; knip clean for react-spa; eslint 0 warnings; stylelint 0 errors on
migrated files.

### Phase 5 — Hardening & tests

- RTL tests for pages without any: Garage, Goals (coach home), GoalDetail, Analysis, Trainings, Profile, Login,
  Register; components `Sidebar`, `OnboardingModal`, `TrainingDetailsModal`, `GarageCalculators`, `HrZonesCard`,
  `AccountDangerZone`.
- e2e (`react-spa/e2e`): coach send/stream/stop, goal created from chat → `/goals/:id`, deep link `/coach?prompt=`,
  calendar event from chat, profile coach-memory CRUD, mobile viewport drawer. SSE mocked with `page.route` streaming
  body so tests don't hit OpenAI.
- Contract-level test: shared `CoachSseEvent` zod schema validates a recorded real stream fixture (keeps web and server
  in lockstep without putting SSE in `defineEndpoint`).
- Adopt `<Button>`/`<Modal>` in the 11 files with hand-rolled modal markup; drop `.error-message` class usage (5 files).
- Responsive pass: unify breakpoints to 3 (`--bp-sm 600`, `--bp-md 990`, `--bp-lg 1250`); remove `!important` on
  `.main-content`.
- Update `CLAUDE.md` §8 (web rules: coach pages, stylelint, Sentry), `docs/audit/quality-gates.md` numbers, `data/README.md`.

---

## 4. Work breakdown for parallel agents

| Stream | Phase tasks | Touches | Can run with |
|---|---|---|---|
| A (shared+server) | 0.1–0.3 | `packages/shared`, `server` | — (first) |
| B (web chat core) | 1.1–1.5 | `react-spa/src/{App,hooks,pages/coach,ui}` | D after A |
| C (cards+calendar) | 2.x, 3.x | `pages/coach/cards`, `pages/calendar`, `ProfilePage` | B must land first |
| F (ride modal + checklist) | 2b.1, 2b.2 | `pages/ride`, `pages/ChecklistPage`, `ui/Sheet`, shared calc | A (shared), parallel with B |
| D (hygiene) | 4.1–4.10 | shell, CSS, config, dead files | B, C (disjoint files; coordinate `Sidebar.jsx`, `App.jsx`, `ProfilePage.jsx`) |
| E (tests) | 5.x | tests, e2e | after B, C |

Branch: one `web-prod` branch off `main`, same flow as `to-prod-state`. Owner steps: `npm install` at root (Sentry,
stylelint), add icon/og binaries to `public/`, set `VITE_SENTRY_DSN` on Render, decide `COACH_*` prompt wording change
is OK for iOS too (it is platform-neutral).

---

## 5. Risks & mitigations

- **Proxy buffering on Render** — mobile streams fine today, but add heartbeat + `X-Accel-Buffering: no` anyway; verify
  with `curl -N` against prod after Phase 0.
- **Shared refactor touches mobile** (moving mappers/calc to shared) — do it in Stream A with the app's existing tests
  (`ChatMessageBubble.test.tsx`, `lib.test.ts`) as the safety net; no behaviour change intended.
- **Abort semantics are lossy server-side** (partial text not persisted, tool side effects stay) — same as mobile;
  document in UI ("Stopped") and don't promise undo. Backend persistence of partial text is out of scope (owner: minimal).
- **Detail chips keyed by exact label strings** (en/ru) — web must send labels verbatim; covered by hook test.
- **Russian suggestion chips can appear on English-only web** (server picks language by Cyrillic in the user message) —
  acceptable: it mirrors the user's own language.
- **`aiLimiter` 30/h per user is shared between web and app** — surface `RATE_LIMITED` with a friendly message.
- **Persister shape drift** — fixed by build-hash buster (1.2).

---

## 6. Definition of done (web = prod)

1. Coach parity checklist §2 all ✅/🚫-with-substitute; no `/goal-assistant` generator left.
2. `/calendar` live with coach entry points; coach calendar cards deep-link.
3. CI gates from `CLAUDE.md` green + new: stylelint, knip clean for `react-spa`, Lighthouse thresholds (§Phase 4).
4. Sentry receiving web errors with source maps; zero `console.*` in src except via `lib/log.js`.
5. `index.html`/manifest/favicon/og correct; app installable as PWA shell (no SW — explicitly out of scope).
6. a11y: every page heading ≥ 4.5:1, keyboard-only pass through coach chat, drawer, modals.
7. Docs updated (`CLAUDE.md`, `quality-gates.md`, this plan's status table).

---

## 7. Explicitly out of scope

Service worker / offline chat; premium gating; message retry/regenerate/edit (app doesn't have it either); conversation
search; coach on landing page; renaming API paths; Sign in with Apple; Share Studio and Knowledge Center on web
(not asked).

---

## 8. Backend/API additions summary (for the contract file)

```ts
// packages/shared/src/api/contract/coach.ts (additions)
renameConversation: defineEndpoint({ method:'PATCH', path:'/api/coach/conversations/:id',
  params: z.object({id: z.string().uuid()}), body: z.object({title: z.string().min(1).max(80)}),
  response: CoachConversationSchema })
// POST /api/coach/chat stays uncontracted; body gains optional `client: z.enum(['ios','web'])`.
// New SSE event: {type:'conversation', conversation_id}. Heartbeat frames: ": ping\n\n".
```

---

## 9. Open question — health metrics on web

HealthKit has **no web API**: Apple Health data can only leave the phone through the app. Today the app sends a
`health_context` snapshot with each chat turn and the server never stores it, so web (and any server-side logic)
has nothing. If web should show RecoveryCard/readiness for Apple-Health users, the only route is a **health bridge**:

- App: `POST /api/health/snapshot` (contracted; same fields as `health_context`: recovery_score, resting_hr(+baseline),
  hrv(+baseline), sleep_hours, sleep_deep_pct, weight_kg, weight_trend_30d_kg, data_freshness) — sent on app open /
  foreground, maybe once per day via BackgroundTasks. Store latest N days per user (`health_snapshots` table, migration).
- Server: `analyze_readiness` falls back to the stored snapshot when the request carries no `health_context`
  (`source:'apple_health_snapshot'`, with `data_freshness`), so web turns get real numbers; `RecoveryCard` on web then
  renders from the tool result, same as Oura.
- Privacy/consent: explicit toggle in app's AppleHealth screen ("Share with coach across devices"), default off.

Not scheduled; decide separately. Without it, web readiness = Oura-only (connected from the phone), which is
already consistent with "health integrations are phone-only".
