// Pure filtering/sorting/analysis helpers for TrainingsPage (T-6.3, audit
// W-26/W-32). Extracted verbatim (same behaviour) from the page component
// so the logic can be unit-tested and reused by ActivityFilters/ActivityList
// without dragging React state along.
import { useMemo } from 'react';

// Only bicycle activities are shown on this page.
export const RIDE_TYPES = ['Ride', 'VirtualRide'];

export const DEFAULT_FILTERS = {
  name: '',
  dateFrom: '',
  dateTo: '',
  type: '',
  distMin: '',
  distMax: '',
  speedMin: '',
  speedMax: '',
  hrMin: '',
  hrMax: '',
  elevMin: '',
  elevMax: '',
};

/** Distinct years present in `activities`, sorted descending. */
export function getYears(activities) {
  return Array.from(
    new Set(
      activities
        .map((a) => (a.start_date ? new Date(a.start_date).getFullYear() : null))
        .filter(Boolean)
    )
  ).sort((a, b) => b - a);
}

/** Activities in `year` ('all' passes everything through). */
export function filterByYear(activities, year) {
  if (year === 'all') return activities;
  // `year` may arrive as a string (from the <select>) or a number, so this
  // intentionally uses `==` rather than duplicating a String()/Number() cast
  // at every call site.
  return activities.filter(
    (a) => a.start_date && new Date(a.start_date).getFullYear() == year
  );
}

/** Ride types present among the (already ride-only) year-filtered activities. */
export function getTypesForActivities(yearFiltered) {
  return Array.from(
    new Set(
      yearFiltered
        .filter((a) => RIDE_TYPES.includes(a.type))
        .map((a) => a.type)
        .filter(Boolean)
    )
  );
}

/** Applies the ride-type restriction plus every field in `filters`. */
export function applyActivityFilters(yearFiltered, filters) {
  return yearFiltered.filter((a) => {
    if (!RIDE_TYPES.includes(a.type)) return false;

    if (filters.name && !(a.name || '').toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.dateFrom && (!a.start_date || new Date(a.start_date) < new Date(filters.dateFrom))) return false;
    if (filters.dateTo && (!a.start_date || new Date(a.start_date) > new Date(filters.dateTo + 'T23:59:59'))) return false;
    if (filters.type && a.type !== filters.type) return false;
    if (filters.distMin && (!a.distance || a.distance / 1000 < parseFloat(filters.distMin))) return false;
    if (filters.distMax && (!a.distance || a.distance / 1000 > parseFloat(filters.distMax))) return false;
    if (filters.speedMin && (!a.average_speed || a.average_speed * 3.6 < parseFloat(filters.speedMin))) return false;
    if (filters.speedMax && (!a.average_speed || a.average_speed * 3.6 > parseFloat(filters.speedMax))) return false;
    if (filters.hrMin && (!a.average_heartrate || a.average_heartrate < parseFloat(filters.hrMin))) return false;
    if (filters.hrMax && (!a.average_heartrate || a.average_heartrate > parseFloat(filters.hrMax))) return false;
    if (filters.elevMin && (!a.total_elevation_gain || a.total_elevation_gain < parseFloat(filters.elevMin))) return false;
    if (filters.elevMax && (!a.total_elevation_gain || a.total_elevation_gain > parseFloat(filters.elevMax))) return false;
    return true;
  });
}

/** Groups activities by year, newest year first; each group newest is not re-sorted (server order kept). */
export function groupByYear(activities) {
  const groups = {};
  activities.forEach((activity) => {
    const year = new Date(activity.start_date).getFullYear();
    if (!groups[year]) groups[year] = [];
    groups[year].push(activity);
  });
  return Object.keys(groups)
    .sort((a, b) => b - a)
    .map((year) => ({ year, activities: groups[year] }));
}

/**
 * Flattens year groups into a single render list: one 'year' entry followed
 * by its 'activity' entries. Used by ActivityList to paginate ("show more")
 * across the whole table rather than per-year.
 */
export function buildRows(groupedYears) {
  const rows = [];
  groupedYears.forEach(({ year, activities }) => {
    rows.push({ kind: 'year', key: `y-${year}`, year, count: activities.length });
    activities.forEach((activity, idx) => {
      rows.push({ kind: 'activity', key: activity.id ?? `${year}-${idx}`, activity });
    });
  });
  return rows;
}

/**
 * Single hook combining every derivation TrainingsPage needs from the raw
 * activities list, `selectedYear` and the filter form state. Memoized so
 * filtering/sorting only re-runs when an actual input changes (T-6.3).
 */
export function useActivityView(activities, selectedYear, filters) {
  return useMemo(() => {
    const years = getYears(activities);
    const yearFiltered = filterByYear(activities, selectedYear);
    const types = getTypesForActivities(yearFiltered);
    const filteredActivities = applyActivityFilters(yearFiltered, filters);
    const groupedYears = groupByYear(filteredActivities);
    const rows = buildRows(groupedYears);
    return { years, types, filteredActivities, groupedYears, rows };
  }, [activities, selectedYear, filters]);
}

// T-3.5 (docs/audit/00-AUDIT-AND-PLAN.md T-3.5): the local `calculatePower`
// (hardcoded 75kg rider + 8kg bike, no wind) used to live here — removed in
// favor of the server-computed `activity.estimated_power.avgWatts` every
// activity already carries (`GET /api/activities`).

/** Workout type + rule-based recommendations for the details modal. */
export function analyzeActivity(activity) {
  let type = 'Regular';
  if (activity.distance && activity.distance / 1000 > 60) type = 'Long';
  else if (activity.average_speed && activity.average_speed * 3.6 < 20 && activity.moving_time && activity.moving_time / 60 < 60) type = 'Recovery';
  else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Mountain';
  else if ((activity.name || '').toLowerCase().includes('interval') || (activity.type || '').toLowerCase().includes('interval')) type = 'Interval';

  const recommendations = [];

  if (activity.average_speed && activity.average_speed * 3.6 < 25) {
    recommendations.push({
      title: 'Average speed below 25 km/h',
      advice: 'To improve speed, include interval training (e.g., 4×4 min with 4 min rest, Z4-Z5), work on pedal technique (cadence 90–100), pay attention to your body position on the bike, and aerodynamics.',
    });
  }

  if (activity.average_heartrate && activity.average_heartrate > 155) {
    recommendations.push({
      title: 'Heart rate above 155 bpm',
      advice: 'This may indicate high intensity or insufficient recovery. Check your sleep quality, stress level, add recovery training, pay attention to hydration and nutrition.',
    });
  }

  if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed * 3.6 < 18) {
    recommendations.push({
      title: 'Mountain training with low speed',
      advice: 'To improve results, add strength training off the bike and intervals in ascents (e.g., 5×5 min in Z4).',
    });
  }

  if (!activity.average_heartrate) {
    recommendations.push({
      title: 'No heart rate data',
      advice: 'Add a heart rate monitor for more accurate intensity control and recovery.',
    });
  }

  if (!activity.distance || activity.distance / 1000 < 30) {
    recommendations.push({
      title: 'Short distance',
      advice: "To develop endurance, plan at least one long ride (60+ km) per week. Gradually increase the distance, remembering to eat and hydrate on the road.",
    });
  }

  if (type === 'Recovery') {
    recommendations.push({
      title: 'Recovery training',
      advice: "Great! Don't forget to alternate such training with intervals and long rides for progress.",
    });
  }

  if (type === 'Interval' && activity.average_heartrate && activity.average_heartrate < 140) {
    recommendations.push({
      title: 'Interval training with low heart rate',
      advice: 'Intervals should be performed with greater intensity (Z4-Z5) to get the maximum training effect.',
    });
  }

  if (!activity.average_cadence) {
    recommendations.push({
      title: 'No cadence data',
      advice: 'Using a cadence sensor will help track pedal technique and avoid excessive fatigue.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Great training!',
      advice: 'Training completed perfectly! Continue in the same spirit and gradually increase the load for further progress.',
    });
  }

  return { type, recommendations };
}

const COPY_FIELD_MAP = {
  distance: { label: 'Distance', unit: 'km' },
  moving_time: { label: 'Moving time', unit: 'min' },
  elapsed_time: { label: 'Elapsed time', unit: 'min' },
  total_elevation_gain: { label: 'Elevation gain', unit: 'm' },
  average_speed: { label: 'Average speed', unit: 'km/h' },
  max_speed: { label: 'Max speed', unit: 'km/h' },
  average_cadence: { label: 'Average cadence', unit: 'rpm' },
  average_temp: { label: 'Average temperature', unit: '°C' },
  average_heartrate: { label: 'Average heartrate', unit: 'bpm' },
  max_heartrate: { label: 'Max heartrate', unit: 'bpm' },
  elev_high: { label: 'Max elevation', unit: 'm' },
};

/** Builds the JSON payload copied to the clipboard by the "copy" action. */
export function buildActivityCopyPayload(activity) {
  const activityData = {};
  Object.keys(COPY_FIELD_MAP).forEach((key) => {
    let value = activity[key];
    if (value == null) value = '-';
    if (key === 'distance' && value !== '-') value = (value / 1000).toFixed(2);
    if ((key === 'moving_time' || key === 'elapsed_time') && value !== '-') value = (value / 60).toFixed(1);
    if ((key === 'average_speed' || key === 'max_speed') && value !== '-') value = (value * 3.6).toFixed(2);
    activityData[key] = value;
  });
  activityData.name = activity.name || 'No name';
  return activityData;
}

/** Builds the compact summary sent to the AI-analysis endpoint. */
export function buildAiSummary(activity) {
  return {
    name: activity.name,
    distance_km: activity.distance ? +(activity.distance / 1000).toFixed(2) : undefined,
    moving_time_min: activity.moving_time ? +(activity.moving_time / 60).toFixed(1) : undefined,
    elapsed_time_min: activity.elapsed_time ? +(activity.elapsed_time / 60).toFixed(1) : undefined,
    average_speed_kmh: activity.average_speed ? +(activity.average_speed * 3.6).toFixed(2) : undefined,
    max_speed_kmh: activity.max_speed ? +(activity.max_speed * 3.6).toFixed(2) : undefined,
    average_cadence: activity.average_cadence,
    average_temp: activity.average_temp,
    average_heartrate: activity.average_heartrate,
    max_heartrate: activity.max_heartrate,
    total_elevation_gain_m: activity.total_elevation_gain,
    max_elevation_m: activity.elev_high,
    date: activity.start_date,
    // T-3.5: server-computed estimate (@bikelab/shared/calc/power.ts via
    // services/power.js) — this page no longer runs its own (simplified,
    // hardcoded 75+8kg) physics.
    estimated_power_w: activity.estimated_power?.avgWatts ?? undefined,
    average_grade_percent:
      activity.distance ? +(((activity.total_elevation_gain || 0) / activity.distance) * 100).toFixed(1) : undefined,
    real_average_power_w: activity.average_watts,
    real_max_power_w: activity.max_watts,
  };
}
