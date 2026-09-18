// Pure derivations extracted from GarageScreen.tsx (T-5.4, audit A-27).
// Nothing here touches state, storage or the network — every function
// takes plain data in and returns plain data out, so it's unit-testable
// without rendering anything or mocking a hook.
import polyline from '@mapbox/polyline';
import type {Activity} from '../../types/activity';
import type {Achievement} from '../../components/achievements';
import type {UserProfile} from '@bikelab/shared/types';
import {msToKmh} from '@bikelab/shared/calc';
import {getDateLocale} from '../../i18n/dateLocale';
import {logger} from '../../lib/logger';
import type {GarageImages} from '../../data/hooks/useGarageImages';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface OverallStats {
  totalDistance: number; // km
  totalElevation: number; // m
  totalTime: number; // hours
  avgSpeed: number; // km/h
}

/**
 * "Overall" totals shown under the bike images — same reduce logic as
 * StatsCard.calculateStats() on ActivitiesScreen (src/components/
 * StatsCard.tsx), just run over whatever activities the caller already
 * has.
 */
export function computeOverallStats(activities: Activity[]): OverallStats {
  if (!activities || activities.length === 0) {
    return {totalDistance: 0, totalElevation: 0, totalTime: 0, avgSpeed: 0};
  }
  const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
  const totalElevation = activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
  const totalTime = activities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
  const avgSpeed = totalTime > 0 ? msToKmh(totalDistance / totalTime) : 0;
  return {
    totalDistance: totalDistance / 1000,
    totalElevation,
    totalTime: totalTime / 3600,
    avgSpeed,
  };
}

/** Most recent cycling (Ride/VirtualRide) activity, or null if there are none. */
export function findLastRide(activities: Activity[]): Activity | null {
  const rides = activities.filter(a => ['Ride', 'VirtualRide'].includes(a.type));
  if (rides.length === 0) return null;
  return rides.sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
  )[0];
}

/** Decodes a Strava-style encoded polyline into `{latitude, longitude}` points. */
export function decodeTrackCoordinates(summaryPolyline: string | undefined | null): LatLng[] {
  if (!summaryPolyline) return [];
  try {
    const points = polyline.decode(summaryPolyline);
    return points.map(([lat, lng]) => ({latitude: lat, longitude: lng}));
  } catch (error) {
    logger.error('Error decoding polyline:', error);
    return [];
  }
}

/** Bounding-box region (with padding) that fits every point of `coordinates`, or null if there are none. */
export function computeMapRegion(coordinates: LatLng[]): MapRegion | null {
  if (coordinates.length === 0) return null;

  const lats = coordinates.map(c => c.latitude);
  const lngs = coordinates.map(c => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = (maxLat - minLat) * 1.6 || 0.02;
  const lngDelta = (maxLng - minLng) * 1.6 || 0.02;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(latDelta, 0.005),
    longitudeDelta: Math.max(lngDelta, 0.005),
  };
}

export function formatRideDate(dateString: string | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString(getDateLocale(), {day: '2-digit', month: '2-digit', year: 'numeric'});
}

export type GaragePosition = 'right' | 'left-top' | 'left-bottom';

/** ImageKit is a public CDN — no proxy needed, use its URL directly (params stripped). */
export function getGarageImageUrl(images: GarageImages, position: GaragePosition): string | null {
  const imageData = images[position];
  if (!imageData?.url) return null;
  return imageData.url.split('?')[0];
}

/** Top 6 achievements to preview: up to 3 most-recently-unlocked + up to 3 closest-to-unlock. */
export function pickTopAchievements(achievements: Achievement[]): Achievement[] {
  const unlocked = achievements
    .filter(a => a.unlocked)
    .sort((a, b) => new Date(b.unlocked_at || 0).getTime() - new Date(a.unlocked_at || 0).getTime())
    .slice(0, 3);

  const locked = achievements
    .filter(a => !a.unlocked)
    .sort((a, b) => b.progress_pct - a.progress_pct)
    .slice(0, 3);

  return [...unlocked, ...locked].slice(0, 6);
}

export interface NutritionInput {
  distance: string;
  elevation: string;
  speed: string;
  temp: string;
}

export interface NutritionResult {
  timeH: number;
  cal: number;
  carbs: number;
  water: number;
  gels: number;
  bars: number;
  waterPerH: number;
  isPersonalized: boolean;
  userWeight: number;
  calPerKgPerH: number;
  carbsPerKgPerH: number;
}

/**
 * Nutrition-plan estimate for a ride, personalized off the rider's profile
 * (weight/age/gender/experience) when one is available, else generic
 * defaults. Ported verbatim from GarageScreen's old `handleNutritionCalc`
 * — same formulas, same rounding, same distance/temperature breakpoints.
 * Returns null when the required inputs (distance/elevation/speed) aren't
 * present/parseable, matching the old early-return.
 */
export function calculateNutrition(
  input: NutritionInput,
  userProfile: UserProfile | null,
): NutritionResult | null {
  const dist = parseFloat(input.distance);
  const elev = parseFloat(input.elevation);
  const spd = parseFloat(input.speed);
  const temp = parseFloat(input.temp);

  if (!dist || !elev || !spd) return null;

  const timeH = dist / spd;
  const elevPerKm = elev / dist;

  let isPersonalized = false;
  let userWeight = 75;
  let calPerKgPerH = 10;
  let carbsPerKgPerH = 0.6;
  let waterPerH = 0.5;

  if (userProfile?.weight) {
    isPersonalized = true;
    userWeight = userProfile.weight;

    const expLevel = userProfile.experience_level || 'intermediate';
    const age = userProfile.age || 30;
    const gender = userProfile.gender || 'male';

    if (expLevel === 'advanced') {
      calPerKgPerH = gender === 'female' ? 9 : 11;
      carbsPerKgPerH = 0.7;
    } else if (expLevel === 'beginner') {
      calPerKgPerH = gender === 'female' ? 7.5 : 8.5;
      carbsPerKgPerH = 0.5;
    } else {
      calPerKgPerH = gender === 'female' ? 8 : 10;
      carbsPerKgPerH = 0.6;
    }

    if (age > 40) calPerKgPerH *= 0.95;
    if (age > 50) calPerKgPerH *= 0.9;

    waterPerH = 0.5 + (userWeight - 70) * 0.005;

    if (temp > 30) waterPerH *= 1.4;
    else if (temp > 25) waterPerH *= 1.25;
    else if (temp > 20) waterPerH *= 1.1;
    else if (temp < 10) waterPerH *= 0.8;
  } else {
    if (temp > 30) waterPerH = 0.75;
    else if (temp > 25) waterPerH = 0.65;
    else if (temp < 10) waterPerH = 0.4;
  }

  let cal = isPersonalized ? calPerKgPerH * userWeight * timeH : 600 * timeH;
  let carbs = isPersonalized ? carbsPerKgPerH * userWeight * timeH : 35 * timeH;

  if (elevPerKm > 20 || spd > 30) {
    cal *= 1.4;
    carbs *= 1.2;
    waterPerH *= 1.15;
  } else if (elevPerKm > 10 || spd > 25) {
    cal *= 1.2;
    carbs *= 1.1;
    waterPerH *= 1.1;
  }

  const water = waterPerH * timeH;

  const totalSportsNutrition = carbs * 0.65;

  let gelRatio = 0.3;
  if (dist < 80) {
    gelRatio = 0.25;
  } else if (dist > 120) {
    gelRatio = 0.35;
  }

  const carbsFromGels = totalSportsNutrition * gelRatio;
  const carbsFromBars = totalSportsNutrition * (1 - gelRatio);

  const gels = Math.max(Math.ceil(carbsFromGels / 25), 1);
  const bars = Math.ceil(carbsFromBars / 35);

  return {
    timeH,
    cal,
    carbs,
    water,
    gels,
    bars,
    waterPerH,
    isPersonalized,
    userWeight,
    calPerKgPerH,
    carbsPerKgPerH,
  };
}
