// NavigationContainer's `linking` prop — App.tsx wires this in (see the
// nav-agent report for the exact snippet). `prefixes` mirrors the
// schemes/host the old inline deep-link handler matched by hand (see
// deepLinks.ts): the custom `bikelab://` scheme and the `bikelab.app`
// Universal Link host.
//
// None of today's OAuth-callback pseudo-routes (`bikelab://auth`,
// `bikelab://strava-linked`, `bikelab://oura`) are real screens, so they
// deliberately have NO entry in `config.screens` below — they're
// side-effecting flows (token exchange, an event emit), not navigation, and
// stay owned by `deepLinks.ts#handleAuthDeepLink` via App.tsx's existing
// `Linking.addEventListener('url', ...)`. A `bikelab://...` URL that
// doesn't match any path here is simply not navigated (React Navigation's
// linking resolver no-ops on no match) — the two listeners don't conflict,
// they just both see the same 'url' event.
//
// `RideAnalytics` is intentionally left out of `screens` too: its only
// param is a full `Activity` object (see types.ts), which isn't something a
// URL can carry — there's no `bikelab://ride/:id` flow today. If one is
// added later, it would need to fetch the activity by id itself rather than
// expect it in the URL.
import type {LinkingOptions} from '@react-navigation/native';
import type {RootStackParamList} from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['bikelab://', 'https://bikelab.app'],
  config: {
    screens: {
      Login: 'login',
      Onboarding: 'onboarding',
      Main: {
        screens: {
          GarageTab: {
            screens: {
              Garage: 'garage',
              BikeGarage: 'garage/bike/:bikeId',
              Achievements: 'garage/achievements',
              Activities: 'garage/activities',
            },
          },
          GoalsTab: {
            screens: {
              // CoachChatScreen's real params (initialPrompt, activityId,
              // calendarEventId, openConversationId, requestId) are
              // in-app-navigation-only — nothing deep-links into a specific
              // conversation today, so this path carries none of them.
              CoachChat: 'coach',
              // goalId is `number | string` (see types.ts) — a URL's
              // `:goalId` segment is always a string already, so no `parse`
              // coercion is needed here.
              GoalDetails: 'goals/:goalId',
            },
          },
          AnalysisTab: 'analysis',
          CalendarTab: {
            screens: {
              Calendar: 'calendar',
            },
          },
          ProfileTab: {
            screens: {
              Profile: 'profile',
              PersonalInfo: 'profile/personal-info',
              AccountSettings: 'profile/account',
              HRZones: 'profile/hr-zones',
              TrainingSettings: 'profile/training',
              StravaIntegration: 'profile/strava',
              AppleHealth: 'profile/apple-health',
              OuraIntegration: 'profile/oura',
              Achievements: 'profile/achievements',
            },
          },
        },
      },
    },
  },
};
