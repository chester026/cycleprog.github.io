# src/data — contract (phase 6, T-6.2)

TanStack Query, mirroring BikeLabApp/src/data:
- `queryClient.js` — QueryClient (staleTime 5 min, gcTime 24h, retry 1) + `persistQueryClient`
  with `createSyncStoragePersister` (localStorage key `bikelab.query.v1`, buster = `__BUILD_HASH__` from
  Vite's `define` — git short sha, or the build time). `shouldDehydrateQuery` keeps `coachConversation*`
  and `admin*` queries out of localStorage.
- `QueryProvider.jsx` — `PersistQueryClientProvider` wrapper, mounted in `main.jsx`.
- `keys.js` — every query key in one place: `queryKeys.profile`, `activities`, `bikes`, `goals`,
  `metaGoals`, `metaGoal(id)`, `calendar(range)`, `skills`, `analyticsSummary(period)`, `achievements`,
  `analyticsSnapshotHistory(limit)`, `hrZonesDistribution(period)`, `ftp(days)`, `heroImages`, `garageImages`,
  `weather(lat, lon)`, `trainingPlan`, `trainingTypes`, `adminUsers`, `adminStravaStatus`, `adminAiUsage(days)`,
  `coachConversations`, `coachConversation(id)`, `coachConversationByActivity(id)`, ….
- `hooks/` — one file per hook: `useProfile`, `useActivities`, `useBikes`, `useGoals`, `useMetaGoals`,
  `useMetaGoal(id)`, `useCalendar(range)`, `useSkills`, `useAnalyticsSummary(period)`, `useAchievements`,
  `useAnalyticsSnapshotHistory`, `useHrZonesDistribution(period)`, `useFtp(days)`, `useHeroImages`,
  `useGarageImages`, `useWeather`, `useTrainingPlan`, `useTrainingTypes`, mutations `useUpdateProfile`,
  `useSaveGoal`, `useDeleteGoal`, `useSaveMetaGoal`, `useDeleteMetaGoal`, `useCalendarMutations`, coach
  `useCoachConversations`, `useCoachConversation(id)` (+ `fetchCoachConversation`), `useConversationByActivity`,
  `useDeleteConversation`, `useRenameConversation`, ….
  Every hook calls `call(<contract endpoint>)` from `api.js` — never a path string (CLAUDE.md rule 1).
  `stream(path, body, {signal})` from the same module is the SSE path for the coach chat (read with
  `readSseJson` from `@bikelab/shared/api`).
- Logout → `queryClient.clear()` + persister `removeClient()`.
Rule: no `localStorage` for server data anywhere else (DoD W-18). `utils/cache.js`, `cacheCheckup.js`,
`cacheConstants.js`, `heroImages.js` (cache part), `goalsCache.js`, `components/CacheStatus.jsx` are
deleted by T-6.2; `DatabaseMemoryInfo.jsx` was deleted in T-7.1 (its server routes never existed).
