# src/data — contract (phase 6, T-6.2)

TanStack Query, mirroring BikeLabApp/src/data:
- `queryClient.js` — QueryClient (staleTime 5 min, gcTime 24h, retry 1) + `persistQueryClient`
  with `createSyncStoragePersister` (localStorage key `bikelab.query.v1`, buster = app version).
- `QueryProvider.jsx` — `PersistQueryClientProvider` wrapper, mounted in `main.jsx`.
- `keys.js` — every query key in one place: `queryKeys.profile`, `activities`, `bikes`, `goals`,
  `metaGoals`, `metaGoal(id)`, `calendar(range)`, `skills`, `analyticsSummary(period)`, `achievements`,
  `analyticsSnapshotHistory(limit)`, `activityStreams(id, downsample)`, `heroImages`, `garageImages`,
  `weather(lat, lon)`, `trainingPlan`, `trainingTypes`, `adminUsers`, `adminStravaStatus`, `adminAiUsage(days)`.
- `hooks/` — one file per hook: `useProfile`, `useActivities`, `useBikes`, `useGoals`, `useMetaGoals`,
  `useMetaGoal(id)`, `useCalendar(range)`, `useSkills`, `useAnalyticsSummary(period)`, `useAchievements`,
  `useAnalyticsSnapshotHistory`, `useActivityStreams`, `useHeroImages`, `useGarageImages`, `useWeather`,
  `useTrainingPlan`, `useTrainingTypes`, mutations `useUpdateProfile`, `useSaveGoal`, `useDeleteGoal`,
  `useSaveMetaGoal`, `useDeleteMetaGoal`, `useCalendarMutations`. All use `apiFetch` from `utils/api.js`.
- Logout → `queryClient.clear()` + persister `removeClient()`.
Rule: no `localStorage` for server data anywhere else (DoD W-18). `utils/cache.js`, `cacheCheckup.js`,
`cacheConstants.js`, `heroImages.js` (cache part), `goalsCache.js`, `components/CacheStatus.jsx` are
deleted by T-6.2; `DatabaseMemoryInfo.jsx` was deleted in T-7.1 (its server routes never existed).
