# T-7.2 — Quality gates in CI

Status of each gate added in this branch (`wt/ci-gates`), against the actual worktree state
measured on 2026-09-18 with `node -v` = `v22.22.2` in this container. All numbers below come from
running the pinned tool versions with `npx -y <tool>@<version>` from the repo root (the worktree's
`node_modules` do not have these tools installed — see `GUIDE-7.md` — so CI is what will actually
install and run them via the root `devDependencies` added below).

## Summary table

| # | Gate | Tool | Status in CI | Current numbers |
|---|------|------|---------------|------------------|
| 1 | Duplicate code | jscpd 4.0.5 | **Required** (`quality` job, no `\|\| true`) | 2.29% lines dup overall (threshold 6%) — see §1 |
| 2 | Dead code / unused exports & deps | knip 5.88.1 | Report-only (`\|\| true`) | 8 unused files, 2 unused deps, 5 unused devDeps, 2 unlisted deps, 324 unused exports, 8 unused types, 15 duplicate exports — see §2 |
| 3 | Unused deps (package-level) | depcheck | **Skipped** — knip's dependency section covers it | see §3 |
| 4 | `eslint --max-warnings 0` | eslint | react-spa: **strict** (0 warnings). server: report-only, 39 warnings. BikeLabApp: report-only, see §4 for actual count | see §4 |
| 5 | `tsc --noEmit` | typescript | shared: **added + required** (`npm -w packages/shared run typecheck`, passes clean). BikeLabApp: already in CI, passes. react-spa: not applicable (JS) | see §5 |
| 6 | `npm audit --audit-level=high` | npm | Stays report-only — both root and server audits currently **fail** (advisories below) | see §6 |
| 7 | Node 22 | — | `engines.node` = `">=22 <23"` everywhere, `.nvmrc` = `22`, CI `node-version: 22` | tests verified green under Node 22.22.2 — see §7 |
| 8 | Sentry release + source maps | @sentry/node | Already implemented (`server/lib/sentry.js`) — no server change needed | see §8 |

## 1. jscpd — duplicate code (`.jscpd.json`)

Config: scans `server`, `react-spa/src`, `packages/shared/src`, `BikeLabApp/src`; `minLines: 8`,
`minTokens: 60` (matches the audit's own settings, `docs/audit/00-AUDIT-AND-PLAN.md:99`); ignores
tests/specs, `dist`/`build`/`coverage`, `**/migrations/**`, `*.json`, `*.d.ts`, `*.snap`, generated
files. `threshold: 6` — the audit's T-7.2 target (`jscpd --threshold 6`, `00-AUDIT-AND-PLAN.md:397`).

**We are already under the target**, so the threshold was set to `6` (not `ceil(actual)+0`) per the
task instructions. Measured with `npx -y jscpd@4.0.5 --config .jscpd.json`:

| Scope | Duplicated lines | % |
|---|---:|---:|
| `server` | 101 / 17,082 | **0.59%** |
| `react-spa/src` | 1,359 / 41,914 | **3.24%** |
| `packages/shared/src` | 0 / — | **0%** |
| `BikeLabApp/src` | 928 / 39,489 | **2.35%** |
| **Overall (4 dirs combined)** | 2,398 / 104,657 | **2.29%** |

Compare to the audit's original numbers (`00-AUDIT-AND-PLAN.md:99`, pre-phases-3–6): overall 8.05%,
react-spa 17.7%, BikeLabApp 11.9%, server 8.2%. The phase 3–6 refactors already landed most of the
promised reduction ("после фаз 3–6 реально ≤ 5%" — we're well past that now, at ~2.3%). `quality`
job runs `npm run lint:dup` as a **required** step (no `|| true`) since it already passes.

### Top duplicate blocks (candidates for a follow-up de-dup pass)

The two biggest by far are `react-spa/src/components/GarageCalculators.{jsx,css}` vs
`react-spa/src/pages/GoalAssistantPage.{jsx,css}` — together ~600 duplicated lines, almost a third of
react-spa's total. `BikeLabApp`'s screen-settings screens (`TrainingSettingsScreen.tsx` vs
`HRZonesScreen.tsx`/`AccountSettingsScreen.tsx`/`PersonalInfoScreen.tsx`/`OuraIntegrationScreen.tsx`/
`StravaIntegrationScreen.tsx`) share a repeated settings-row/section layout pattern — a good
candidate for a shared `<SettingsSection>`/`<SettingsRow>` component.

| Lines | Format | File A | File B |
|---:|---|---|---|
| 206 | css | `react-spa/src/components/GarageCalculators.css:135-340` | `react-spa/src/pages/GoalAssistantPage.css:641-846` |
| 162 | jsx | `react-spa/src/components/GarageCalculators.jsx:235-396` | `react-spa/src/pages/GoalAssistantPage.jsx:258-422` |
| 123 | javascript | `react-spa/src/components/GarageCalculators.jsx:259-381` | `react-spa/src/pages/GoalAssistantPage.jsx:282-406` |
| 117 | css | `react-spa/src/components/GarageCalculators.css:18-134` | `react-spa/src/pages/GoalAssistantPage.css:523-640` |
| 96 | jsx | `react-spa/src/components/GarageCalculators.jsx:48-143` | `react-spa/src/pages/GoalAssistantPage.jsx:65-160` |
| 95 | css | `react-spa/src/components/TrainingDayModal.css:481-575` | `react-spa/src/components/TrainingLibraryModal.css:145-237` |
| 92 | jsx | `react-spa/src/components/GarageCalculators.jsx:144-235` | `react-spa/src/pages/GoalAssistantPage.jsx:165-258` |
| 86 | javascript | `react-spa/src/components/GarageCalculators.jsx:146-231` | `react-spa/src/pages/GoalAssistantPage.jsx:167-254` |
| 47 | tsx | `BikeLabApp/src/screens/HRZonesScreen.tsx:208-254` | `BikeLabApp/src/screens/TrainingSettingsScreen.tsx:134-181` |
| 44 | tsx | `BikeLabApp/src/screens/AccountSettingsScreen.tsx:90-133` | `BikeLabApp/src/screens/TrainingSettingsScreen.tsx:132-175` |
| 43 | tsx | `BikeLabApp/src/components/TrainingDetailsModal.tsx:173-215` | `BikeLabApp/src/components/TrainingLibraryModal.tsx:125-167` |
| 42 | tsx | `BikeLabApp/src/screens/OuraIntegrationScreen.tsx:231-272` | `BikeLabApp/src/screens/StravaIntegrationScreen.tsx:163-204` |
| 41 | javascript | `BikeLabApp/src/components/TrainingDetailsModal.tsx:127-167` | `BikeLabApp/src/components/TrainingDetailsModal.tsx:114-141` (self-duplicate) |
| 38 | javascript | `BikeLabApp/src/screens/Analysis/PeriodHeader.tsx:46-83` | `BikeLabApp/src/screens/Analysis/PeriodHeader.tsx:29-64` (self-duplicate) |
| 35 | javascript | `server/routes/goals.js:267-301` | `server/services/goals.js:96-130` |
| 29 | css | `react-spa/src/pages/AnalysisPage.css:19-47` | `react-spa/src/pages/TrainingsPage.css:22-49` |
| 28 | tsx | `BikeLabApp/src/components/coach/CalendarEventCreatedCard.tsx:81-108` | `BikeLabApp/src/components/coach/CalendarPlanCreatedCard.tsx:69-96` |
| 28 | javascript | `BikeLabApp/src/screens/OuraIntegrationScreen.tsx:166-193` | `BikeLabApp/src/screens/TrainingSettingsScreen.tsx:67-131` |
| 27 | tsx | `BikeLabApp/src/screens/PersonalInfoScreen.tsx:167-193` | `BikeLabApp/src/screens/TrainingSettingsScreen.tsx:130-156` |
| 26 | tsx | `BikeLabApp/src/screens/ProfileScreen.tsx:218-243` | `BikeLabApp/src/screens/ProfileScreen.tsx:179-204` (self-duplicate) |
| 26 | tsx | `BikeLabApp/src/screens/PersonalInfoScreen.tsx:194-219` | `BikeLabApp/src/screens/TrainingSettingsScreen.tsx:156-181` |
| 25 | jsx | `react-spa/src/pages/analysis/PlanFactHero.jsx:51-75` | `react-spa/src/pages/goals/GoalsHero.jsx:18-42` |
| 23 | tsx | `BikeLabApp/src/screens/AppleHealthScreen.tsx:211-233` | `BikeLabApp/src/screens/OuraIntegrationScreen.tsx:281-243` |
| 22 | javascript | `BikeLabApp/src/screens/Garage/OverallStats.tsx:34-55` | `BikeLabApp/src/screens/Garage/OverallStats.tsx:28-41` (self-duplicate) |
| 21 | tsx | `BikeLabApp/src/components/coach/CalendarPlanCreatedCard.tsx:71-91` | `BikeLabApp/src/components/coach/GoalCreatedCard.tsx:58-78` |

## 2. knip — dead code, unused exports/deps, unlisted deps (`knip.json`)

`knip.json` defines one workspace per package (`server`, `packages/shared`, `react-spa`,
`BikeLabApp`) with explicit `entry`/`project` globs. Redundant entries that knip's own plugins
already auto-detect (e.g. `vite.config.js` via the Vite plugin, `index.js`/`App.tsx` via the
React Native plugin, `src/index.ts` + the four other tsup entries via the tsup plugin) were left
out — `npx knip --no-progress` reports **zero configuration hints** with the final config, so
nothing here is silently excluding real dead code. No `ignore`/exclusion list was needed at all —
every workspace scans cleanly with the config below, so there's nothing to explain in the
"false positives" sense the task anticipated; if that changes later (e.g. RN native entry files),
add the exclusion to the relevant workspace's `ignore` and explain it here, since `knip.json` is
plain JSON and can't hold comments.

CI step is **report-only** (`npm run lint:deadcode || true` in the `quality` job) — none of this is
mine to fix (source code, other agents' files), so nothing here blocks CI yet.

Full findings, grouped by package (from `npx -y knip@5.88.1 --no-progress`, 2026-09-18):

### Unused files

<details><summary><code>server</code> (1)</summary>

```
server/middleware/validate.js
```

</details>

<details><summary><code>react-spa</code> (1)</summary>

```
react-spa/src/config.js
```

</details>

<details><summary><code>BikeLabApp</code> (6)</summary>

```
BikeLabApp/src/assets/img/icons/AltitudeIcon.tsx
BikeLabApp/src/assets/img/icons/DirectionsBikeIcon.tsx
BikeLabApp/src/assets/img/icons/MicIcon.tsx
BikeLabApp/src/assets/img/logo/StravaLogo.tsx
BikeLabApp/src/components/BikesModal.tsx
BikeLabApp/src/navigation/index.ts
```

</details>

### Unused dependencies

<details><summary><code>server</code> (2)</summary>

```
@getbrevo/brevo  server/package.json:4:6
debug            server/package.json:9:6
```

</details>

### Unused devDependencies

<details><summary><code>server</code> (1)</summary>

```
pino-pretty                  server/package.json:46:6
```

</details>

<details><summary><code>react-spa</code> (1)</summary>

```
@testing-library/user-event  react-spa/package.json:37:6
```

</details>

<details><summary><code>BikeLabApp</code> (3)</summary>

```
@babel/preset-env            BikeLabApp/package.json:61:6
@babel/runtime               BikeLabApp/package.json:62:6
eslint-plugin-react          BikeLabApp/package.json:77:6
```

</details>

### Unlisted dependencies

<details><summary><code>react-spa</code> (2)</summary>

```
pg      react-spa/e2e/global-setup.cjs:33:10
bcrypt  react-spa/e2e/global-setup.cjs:34:8
```

</details>

### Unused exports

<details><summary><code>server</code> (297)</summary>

```
AchievementEngine                                server/achievements.js:631:3
ACHIEVEMENT_DEFINITIONS                          server/achievements.js:635:3
analyzeTraining                                  server/aiAnalysis.js:155:20
getCacheStats                                    server/aiAnalysis.js:155:54
groupGoalsByMetaGoal                             server/aiCoach.js:1889:16
generateVerificationToken                        server/brevo-config.js:118:3
sendVerificationEmail                            server/brevo-config.js:119:3
sendPasswordResetEmail                           server/brevo-config.js:120:3
calculateProgress                                server/goalCalculator.js:83:3
addPaceData                                      server/goalCalculator.js:84:3
goalProgressSource                               server/goalCalculator.js:86:3
VALID_SOURCES                                    server/goalCalculator.js:87:3
VALID_AGGREGATES                                 server/goalCalculator.js:88:3
VALID_FIELDS                                     server/goalCalculator.js:89:3
VALID_SKILLS                                     server/goalCalculator.js:90:3
VALID_HEALTH_METRICS                             server/goalCalculator.js:91:3
unauthorized                                     server/lib/apiError.js:49:3
forbidden                                        server/lib/apiError.js:50:3
tooMany                                          server/lib/apiError.js:53:3
internal                                         server/lib/apiError.js:54:3
asyncHandler                                     server/lib/asyncRoutes.js:19:20
BoundedCache                                     server/lib/cache/memory.js:96:20
ALLOWED_HOSTNAME_SUFFIXES                        server/lib/imageProxy.js:17:39
VALIDATE_RESPONSES                               server/middleware/contract.js:75:44
RATE_LIMIT_MESSAGE                               server/middleware/rateLimits.js:72:20
OURA_SCOPE                                       server/ouraService.js:327:3
buildAuthorizeUrl                                server/ouraService.js:328:3
exchangeCodeForToken                             server/ouraService.js:329:3
refreshAccessToken                               server/ouraService.js:330:3
fetchPersonalInfo                                server/ouraService.js:331:3
getValidAccessToken                              server/ouraService.js:332:3
fetchAndCacheOuraData                            server/ouraService.js:333:3
revokeToken                                      server/ouraService.js:334:3
generatePersonalizedPlan                         server/recommendations/index.js:696:3
getTrainingTypeDetails                           server/recommendations/index.js:698:3
getPlanExecutionStats                            server/recommendations/index.js:700:3
getCustomTrainingPlan                            server/recommendations/index.js:701:3
saveCustomTrainingPlan                           server/recommendations/index.js:702:3
deleteCustomTraining                             server/recommendations/index.js:703:3
analyzeGoalProgress                              server/recommendations/training-utils.js:421:3
determineTrainingPriorities                      server/recommendations/training-utils.js:425:3
selectTrainingDays                               server/recommendations/training-utils.js:426:3
AccountNotFoundError                             server/repositories/account.js:57:3
getStravaAccessToken                             server/repositories/account.js:58:3
deleteAccountCascade                             server/repositories/account.js:59:3
FINISHED_STATUSES                                server/repositories/activities.js:86:3
isFinishedStatus                                 server/repositories/activities.js:87:3
deleteProgressForMetaGoals                       server/repositories/activities.js:88:3
getCachedProgress                                server/repositories/activities.js:89:3
getMetaGoalsByIds                                server/repositories/activities.js:90:3
getActiveMetaGoals                               server/repositories/activities.js:91:3
getPreviousProgress                              server/repositories/activities.js:92:3
getSubGoalsForMetaGoals                          server/repositories/activities.js:93:3
upsertProgress                                   server/repositories/activities.js:94:3
getCachedAnalysis                                server/repositories/activityAnalysis.js:41:20
saveAnalysis                                     server/repositories/activityAnalysis.js:41:39
AdminUserNotFoundError                           server/repositories/admin.js:119:3
getStravaSyncStatusPerUser                       server/repositories/admin.js:120:3
getStravaSyncStatusTotals                        server/repositories/admin.js:121:3
listUsersForAdmin                                server/repositories/admin.js:122:3
getUserStravaAccessToken                         server/repositories/admin.js:123:3
clearStravaLinkForUser                           server/repositories/admin.js:124:3
deleteUserCascade                                server/repositories/admin.js:125:3
recordUsage                                      server/repositories/aiBudget.js:49:20
getUsageForDay                                   server/repositories/aiBudget.js:49:33
getUserTotals                                    server/repositories/aiBudget.js:49:49
findSnapshotByLastActivity                       server/repositories/analyticsSnapshot.js:79:3
upsertSnapshot                                   server/repositories/analyticsSnapshot.js:80:3
trimSnapshotsKeepingLatest                       server/repositories/analyticsSnapshot.js:81:3
getLatestSnapshot                                server/repositories/analyticsSnapshot.js:82:3
getSnapshotHistory                               server/repositories/analyticsSnapshot.js:83:3
getRiderWeight                                   server/repositories/bikes.js:109:3
getLatestSkills                                  server/repositories/bikes.js:110:3
getComponentResets                               server/repositories/bikes.js:111:3
getComponentLabels                               server/repositories/bikes.js:112:3
upsertComponentLabelsBatch                       server/repositories/bikes.js:113:3
insertComponentReset                             server/repositories/bikes.js:114:3
insertOnboardingResets                           server/repositories/bikes.js:115:3
CALENDAR_EVENT_TYPES                             server/repositories/calendar.js:93:3
listEvents                                       server/repositories/calendar.js:94:3
createEvent                                      server/repositories/calendar.js:95:3
updateEvent                                      server/repositories/calendar.js:96:3
deleteEvent                                      server/repositories/calendar.js:97:3
deleteMigratedRide                               server/repositories/calendar.js:98:3
listItems                                        server/repositories/checklist.js:52:20
createItem                                       server/repositories/checklist.js:52:31
updateItem                                       server/repositories/checklist.js:52:43
deleteItem                                       server/repositories/checklist.js:52:55
deleteSection                                    server/repositories/checklist.js:52:67
listConversations                                server/repositories/coach.js:138:3
findConversationByActivity                       server/repositories/coach.js:139:3
getConversation                                  server/repositories/coach.js:140:3
getMessages                                      server/repositories/coach.js:141:3
deleteConversation                               server/repositories/coach.js:142:3
conversationExists                               server/repositories/coach.js:143:3
createConversation                               server/repositories/coach.js:144:3
insertUserMessage                                server/repositories/coach.js:145:3
getToolCallsForConversation                      server/repositories/coach.js:146:3
findDuplicateByActivity                          server/repositories/coach.js:147:3
deleteConversationById                           server/repositories/coach.js:148:3
tagConversationActivity                          server/repositories/coach.js:149:3
insertAssistantMessage                           server/repositories/coach.js:150:3
touchConversation                                server/repositories/coach.js:151:3
listEvents                                       server/repositories/events.js:45:20
createEvent                                      server/repositories/events.js:45:32
getEvent                                         server/repositories/events.js:45:45
updateEvent                                      server/repositories/events.js:45:55
deleteEvent                                      server/repositories/events.js:45:68
listGoals                                        server/repositories/goals.js:314:3
listGoalsOrderedByPriority                       server/repositories/goals.js:315:3
getGoal                                          server/repositories/goals.js:316:3
metaGoalOwnedByUser                              server/repositories/goals.js:317:3
insertGoal                                       server/repositories/goals.js:318:3
updateGoal                                       server/repositories/goals.js:319:3
updateGoalVO2max                                 server/repositories/goals.js:320:3
deleteGoal                                       server/repositories/goals.js:321:3
updateGoalCurrentValue                           server/repositories/goals.js:322:3
listMetaGoals                                    server/repositories/goals.js:323:3
getMetaGoal                                      server/repositories/goals.js:324:3
listSubGoals                                     server/repositories/goals.js:325:3
insertMetaGoal                                   server/repositories/goals.js:326:3
insertAiMetaGoal                                 server/repositories/goals.js:327:3
updateMetaGoal                                   server/repositories/goals.js:328:3
deleteMetaGoal                                   server/repositories/goals.js:329:3
getExistingActiveGoalsForAI                      server/repositories/goals.js:330:3
ftpSubGoalRow                                    server/repositories/goals.js:331:3
metricSubGoalRow                                 server/repositories/goals.js:332:3
insertAiSubGoalsBatch                            server/repositories/goals.js:333:3
batchUpdateGoalCurrentValues                     server/repositories/goals.js:334:3
getRawUserProfile                                server/repositories/goals.js:335:3
getLatestSkillsSnapshot                          server/repositories/goals.js:336:3
listSubGoalsByMetaGoalPriority                   server/repositories/goals.js:337:3
findImageByName                                  server/repositories/media.js:78:3
findImageByPosition                              server/repositories/media.js:79:3
getUserImages                                    server/repositories/media.js:80:3
deleteImage                                      server/repositories/media.js:81:3
insertImage                                      server/repositories/media.js:82:3
deleteImagesForPositions                         server/repositories/media.js:83:3
insertImagesForPositions                         server/repositories/media.js:84:3
getOuraConnectionStatus                          server/repositories/oura.js:161:3
getLatestOuraDay                                 server/repositories/oura.js:162:3
getOuraAccessToken                               server/repositories/oura.js:163:3
clearOuraConnection                              server/repositories/oura.js:164:3
getUserOuraTokens                                server/repositories/oura.js:165:3
updateOuraTokens                                 server/repositories/oura.js:166:3
upsertDailyDataBatch                             server/repositories/oura.js:167:3
listRides                                        server/repositories/rides.js:59:3
createRide                                       server/repositories/rides.js:60:3
updateRide                                       server/repositories/rides.js:61:3
deleteRide                                       server/repositories/rides.js:62:3
importRidesBatch                                 server/repositories/rides.js:63:3
MAX_RANGE_LIMIT                                  server/repositories/skills.js:141:3
getLastSnapshot                                  server/repositories/skills.js:142:3
getSecondLastSnapshot                            server/repositories/skills.js:143:3
getSnapshotAtOrBefore                            server/repositories/skills.js:144:3
upsertManualSnapshot                             server/repositories/skills.js:145:3
pruneToLastTwo                                   server/repositories/skills.js:146:3
getRecentSnapshots                               server/repositories/skills.js:147:3
getSnapshotsInRange                              server/repositories/skills.js:148:3
getLastSnapshotIdInWindow                        server/repositories/skills.js:149:3
deleteSnapshotsInWindowExcept                    server/repositories/skills.js:150:3
listGoals                                        server/repositories/training.js:126:3
getWeeklyPlan                                    server/repositories/training.js:127:3
saveWeeklyPlan                                   server/repositories/training.js:128:3
getPlanExecutionStats                            server/repositories/training.js:129:3
listCustomTrainingRows                           server/repositories/training.js:130:3
upsertCompositeTraining                          server/repositories/training.js:131:3
upsertRestTraining                               server/repositories/training.js:132:3
upsertSimpleTraining                             server/repositories/training.js:133:3
deleteCustomTraining                             server/repositories/training.js:134:3
getProfileUserFields                             server/repositories/userProfile.js:46:3
getStravaIdAndEmail                              server/repositories/userProfile.js:47:3
getStravaId                                      server/repositories/userProfile.js:48:3
setEmail                                         server/repositories/userProfile.js:49:3
findOtherUserByEmail                             server/repositories/userProfile.js:50:3
getUserById                                      server/repositories/userProfile.js:51:3
findIdByEmail                                    server/repositories/users.js:233:3
insertUser                                       server/repositories/users.js:234:3
setVerificationToken                             server/repositories/users.js:235:3
findByVerificationToken                          server/repositories/users.js:236:3
markEmailVerified                                server/repositories/users.js:237:3
findVerificationStatusByEmail                    server/repositories/users.js:238:3
setVerificationTokenWithExpiry                   server/repositories/users.js:239:3
findByEmailFull                                  server/repositories/users.js:240:3
findById                                         server/repositories/users.js:241:3
findByStravaId                                   server/repositories/users.js:242:3
updateStravaLoginFields                          server/repositories/users.js:243:3
findByStravaAthleteId                            server/repositories/users.js:244:3
reuniteStravaAccount                             server/repositories/users.js:245:3
insertStravaUser                                 server/repositories/users.js:246:3
updateOuraTokens                                 server/repositories/users.js:247:3
findConflictingStravaUser                        server/repositories/users.js:248:3
linkStravaToUser                                 server/repositories/users.js:249:3
getStravaAccessToken                             server/repositories/users.js:250:3
clearStravaLink                                  server/repositories/users.js:251:3
deleteSyncedActivities                           server/repositories/users.js:252:3
deleteSyncedBikes                                server/repositories/users.js:253:3
bumpTokenVersion                                 server/repositories/users.js:254:3
setPasswordResetToken                            server/repositories/users.js:255:3
findByPasswordResetTokenHash                     server/repositories/users.js:256:3
clearPasswordReset                               server/repositories/users.js:257:3
updatePasswordHash                               server/repositories/users.js:258:3
setEmailUnverified                               server/repositories/users.js:259:3
createRefreshToken                               server/repositories/users.js:260:3
findRefreshTokenByHash                           server/repositories/users.js:261:3
revokeRefreshToken                               server/repositories/users.js:262:3
revokeRefreshTokenFamily                         server/repositories/users.js:263:3
revokeAllRefreshTokensForUser                    server/repositories/users.js:264:3
truncateHistoryForPrompt                         server/routes/coach.js:676:16
getActivityDetails                               server/services/activities.js:302:3
checkBudget                                      server/services/aiBudget.js:76:20
recordUsage                                      server/services/aiBudget.js:76:33
todayUTC                                         server/services/aiBudget.js:76:63
EmailAlreadyExistsError                          server/services/auth.js:404:3
InvalidVerificationTokenError                    server/services/auth.js:405:3
VerificationTokenExpiredError                    server/services/auth.js:406:3
UserNotFoundError                                server/services/auth.js:407:3
AlreadyVerifiedError                             server/services/auth.js:408:3
VerificationEmailFailedError                     server/services/auth.js:409:3
InvalidCredentialsError                          server/services/auth.js:410:3
EmailNotVerifiedError                            server/services/auth.js:411:3
InvalidOrExpiredCodeError                        server/services/auth.js:412:3
StravaAlreadyLinkedError                         server/services/auth.js:413:3
InvalidOrExpiredResetTokenError                  server/services/auth.js:414:3
WeakPasswordError                                server/services/auth.js:415:3
InvalidRefreshTokenError                         server/services/auth.js:416:3
RefreshTokenReusedError                          server/services/auth.js:417:3
InvalidEmailError                                server/services/auth.js:418:3
EmailTakenError                                  server/services/auth.js:419:3
register                                         server/services/auth.js:420:3
verifyEmail                                      server/services/auth.js:421:3
resendVerification                               server/services/auth.js:422:3
login                                            server/services/auth.js:423:3
exchangeAuthCode                                 server/services/auth.js:424:3
findOrCreateStravaUser                           server/services/auth.js:425:3
connectOura                                      server/services/auth.js:426:3
linkStravaAccount                                server/services/auth.js:427:3
unlinkStrava                                     server/services/auth.js:428:3
issueRefreshToken                                server/services/auth.js:429:3
rotateRefreshToken                               server/services/auth.js:430:3
logout                                           server/services/auth.js:431:3
logoutAll                                        server/services/auth.js:432:3
forgotPassword                                   server/services/auth.js:433:3
resetPassword                                    server/services/auth.js:434:3
changeEmail                                      server/services/auth.js:435:3
computeRidingStyle                               server/services/bikes.js:129:3
computeStyleFactor                               server/services/bikes.js:130:3
getHealthStatus                                  server/services/bikes.js:131:3
computeComponentHealth                           server/services/bikes.js:132:3
ANALYSIS_KIND                                    server/services/ftpAnalysis.js:154:3
getZonesForUser                                  server/services/hrZones.js:207:3
periodStart                                      server/services/hrZones.js:208:3
ANALYSIS_KIND                                    server/services/hrZones.js:209:3
GARAGE_DIR                                       server/services/media.js:236:3
HERO_DIR                                         server/services/media.js:237:3
ALLOWED_IMAGE_MIME_TYPES                         server/services/media.js:238:3
createImageKitInstance                           server/services/media.js:241:3
getImageKitConfig                                server/services/media.js:242:3
getImageUrl                                      server/services/media.js:243:3
assignHeroImageToAllPositions                    server/services/media.js:247:3
WIND_LOOKBACK_DAYS                               server/services/power.js:166:73
MAX_WEATHER_CALLS_PER_BACKGROUND_PASS            server/services/power.js:166:93
SKILLS_WINDOW_DAYS                               server/services/skills.js:208:3
computeSkills                                    server/services/skills.js:209:3
saveSnapshot                                     server/services/skills.js:210:3
getLastSnapshot                                  server/services/skills.js:211:3
computeTrend                                     server/services/skills.js:212:3
slimActivity                                     server/services/strava/activities.js:600:3
RAW_FIELDS                                       server/services/strava/activities.js:601:3
bikesCache                                       server/services/strava/activities.js:603:3
getActivity                                      server/services/strava/activities.js:605:3
getStreams                                       server/services/strava/activities.js:606:3
getBikes                                         server/services/strava/activities.js:607:3
invalidateBikes                                  server/services/strava/activities.js:609:3
syncBikesToDb                                    server/services/strava/activities.js:611:3
DEFAULT_TYPES                                    server/services/strava/activities.js:612:3
isRideActivity                                   server/services/strava/activities.js:613:3
exchangeCode                                     server/services/strava/oauth.js:48:20
getAthlete                                       server/services/strava/oauth.js:48:34
deauthorize                                      server/services/strava/oauth.js:48:46
generatePersonalizedPlan                         server/services/training.js:213:3
getTrainingTypeDetails                           server/services/training.js:214:3
getAllTrainingTypes                              server/services/training.js:215:3
getPlanExecutionStats                            server/services/training.js:216:3
getCustomTrainingPlan                            server/services/training.js:217:3
saveCustomTrainingPlan                           server/services/training.js:218:3
deleteCustomTraining                             server/services/training.js:219:3
fetchWind                                        server/services/weather.js:114:20
getWindForActivity                               server/services/weather.js:114:31
buildWindApiUrl                                  server/services/weather.js:114:51
weatherCache                                     server/services/weather.js:114:68
getWeatherCache                                  server/services/weather.js:114:82
setWeatherCache                                  server/services/weather.js:114:99
IT_DB                                            server/test/integration/setup.js:173:31
getTrainingPlan                                  server/trainingPlans.js:18:3
TRAINING_PLANS                                   server/trainingPlans.js:20:3
TIME_MODIFIERS                                   server/trainingPlans.js:21:3
```

</details>

<details><summary><code>react-spa</code> (14)</summary>

```
default                                          react-spa/src/components/training/DayGrid.jsx:93:16
default                                          react-spa/src/components/training/PlanHeader.jsx:81:16
default                                          react-spa/src/components/training/PriorityWorkouts.jsx:144:16
default                                          react-spa/src/components/training/ProfileSettingsForm.jsx:148:16
useActivityStreams                     function  react-spa/src/data/hooks/useActivityStreams.js:13:17
useCalendarMutations                   function  react-spa/src/data/hooks/useCalendarMutations.js:47:17
useGarageImages                        function  react-spa/src/data/hooks/useGarageImages.js:6:17
default                                          react-spa/src/pages/trainings/ActivityFilters.jsx:104:16
default                                          react-spa/src/pages/trainings/ActivityList.jsx:70:16
default                                          react-spa/src/pages/trainings/ActivityRow.jsx:36:16
default                                          react-spa/src/ui/Toast.jsx:81:16
default                                          react-spa/src/ui/useConfirm.jsx:54:16
default                                          react-spa/src/ui/useToast.js:18:16
isStravaImage                                    react-spa/src/utils/imageProxy.js:15:14
```

</details>

<details><summary><code>BikeLabApp</code> (13)</summary>

```
default                                          BikeLabApp/src/components/ShareStudio/BackgroundPicker.tsx:235:16
default                                          BikeLabApp/src/components/ShareStudio/ShareStudioModal.tsx:326:16
SCALE_FACTOR                                     BikeLabApp/src/components/ShareStudio/types.ts:35:14
default                                          BikeLabApp/src/components/ShareStudio/useScreenshotListener.ts:75:16
STRAVA_CLIENT_ID                                 BikeLabApp/src/config.ts:5:14
useUpdateChecklistItem                 function  BikeLabApp/src/data/hooks/useChecklist.ts:41:17
useCoachConversation                   function  BikeLabApp/src/data/hooks/useCoachConversation.ts:28:17
useDeleteGoal                          function  BikeLabApp/src/data/hooks/useDeleteGoal.ts:7:17
useGoals                               function  BikeLabApp/src/data/hooks/useGoals.ts:13:17
useSaveGoal                            function  BikeLabApp/src/data/hooks/useSaveGoal.ts:12:17
default                                          BikeLabApp/src/lib/logger.ts:15:16
ApiError                                         BikeLabApp/src/utils/api.ts:21:14
apiClient                                        BikeLabApp/src/utils/api.ts:76:14
```

</details>

### Unused exported types

<details><summary><code>BikeLabApp</code> (8)</summary>

```
TrendActivity             interface  BikeLabApp/src/components/coach/OvertrainingTrendCard.tsx:31:18
Colors                    type       BikeLabApp/src/theme/colors.ts:88:13
Radii                     type       BikeLabApp/src/theme/radii.ts:11:13
Shadows                   type       BikeLabApp/src/theme/shadows.ts:24:13
Spacing                   type       BikeLabApp/src/theme/spacing.ts:24:13
Typography                type       BikeLabApp/src/theme/typography.ts:29:13
OutgoingChatMessage       interface  BikeLabApp/src/types/coach.ts:97:18
CalendarPermissionStatus  type       BikeLabApp/src/utils/calendarSync.ts:24:13
```

</details>

### Duplicate exports

<details><summary><code>react-spa</code> (10)</summary>

```
DayGrid|default                      react-spa/src/components/training/DayGrid.jsx
PlanHeader|default                   react-spa/src/components/training/PlanHeader.jsx
PriorityWorkouts|default             react-spa/src/components/training/PriorityWorkouts.jsx
ProfileSettingsForm|default          react-spa/src/components/training/ProfileSettingsForm.jsx
ActivityFilters|default              react-spa/src/pages/trainings/ActivityFilters.jsx
ActivityList|default                 react-spa/src/pages/trainings/ActivityList.jsx
ActivityRow|default                  react-spa/src/pages/trainings/ActivityRow.jsx
ToastProvider|default                react-spa/src/ui/Toast.jsx
useConfirm|default                   react-spa/src/ui/useConfirm.jsx
useToast|default                     react-spa/src/ui/useToast.js
```

</details>

<details><summary><code>packages/shared</code> (1)</summary>

```
EventCreateSchema|EventUpdateSchema  packages/shared/src/types/event.ts
```

</details>

<details><summary><code>BikeLabApp</code> (4)</summary>

```
BackgroundPicker|default             BikeLabApp/src/components/ShareStudio/BackgroundPicker.tsx
ShareStudioModal|default             BikeLabApp/src/components/ShareStudio/ShareStudioModal.tsx
useScreenshotListener|default        BikeLabApp/src/components/ShareStudio/useScreenshotListener.ts
logger|default                       BikeLabApp/src/lib/logger.ts
```

</details>

## 3. depcheck — skipped

Ran `npx -y knip@5.88.1` per-workspace (above) and it already produces reliable
**Unused dependencies** / **Unused devDependencies** / **Unlisted dependencies** sections for all
four packages, including `BikeLabApp` (which is not an npm workspace but knip still analyzes fine
via its own workspace config) — e.g. it correctly flagged `pg`/`bcrypt` as unlisted in
`react-spa/e2e/global-setup.cjs` and `@getbrevo/brevo`/`debug` as unused in `server`. Since knip's
dependency analysis and depcheck solve the same problem and knip's results check out against a
manual `grep` spot-check (§2), adding depcheck too would just be two tools doing one job for no
extra signal. **No `.depcheckrc*` file was added.** If a future package's dependency findings from
knip look unreliable (e.g. heavy use of dynamic `require()` that knip's static analysis misses),
add depcheck for that package specifically and say why here.

## 4. `eslint --max-warnings 0`

- **react-spa**: `npm -w react-spa run lint` → 0 warnings, 0 errors (confirmed 2026-09-18). CI step
  flipped to strict: `npm -w react-spa exec -- eslint . --max-warnings 0` (the `--max-warnings 0`
  couldn't go into `react-spa/package.json`'s own `lint` script — only `engines` fields in that file
  are mine to touch per the task's file ownership — so it's passed as a CI-step-only flag instead).
- **server**: `npm -w server run lint` → **39 warnings, 0 errors** (unchanged, still just
  `npm -w server run lint` in CI, not strict). By rule:
  - `no-unused-vars` — 35 (mostly caught `catch (e)`/`catch (error)` blocks where the binding isn't
    read, plus a few destructured DB row fields never used)
  - `no-useless-assignment` — 2 (`server/services/analytics.js:157` `avgPerWeek`,
    `server/services/strava/activities.js:485` `formattedBikes`)
  - `eslint-comments/no-unused-disable`-style "Unused eslint-disable directive" — 2
    (`server/services/strava/activities.js:248`, `server/test/strava.client.test.js:98`)

  Full list with exact file:line is in `npm -w server run lint` output; not reproduced file-by-file
  here since it's all `no-unused-vars`/`no-useless-assignment` noise, not owned by this task (server
  source isn't mine to edit).
- **BikeLabApp**: kept report-only (`npx eslint . --max-warnings=1000 || true`, unchanged). Actual
  count measured 2026-09-18 in this worktree: **1,069 problems — 11 errors, 1,058 warnings**
  (`npm run lint` / `npx eslint .` from `BikeLabApp/`). This is much higher than the "94 warnings"
  figure in this task's brief — almost all of the gap is `no-restricted-syntax` (913 of the 1,058
  warnings; the project's "no hardcoded hex colors, use `src/theme` tokens" rule) plus
  `react/jsx-no-leaked-render` (93). Breakdown by rule:

  | Rule | Count |
  |---|---:|
  | `no-restricted-syntax` (hardcoded hex colors) | 913 |
  | `react/jsx-no-leaked-render` | 93 |
  | `react-native/no-inline-styles` | 35 |
  | `react/no-unstable-nested-components` | 7 |
  | `@typescript-eslint/no-unused-vars` | 6 (+ 5 more as **errors**, `no-unused-vars` allowed-pattern violations) |
  | `react-hooks/exhaustive-deps` | 4 (+ 4 more as **errors**, missing-dependency violations) |
  | `eslint-comments/no-unused-disable` | 2 |
  | `no-undef`, `no-catch-shadow`, `@typescript-eslint/no-shadow` | 1 each (errors) |

  Whoever owns the BikeLabApp fix pass in progress should treat **94 as stale** — either it was
  measured before the theme-token rule (`no-restricted-syntax`) was turned on/expanded, or before a
  batch of hex-color literals landed; re-check against this worktree's actual count before reporting
  progress. Target stays: 0 warnings, then flip this CI step to `--max-warnings 0` like react-spa.

## 5. `tsc --noEmit`

- **packages/shared**: added `"typecheck": "tsc --noEmit -p ."` to `packages/shared/package.json`
  and a required CI step in the `shared` job (`npm -w packages/shared run typecheck`) — it was
  **not** already in CI (the `shared` job only ran `build` + `test:coverage`; `tsup`'s `dts: true`
  catches some type errors while emitting but isn't a full `tsc --noEmit`). Ran locally: **clean,
  exit 0**.
- **BikeLabApp**: already has `"typecheck": "tsc --noEmit"` in `package.json` and a required CI step
  (`mobile` job, `npm run typecheck`) — no change needed, confirmed still present.
- **react-spa**: JS, not TS — no `tsc --noEmit` added. Documented here per the task: it arrives with
  a future TS migration of `react-spa`, not before.

## 6. `npm audit --audit-level=high`

Ran both audits in this worktree (`node_modules` present, network available):

```
npm audit --audit-level=high                    → EXIT 1, 12 vulnerabilities (2 critical, 9 moderate, 1 low)
npm audit --workspace server --audit-level=high  → EXIT 1, 11 vulnerabilities (2 critical, 8 moderate, 1 low)
```

Both **fail**, so the existing server-job step stays report-only
(`npm audit --workspace server --audit-level=high || true`, unchanged) and no root-level required
step was added. Advisories (all transitive, root-level `npm audit fix --force` would force
breaking major-version bumps):

| Package | Severity | Advisory | Pulled in by |
|---|---|---|---|
| `form-data` ≤2.5.5 | **critical** | Unsafe random boundary + CRLF injection (GHSA-fjxv-7rqg-78g4, GHSA-hmw2-7cc7-3qxx) | `request` → `@getbrevo/brevo` (server dep) |
| `qs` ≤6.15.3 | moderate | DoS via `arrayLimit`/`isBuffer` (GHSA-6rw7-vpxm-498p, GHSA-4mjr-xmp4-gh2g) | same chain |
| `tough-cookie` <4.1.3 | moderate | Prototype pollution (GHSA-72xf-g2v4-qvf3) | same chain, also via `jsdom` → `gpxparser` (react-spa dep) |
| `uuid` <11.1.1 | moderate | Missing buffer bounds check in v3/v5/v6 (GHSA-w5hq-g745-h8pq) | `imagekit` (server dep) |
| `esbuild` 0.27.3–0.28.0 | low | Dev-server arbitrary file read on Windows (GHSA-g7r4-m6w7-qqqr) | `tsup`/vite toolchain (dev-only) |

The critical/moderate chain is entirely `@getbrevo/brevo@2.x`'s old `request`-based HTTP client;
fixing it needs `@getbrevo/brevo@6.0.3` (breaking change, server source not owned by this task —
flag for the server owner). `uuid` needs `imagekit@1.5.0` (also breaking, same reasoning). `esbuild`
is dev-tooling only (not shipped) and has a fix-without-force available
(`npm audit fix`, no major bump) — safe for whoever owns `packages/shared`'s dependencies to pick up
separately.

## 7. Node 22

`engines.node` set to `">=22 <23"` in root `package.json`, `server/package.json`,
`packages/shared/package.json`, `react-spa/package.json`, `BikeLabApp/package.json` (all previously
either `"20.x"`, `">=20"`, or absent). `.nvmrc` added (`22`). All 5 `node-version:` entries in
`.github/workflows/ci.yml` bumped from `20` to `22`.

This container already runs **Node v22.22.2** (`node -v`), so no Node-version mismatch to work
around. Verified with the container's actual Node:
- `cd packages/shared && npx vitest run` → **541 passed (50 files)**
- `cd server && npm test` → **186 tests passed, 5 skipped (27 test files passed, 1 skipped)**

Note: `.node-version` at the repo root still says `20` (likely read by Render for the deploy
runtime) and is now inconsistent with the new `.nvmrc`/CI value — it's an existing root file not in
this task's owned list (only *new* root config files + `engines` fields), so it wasn't touched.
**Owner action:** bump `.node-version` to `22` too, or Render will keep deploying the server on
Node 20 while CI tests on 22.

## 8. Sentry release + source maps (server)

Checked `server/lib/sentry.js` — **already implemented**, no change needed:

```js
release: process.env.RENDER_GIT_COMMIT || undefined,
```

This is Render's own env var (set automatically on every deploy, no `SENTRY_RELEASE` needed) fed
straight into `Sentry.init({ release })`. It's the same idea the task's minimal-approach suggested
(`SENTRY_RELEASE=$RENDER_GIT_COMMIT` + `release: process.env.SENTRY_RELEASE`), just one env var
shorter since it reads `RENDER_GIT_COMMIT` directly instead of re-exporting it under a new name.
**No diff to apply** — source maps aren't uploaded anywhere yet (no `@sentry/cli`/webpack-plugin
step in the build), which would be the next increment if the owner wants readable stack traces in
Sentry; out of scope for this gates pass since it needs a Sentry auth token as a deploy secret.

## Files touched in this branch

- `package.json` (root): `engines`, `scripts.lint:dup`, `scripts.lint:deadcode`,
  `devDependencies.jscpd@4.0.5`, `devDependencies.knip@5.88.1`
- `.jscpd.json` (new)
- `knip.json` (new)
- `.nvmrc` (new, `22`)
- `.gitignore`: added `.jscpd-report/` (jscpd's own JSON report output dir, same category as the
  other build-artifact ignores already in the file — not in this task's owned-files list but a
  one-line addition needed so nobody accidentally commits a 500KB report)
- `.github/workflows/ci.yml`: all `node-version: 20` → `22`; new `quality` job (jscpd required,
  knip report-only); `shared` job gets a `typecheck` step; `web` job's lint step flipped to
  `--max-warnings 0`
- `server/package.json`, `packages/shared/package.json`, `react-spa/package.json`,
  `BikeLabApp/package.json`: `engines.node` → `">=22 <23"`
- `packages/shared/package.json`: added `scripts.typecheck`
- `docs/audit/quality-gates.md` (this file, new)

## Packages to install at root (owner: run `npm install` once, not this worktree)

- `jscpd@4.0.5` (devDependency)
- `knip@5.88.1` (devDependency)

## Nothing needed for files this task doesn't own

- No source-code changes proposed for `server`/`react-spa`/`BikeLabApp`/`packages/shared` — every
  finding above (duplication blocks, knip's dead-code/dependency findings, the 39 server lint
  warnings, the BikeLabApp lint count) is reported for a follow-up, not fixed here.
- `react-spa/package.json`'s `dependencies` (missing `pg`/`bcrypt` for `e2e/global-setup.cjs`, per
  knip) and `server/package.json`'s `dependencies` (`@getbrevo/brevo`, `debug` unused; also its
  upgrade path for the `npm audit` critical) are not touched — outside this task's file ownership.
