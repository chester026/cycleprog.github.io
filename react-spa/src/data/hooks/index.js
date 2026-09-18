// T-6.2 — barrel for src/data/hooks. Pages/components import hooks from
// here (`from '../data/hooks'`) rather than each hook's own file, so the
// import list at the top of a migrated page reads like a data-requirements
// summary. Append new hooks at the end (shared registry, see GUIDE-6.md).
export { useProfile } from './useProfile';
export { useUpdateProfile } from './useUpdateProfile';
export { useActivities } from './useActivities';
export { useBikes } from './useBikes';
export { useGoals } from './useGoals';
export { useSaveGoal } from './useSaveGoal';
export { useDeleteGoal } from './useDeleteGoal';
export { useMetaGoals, useMetaGoal } from './useMetaGoals';
export { useSaveMetaGoal } from './useSaveMetaGoal';
export { useDeleteMetaGoal } from './useDeleteMetaGoal';
export { useCalendar } from './useCalendar';
export {
  useCalendarMutations,
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from './useCalendarMutations';
export { useSkills } from './useSkills';
export { useAnalyticsSummary } from './useAnalyticsSummary';
export { useAchievements } from './useAchievements';
export { useAnalyticsSnapshotHistory } from './useAnalyticsSnapshotHistory';
export { useActivityStreams } from './useActivityStreams';
export { useHeroImages } from './useHeroImages';
export { useGarageImages } from './useGarageImages';
export { useWeather } from './useWeather';
export { useTrainingPlan } from './useTrainingPlan';
export { useTrainingTypes } from './useTrainingTypes';

// --- Appended by T-6.2 for owned components/pages the README's core hook
// list doesn't name (events, rides, checklist, per-bike health, admin's
// hero/strava panels). Same registry, same invalidation model. ---
export { useEvents, useSaveEvent, useDeleteEvent } from './useEvents';
export { useRides, useAddRide, useDeleteRide } from './useRides';
export {
  useChecklist,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useDeleteChecklistSection,
} from './useChecklist';
export { useBikeHealth, useResetBikeComponent, useSaveBikeLabels } from './useBikeHealth';
export {
  useAdminHeroImages,
  useAdminUsers,
  useAdminStravaTokens,
  useAdminStravaLimits,
  useSaveStravaTokens,
  useRefreshStravaLimits,
  useDeleteHeroPosition,
  useAssignAllHeroImages,
  useUploadHeroImage,
  useUnlinkAdminUserStrava,
  useDeleteAdminUser,
  useDatabaseMemoryInfo,
  useDatabaseTableStats,
  useDatabaseProfiles,
  useClearDatabaseCache,
  useOptimizeDatabase,
  useAdminAiUsage,
} from './useAdmin';
export { useAiAnalysis } from './useAiAnalysis';
export { useActivityAnalysis } from './useActivityAnalysis';
export { useGenerateAiGoals } from './useGenerateAiGoals';
export { useUnlinkStrava } from './useUnlinkStrava';
export { useDeviceBrand } from './useDeviceBrand';

// --- Appended by T-6.3 (WeeklyTrainingCalendar split, audit W-21). ---
export { useSaveCustomTraining } from './useSaveCustomTraining';
export { useDeleteCustomTraining } from './useDeleteCustomTraining';
// T-6.3 — MyRidesBlock/RideAddModal "Edit ride" action.
export { useUpdateRide } from './useUpdateRide';
// --- Appended by T-6.3 (OnboardingModal/ProfilePage decomposition): the
// onboarding wizard's own two apiFetch-in-a-component calls, and a brand
// new account-deletion mutation ProfilePage's Account Danger Zone needed
// but no hook existed for yet. ---
export { useCompleteOnboarding } from './useCompleteOnboarding';
export { useChangeEmail } from './useChangeEmail';
export { useDeleteAccount } from './useDeleteAccount';
// T-6/audit follow-up — HeartRateZonesChart's server-computed time-in-HR-zones.
export { useHrZonesDistribution } from './useHrZonesDistribution';
