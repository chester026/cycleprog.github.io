// Central navigation param types (audit A-08/A-09/A-22, T-5.2).
//
// One flat `AppNavigationProp` (see hooks.ts's `useAppNavigation()`) is used
// from every screen regardless of which nested navigator it actually lives
// in. The tree nests up to 3 deep — Root Stack > Main Tabs > per-tab Stack —
// and several screens navigate straight past their own parent into a
// sibling tab or the root stack (e.g. CoachChatScreen -> ProfileTab/
// AppleHealth, GarageScreen -> RideAnalytics, RideAnalyticsScreen ->
// Main/GoalsTab/CoachChat). A single composite type merging every
// navigator's `navigate()` overloads is simpler to keep correct across ~20
// screens than a bespoke `CompositeNavigationProp` per screen — the
// trade-off is it can't catch "this particular screen can't actually reach
// that route" at compile time, only "that route/param shape doesn't exist
// anywhere in the app". Route names and param shapes are still fully
// checked, which is what A-08/A-09 actually flagged (`navigation: any` /
// `as never` swallowing typos and wrong param shapes silently).
import type {
  CompositeNavigationProp,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {Activity} from '../types/activity';

export type GarageStackParamList = {
  Garage: undefined;
  // Bike gear ids are Strava gear ids ('b1234…') or the synthetic 'total' —
  // always strings (see @bikelab/shared/types Bike.id). Omitted entirely
  // when opened from the tab bar rather than a specific bike's card.
  BikeGarage: {bikeId?: string} | undefined;
  Achievements: undefined;
  Activities: undefined;
  // `focusAddItem` opens the screen with its "+ New section" affordance
  // already expanded — used by Garage's ChecklistPreview trailing card and
  // the ChecklistUpdatedCard coach card, both of which take the rider
  // straight to adding rather than just viewing.
  Checklist: {focusAddItem?: boolean} | undefined;
};

// CoachChatScreen fires each of these at most once per `requestId` (a
// `useRef<Set<number>>`, see the screen) instead of the old per-mount
// `fired*Ref` guards, which missed a second `navigate('CoachChat', ...)`
// into an already-mounted screen (A-22) — every call site below is
// expected to pass a fresh `requestId` (e.g. `Date.now()`) alongside
// whichever of `initialPrompt`/`openConversationId` it's delivering.
export type CoachChatParams = {
  initialPrompt?: string;
  activityId?: number;
  calendarEventId?: number;
  openConversationId?: string;
  requestId?: number;
};

export type GoalsStackParamList = {
  CoachChat: CoachChatParams | undefined;
  // MetaGoal.id (@bikelab/shared/types) is `number | string` — the server
  // returns it either way depending on the row's source — so this has to
  // match rather than narrowing to `number` and breaking every real
  // `navigate('GoalDetails', {goalId: someMetaGoal.id})` call site.
  GoalDetails: {goalId: number | string};
};

export type ProfileStackParamList = {
  Profile: undefined;
  PersonalInfo: undefined;
  AccountSettings: undefined;
  HRZones: undefined;
  TrainingSettings: undefined;
  StravaIntegration: undefined;
  AppleHealth: undefined;
  OuraIntegration: undefined;
  Achievements: undefined;
  CoachMemory: undefined;
};

export type CalendarStackParamList = {
  Calendar: undefined;
};

export type MainTabParamList = {
  GarageTab: NavigatorScreenParams<GarageStackParamList> | undefined;
  GoalsTab: NavigatorScreenParams<GoalsStackParamList> | undefined;
  AnalysisTab: undefined;
  CalendarTab: NavigatorScreenParams<CalendarStackParamList> | undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type RootStackParamList = {
  Login: {skipTokenCheck?: boolean} | undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  RideAnalytics: {activity: Activity};
};

// Lets `useNavigation()` / `useRoute()` (including call sites this task
// didn't touch) resolve against real route names instead of falling back to
// `never`/loose generics — see
// https://reactnavigation.org/docs/typescript/#specifying-default-types-for-usenavigation-link-ref-etc.
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

// Every screen in the tree, flattened — lets `useAppRoute<'X'>()` (hooks.ts)
// type a screen's route by name alone, regardless of which stack "X"
// actually belongs to. Names are unique across the five param lists above,
// so intersecting them is safe (a name repeated in two lists, e.g.
// `Achievements` in both GarageStackParamList and ProfileStackParamList,
// carries the same param shape in both).
export type AllScreensParamList = RootStackParamList &
  MainTabParamList &
  GarageStackParamList &
  GoalsStackParamList &
  ProfileStackParamList &
  CalendarStackParamList;

export type AppNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList>,
  CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    CompositeNavigationProp<
      NativeStackNavigationProp<GarageStackParamList>,
      CompositeNavigationProp<
        NativeStackNavigationProp<GoalsStackParamList>,
        CompositeNavigationProp<
          NativeStackNavigationProp<ProfileStackParamList>,
          NativeStackNavigationProp<CalendarStackParamList>
        >
      >
    >
  >
>;
