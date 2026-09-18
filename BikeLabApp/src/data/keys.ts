// Central TanStack Query key registry (T-5.1, A-17: "44 endpoints called
// directly from 30 files, no data layer"). Every hook in src/data/hooks
// builds its query key from here so invalidation sites (mutations,
// signOut) don't have to guess a hook's key shape.
export type CalendarRange = {from?: string; to?: string; type?: string; goalId?: string | number};

export const queryKeys = {
  profile: ['profile'] as const,
  activities: (_opts?: {force?: boolean}) => ['activities'] as const,
  bikes: ['bikes'] as const,
  goals: ['goals'] as const,
  metaGoals: ['metaGoals'] as const,
  metaGoalDetail: (id: string | number) => ['metaGoals', id] as const,
  calendar: (range?: CalendarRange) => ['calendar', range ?? {}] as const,
  skills: ['skills'] as const,
  // Static reference catalog (server/recommendations/training-types.json) —
  // no params, one shared cache entry (T-5.4, GoalDetailsScreen split).
  trainingTypes: ['trainingTypes'] as const,
  analyticsSummary: (period: string) => ['analyticsSummary', period] as const,
  achievements: ['achievements'] as const,
  analyticsSnapshotLatest: ['analyticsSnapshotLatest'] as const,
  analyticsSnapshotHistory: (limit: number) => ['analyticsSnapshotHistory', limit] as const,
  // T-5.4/A-27: GET /api/garage/positions (GarageScreen's bike-garage photo
  // slots) — replaces the `garage_images_cache` AsyncStorage entry.
  garageImages: ['garageImages'] as const,
  // T-5.4/A-27: GET /api/weather/forecast?latitude&longitude (WeatherBlock's
  // coast/mountain forecasts) — replaces the `weather_data_cache` AsyncStorage
  // entry. Keyed by coordinates so distinct locations don't collide.
  weather: (latitude: number, longitude: number) => ['weather', latitude, longitude] as const,
  activityStreams: (activityId: string | number, downsample: number | null) =>
    ['activityStreams', activityId, downsample] as const,
  activityFtpAnalysis: (activityId: string | number) => ['activityFtpAnalysis', activityId] as const,
  activityAiAnalysis: (activityId: string | number) => ['activityAiAnalysis', activityId] as const,
  activityMetaGoalsProgress: (activityId: string | number) =>
    ['activityMetaGoalsProgress', activityId] as const,
  // `legacyCache` (T-5.1) used to namespace utils/cache.ts's deprecated
  // shim's ad-hoc string keys. That shim's only caller was
  // RideAnalyticsScreen.tsx (T-5.4); now migrated to
  // useActivityMetaGoalsProgress, utils/cache.ts and this key were deleted.
  // AI Coach conversations (T-5.x wave 2) — GET /api/coach/conversations(/:id).
  coachConversations: ['coachConversations'] as const,
  coachConversation: (id: string, limit?: number) => ['coachConversation', id, limit ?? null] as const,
  // GET /api/oura/status (OuraIntegrationScreen) — see useOuraStatus.ts.
  ouraStatus: ['oura', 'status'] as const,
  // GET /api/checklist (ChecklistScreen + Garage's ChecklistPreview) — owner
  // decision 18.09, ported "as is" from react-spa/src/data/hooks/useChecklist.js.
  checklist: ['checklist'] as const,
} as const;
