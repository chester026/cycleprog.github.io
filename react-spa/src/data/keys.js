// Central TanStack Query key registry (T-6.2, audit W-18/W-19/W-22/W-29/W-33
// — cache.js/cacheCheckup.js/goalsCache.js/heroImages.js each ran their own
// ad-hoc localStorage TTL cache, several keyed by `${key}_${userId}` by
// hand). Every hook in src/data/hooks builds its query key from here so
// invalidation sites (mutations, logout) don't have to guess a hook's key
// shape.
//
// Keys are NOT scoped by userId here (unlike the old `activities_${userId}`
// localStorage keys) — logout instead clears the whole query cache
// (queryClient.clear() + persister.removeClient(), see queryClient.js /
// QueryProvider.jsx's registerLogoutCleanup wiring), which is simpler and
// safer than trusting every call site to pass the right id.
export const queryKeys = {
  profile: ['profile'],
  activities: () => ['activities'],
  bikes: ['bikes'],
  goals: ['goals'],
  metaGoals: ['metaGoals'],
  metaGoal: (id) => ['metaGoals', id],
  calendar: (range) => ['calendar', range ?? {}],
  skills: ['skills'],
  analyticsSummary: (period) => ['analyticsSummary', period ?? null],
  achievements: ['achievements'],
  analyticsSnapshotHistory: (limit) => ['analyticsSnapshotHistory', limit],
  activityStreams: (activityId, downsample) => ['activityStreams', activityId, downsample ?? null],
  heroImages: ['heroImages'],
  garageImages: ['garageImages'],
  weather: (lat, lon) => ['weather', lat, lon],
  trainingPlan: ['trainingPlan'],
  trainingTypes: ['trainingTypes'],
  adminUsers: ['adminUsers'],
  adminStravaStatus: ['adminStravaStatus'],
  adminAiUsage: (days) => ['adminAiUsage', days],

  // --- Appended by T-6.2 for owned components/pages the README's core list
  // above doesn't name (events, rides, checklist, per-bike health, admin's
  // hero/strava panels) — same registry, same invalidation model. ---
  events: ['events'],
  rides: ['rides'],
  checklist: ['checklist'],
  bikeHealth: (bikeId) => ['bikeHealth', bikeId],
  adminHeroImages: ['adminHeroImages'],
  adminStravaLimits: ['adminStravaLimits'],

  // T-6.4 — replaces the `device_${brandKey}_${userId}` localStorage cache
  // in components/PartnersLogo.jsx.
  deviceBrand: (brandKey, activityIds) => ['deviceBrand', brandKey, activityIds],

  // T-6.3 — GoalDetailPage's RecommendationsSection.

  // T-6/audit follow-up — HeartRateZonesChart's server-computed time-in-
  // HR-zones (GET /api/analytics/hr-zones), replacing its client-side
  // per-activity streams downloads.
  hrZonesDistribution: (period) => ['hrZonesDistribution', period ?? null],

  // Coach memory (CoachMemoryCard) — GET/POST/PUT/DELETE /api/coach/notes.
  coachNotes: ['coachNotes'],
};
