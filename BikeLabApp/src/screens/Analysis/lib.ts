// Pure logic extracted from AnalysisScreen.tsx (T-5.4 screen decomposition,
// docs/audit/00-AUDIT-AND-PLAN.md T-5.4). No React/React Native imports
// here on purpose — this is what the unit tests in lib.test.ts exercise
// directly. Behaviour copied 1:1 from the original inline implementation;
// see git history on AnalysisScreen.tsx for the pre-extraction version.
import type {Activity} from '../../types/activity';
import type {UserProfile} from '@bikelab/shared/types';
import {
  getDateOfISOWeek,
  getISOWeekNumber,
  getISOYear,
  median,
  computeHrZones,
} from '@bikelab/shared/calc';
import type {HrZones} from '@bikelab/shared/calc';

// `plan_description`/`weekly_goal_km` are returned by GET /api/user-profile
// (server/recommendations/index.js) but aren't part of the shared
// `UserProfileSchema` yet (T-2.2 didn't cover every ad-hoc recommendation
// field) — the schema is `.passthrough()` so they survive parsing at
// runtime, just not in the static type. Extending locally here instead of
// widening the shared schema (out of this task's file ownership) or
// falling back to `any`.
export type AnalysisUserProfile = UserProfile & {
  plan_description?: string | null;
  weekly_goal_km?: number | null;
};

export type GoalType =
  | 'speed_flat'
  | 'speed_hills'
  | 'easy_distance'
  | 'easy_speed'
  | 'easy_elevation';

export interface FourWeekPeriod {
  activities: Activity[];
  startDate: Date;
  endDate: Date;
}

export interface PeriodProgress {
  avg: number;
  all: number[];
  start: Date;
  end: Date;
}

export interface HeroSummary {
  totalRides: number;
  totalKm: number;
  totalTime: number;
  totalElevation: number;
  longRidesCount: number;
  plan: {rides: number; km: number; long: number};
  progress: {rides: number; km: number; long: number};
}

export interface PlanInfo {
  description: string;
  details: string;
}

/** HR zones for the current user (T-3.1): prefer the server-derived value
 * on the profile (`GET /api/user-profile` always sets it); fall back to
 * computing it locally if the profile hasn't loaded yet. */
export function calculateUserHRZones(userProfile: AnalysisUserProfile | null | undefined): HrZones {
  if (userProfile?.hr_zones?.zones) return userProfile.hr_zones as HrZones;
  return computeHrZones(userProfile || {});
}

export function getGoalOrFallback(
  goalType: GoalType,
  experienceLevel: string,
): number {
  if (goalType === 'speed_flat') {
    switch (experienceLevel) {
      case 'beginner':
        return 25;
      case 'intermediate':
        return 30;
      case 'advanced':
        return 35;
      default:
        return 30;
    }
  } else if (goalType === 'speed_hills') {
    switch (experienceLevel) {
      case 'beginner':
        return 15;
      case 'intermediate':
        return 17.5;
      case 'advanced':
        return 20;
      default:
        return 17.5;
    }
  } else if (goalType === 'easy_distance') {
    switch (experienceLevel) {
      case 'beginner':
        return 20;
      case 'intermediate':
        return 25;
      case 'advanced':
        return 30;
      default:
        return 25;
    }
  } else if (goalType === 'easy_speed') {
    switch (experienceLevel) {
      case 'beginner':
        return 18;
      case 'intermediate':
        return 20;
      case 'advanced':
        return 22;
      default:
        return 20;
    }
  } else if (goalType === 'easy_elevation') {
    switch (experienceLevel) {
      case 'beginner':
        return 200;
      case 'intermediate':
        return 300;
      case 'advanced':
        return 400;
      default:
        return 300;
    }
  }

  return 30;
}

/** Percent-of-goal breakdown for one 4-week period (ported verbatim). */
export function percentForPeriod(
  periodActivities: Activity[],
  startDate: Date,
  endDate: Date,
  userProfile: AnalysisUserProfile | null | undefined,
): PeriodProgress {
  const experienceLevel = userProfile?.experience_level || 'intermediate';
  const speedFlatGoal = getGoalOrFallback('speed_flat', experienceLevel);
  const speedHillGoal = getGoalOrFallback('speed_hills', experienceLevel);
  const easyDistanceGoal = getGoalOrFallback('easy_distance', experienceLevel);
  const easySpeedGoal = getGoalOrFallback('easy_speed', experienceLevel);
  const easyElevationGoal = getGoalOrFallback('easy_elevation', experienceLevel);

  // Flat rides
  const flats = periodActivities.filter(
    a =>
      a.distance > 20000 &&
      a.total_elevation_gain < a.distance * 0.005 &&
      a.average_speed * 3.6 < 40,
  );
  const flatSpeeds = flats.map(a => a.average_speed * 3.6);
  const medianFlatSpeed = median(flatSpeeds);
  const flatSpeedPct = Math.round((medianFlatSpeed / speedFlatGoal) * 100);

  // Hill rides
  const hills = periodActivities.filter(
    a =>
      a.distance > 5000 &&
      (a.total_elevation_gain > a.distance * 0.015 ||
        a.total_elevation_gain > 500) &&
      a.average_speed * 3.6 < 25,
  );
  const hillSpeeds = hills.map(a => a.average_speed * 3.6);
  const medianHillSpeed = median(hillSpeeds);
  const hillSpeedPct = Math.floor((medianHillSpeed / speedHillGoal) * 100);

  // HR Zones (userHRZones.zones is an array, index 0 = zone 1 … index 4 = zone 5)
  const userHRZones = calculateUserHRZones(userProfile).zones;
  const flatsInZone = flats.filter(
    a =>
      a.average_heartrate &&
      a.average_heartrate >= userHRZones[0].min &&
      a.average_heartrate <= (userHRZones[2].max ?? Infinity),
  ).length;
  const flatZonePct = flats.length
    ? Math.round((flatsInZone / flats.length) * 100)
    : 0;

  const hillsInZone = hills.filter(
    a =>
      a.average_heartrate &&
      a.average_heartrate >= userHRZones[2].min &&
      a.average_heartrate <= (userHRZones[3].max ?? Infinity),
  ).length;
  const hillZonePct = hills.length
    ? Math.round((hillsInZone / hills.length) * 100)
    : 0;

  const pulseGoalPct =
    flats.length && hills.length
      ? Math.round((flatZonePct + hillZonePct) / 2)
      : flatZonePct || hillZonePct;

  // Long rides
  const longRides = periodActivities.filter(
    a => a.distance > 50000 || a.moving_time > 2.5 * 3600,
  );
  const longTarget = 4;
  const longRidePct = Math.round((longRides.length / longTarget) * 100);

  // Easy rides
  const easyRides = periodActivities.filter(
    a =>
      (a.distance < easyDistanceGoal * 1000 ||
        a.average_speed * 3.6 < easySpeedGoal) &&
      a.total_elevation_gain < easyElevationGoal,
  );
  const easyPct = Math.round((easyRides.length / 4) * 100);

  const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, easyPct];
  const avg = Math.round(all.reduce((sum, val) => sum + val, 0) / all.length);

  return {avg, all, start: startDate, end: endDate};
}

/** Groups activities into 4-week cycles per ISO year (ported verbatim). */
export function calculate4WeekPeriods(activities: Activity[]): FourWeekPeriod[] {
  if (activities.length === 0) return [];

  const sortedActivities = activities
    .slice()
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  const periods: FourWeekPeriod[] = [];
  const activitiesByYear: Record<number, Activity[]> = {};

  sortedActivities.forEach(activity => {
    const year = getISOYear(new Date(activity.start_date));
    if (!activitiesByYear[year]) {
      activitiesByYear[year] = [];
    }
    activitiesByYear[year].push(activity);
  });

  Object.keys(activitiesByYear)
    .sort()
    .forEach(yearStr => {
      const year = parseInt(yearStr, 10);
      const yearActivities = activitiesByYear[year];

      const weekNumbers = yearActivities.map(a =>
        getISOWeekNumber(new Date(a.start_date)),
      );
      const minWeek = Math.min(...weekNumbers);
      const maxWeek = Math.max(...weekNumbers);

      for (
        let cycleIndex = 0;
        minWeek + cycleIndex * 4 <= maxWeek;
        cycleIndex++
      ) {
        const startWeekInCycle = minWeek + cycleIndex * 4;

        const cycleStartDate = getDateOfISOWeek(startWeekInCycle, year);
        const cycleEndDate = getDateOfISOWeek(startWeekInCycle + 3, year);
        cycleEndDate.setDate(cycleEndDate.getDate() + 6);

        const cycleActivities = yearActivities.filter(a => {
          const activityDate = new Date(a.start_date);
          return activityDate >= cycleStartDate && activityDate <= cycleEndDate;
        });

        if (cycleActivities.length > 0) {
          periods.push({
            activities: cycleActivities,
            startDate: cycleStartDate,
            endDate: cycleEndDate,
          });
        }
      }
    });

  return periods;
}

export function computeHeroSummary(
  filteredActivities: Activity[],
  userProfile: AnalysisUserProfile | null | undefined,
): HeroSummary | null {
  if (filteredActivities.length === 0) return null;

  const totalRides = filteredActivities.length;
  const totalKm = Math.round(
    filteredActivities.reduce((sum, a) => sum + a.distance / 1000, 0),
  );
  const totalTime = Math.round(
    filteredActivities.reduce((sum, a) => sum + a.moving_time / 3600, 0),
  );
  const totalElevation = Math.round(
    filteredActivities.reduce((sum, a) => sum + a.total_elevation_gain, 0),
  );

  const longRidesCount = filteredActivities.filter(
    a => a.distance / 1000 > 70 || a.moving_time / 3600 > 2,
  ).length;

  const ridesPerCycle = (userProfile?.workouts_per_week || 3) * 4;
  const kmPerCycle = (userProfile?.weekly_goal_km || 100) * 4;
  const longRidesPerCycle = 4;

  const plan = {rides: ridesPerCycle, km: kmPerCycle, long: longRidesPerCycle};

  return {
    totalRides,
    totalKm,
    totalTime,
    totalElevation,
    longRidesCount,
    plan,
    progress: {
      rides: Math.min(Math.round((totalRides / plan.rides) * 100), 100),
      km: Math.min(Math.round((totalKm / plan.km) * 100), 100),
      long: Math.min(Math.round((longRidesCount / plan.long) * 100), 100),
    },
  };
}

export function computePlanInfo(
  userProfile: AnalysisUserProfile | null | undefined,
  t: {balancedPlan: string; hWeek: string; ridesWeek: string},
): PlanInfo | null {
  if (!userProfile) return null;

  const description = userProfile.plan_description || t.balancedPlan;
  const timeAvailable = userProfile.time_available || 5;
  const ridesPerWeek = userProfile.workouts_per_week || 3;

  return {
    description,
    details: `${timeAvailable}${t.hWeek}${ridesPerWeek}${t.ridesWeek}`,
  };
}
