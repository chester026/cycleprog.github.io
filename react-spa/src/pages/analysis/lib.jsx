// T-6.3: pure calculation helpers extracted from AnalysisPage.jsx. Same
// math as before — just split out so PeriodSummary/PlanFactHero can share
// it without importing the whole page, and so it's unit-testable on its
// own. Nothing here talks to the network/DOM; all inputs are plain data.
import { getDateOfISOWeek, getISOWeekNumber, getISOYear } from '@bikelab/shared/calc';

export function median(arr) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// HR zones for the current user (T-3.1): the server is the sole source
// (`GET /api/user-profile` always sets `hr_zones`) — no client-side
// fallback computation. Null-safe: while the profile hasn't loaded yet,
// callers guard against an empty array.
export function calculateUserHRZones(userProfile) {
  return userProfile?.hr_zones?.zones || [];
}

// Функция для получения цели скорости/дистанции из goals или fallback на уровень опыта
export function getGoalOrFallback(goalType, goals, userProfile) {
  const goal = goals.find(g => g.goal_type === goalType);
  if (goal && goal.target_value) {
    return parseFloat(goal.target_value);
  }

  const experienceLevel = userProfile?.experience_level || 'intermediate';

  if (goalType === 'speed_flat') {
    switch (experienceLevel) {
      case 'beginner': return 25;
      case 'intermediate': return 30;
      case 'advanced': return 35;
      default: return 30;
    }
  } else if (goalType === 'speed_hills') {
    switch (experienceLevel) {
      case 'beginner': return 15;
      case 'intermediate': return 17.5;
      case 'advanced': return 20;
      default: return 17.5;
    }
  } else if (goalType === 'easy_distance') {
    switch (experienceLevel) {
      case 'beginner': return 20;
      case 'intermediate': return 25;
      case 'advanced': return 30;
      default: return 25;
    }
  } else if (goalType === 'easy_speed') {
    switch (experienceLevel) {
      case 'beginner': return 18;
      case 'intermediate': return 20;
      case 'advanced': return 22;
      default: return 20;
    }
  } else if (goalType === 'easy_elevation') {
    switch (experienceLevel) {
      case 'beginner': return 200;
      case 'intermediate': return 300;
      case 'advanced': return 400;
      default: return 300;
    }
  }

  return goalType === 'speed_flat' ? 30 : 17.5;
}

// Функция для расчета процентов выполнения за период
export function percentForPeriod(period, userProfile, userPlan = null, goals = [], blockStartDate = null, blockEndDate = null) {
  const speedFlatGoal = getGoalOrFallback('speed_flat', goals, userProfile);
  const speedHillGoal = getGoalOrFallback('speed_hills', goals, userProfile);
  const easyDistanceGoal = getGoalOrFallback('easy_distance', goals, userProfile);
  const easySpeedGoal = getGoalOrFallback('easy_speed', goals, userProfile);
  const easyElevationGoal = getGoalOrFallback('easy_elevation', goals, userProfile);

  const flats = period.filter(a => (a.distance || 0) > 20000 && (a.total_elevation_gain || 0) < (a.distance || 0) * 0.005 && (a.average_speed || 0) * 3.6 < 40);
  const flatSpeeds = flats.map(a => (a.average_speed || 0) * 3.6);
  const medianFlatSpeed = median(flatSpeeds);
  let flatSpeedPct = Math.round(medianFlatSpeed / speedFlatGoal * 100);

  const hills = period.filter(a => (a.distance || 0) > 5000 && ((a.total_elevation_gain || 0) > (a.distance || 0) * 0.015 || (a.total_elevation_gain || 0) > 500) && (a.average_speed || 0) * 3.6 < 25);
  const hillSpeeds = hills.map(a => (a.average_speed || 0) * 3.6);
  const medianHillSpeed = median(hillSpeeds);
  let hillSpeedPct = Math.floor(medianHillSpeed / speedHillGoal * 100);

  const userHRZones = calculateUserHRZones(userProfile); // array, index 0 = zone 1 … index 4 = zone 5
  const hasHRZones = userHRZones.length >= 4;

  const flatsInZone = hasHRZones ? flats.filter(a =>
    a.average_heartrate &&
    a.average_heartrate >= userHRZones[0].min &&
    a.average_heartrate <= (userHRZones[2].max ?? Infinity)
  ).length : 0;
  const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;

  const hillsInZone = hasHRZones ? hills.filter(a =>
    a.average_heartrate &&
    a.average_heartrate >= userHRZones[2].min &&
    a.average_heartrate <= (userHRZones[3].max ?? Infinity)
  ).length : 0;
  const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;

  const pulseGoalPct = flats.length && hills.length ? Math.round((flatZonePct + hillZonePct) / 2) : (flatZonePct || hillZonePct);

  const longRides = period.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600);
  const longTarget = userPlan?.long || 4;
  let longRidePct = Math.round(longRides.length / longTarget * 100);

  // Intervals aren't factored into `avg` below (never were — see git
  // history) so they're not computed here at all.
  const easyRides = period.filter(a =>
    ((a.distance || 0) < easyDistanceGoal * 1000 ||
     (a.average_speed || 0) * 3.6 < easySpeedGoal) &&
    (a.total_elevation_gain || 0) < easyElevationGoal
  );
  let easyPct = Math.round(easyRides.length / 4 * 100);

  const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, easyPct];
  const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length);

  let start, end;
  if (blockStartDate && blockEndDate) {
    start = blockStartDate;
    end = blockEndDate;
  } else {
    const dates = period.map(a => new Date(a.start_date)).sort((a, b) => a - b);
    start = dates[0];
    end = dates[dates.length - 1];
  }

  return { avg, all, start, end };
}

// Единая функция для расчета всех 4-недельных периодов
export function calculatePeriods(activities) {
  if (!activities.length) return [];

  const acts = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  const periods = [];

  if (acts.length) {
    const activitiesByYear = {};
    acts.forEach(a => {
      const year = getISOYear(a.start_date);
      if (!activitiesByYear[year]) activitiesByYear[year] = [];
      activitiesByYear[year].push(a);
    });

    Object.keys(activitiesByYear).sort().forEach(year => {
      const yearActivities = activitiesByYear[year];

      const weekNumbers = yearActivities.map(a => getISOWeekNumber(a.start_date));
      const minWeek = Math.min(...weekNumbers);
      const maxWeek = Math.max(...weekNumbers);

      for (let cycleIndex = 0; minWeek + cycleIndex * 4 <= maxWeek; cycleIndex++) {
        const startWeekInCycle = minWeek + cycleIndex * 4;

        const planCycleMinDate = getDateOfISOWeek(startWeekInCycle, parseInt(year));
        const planCycleMaxDate = getDateOfISOWeek(startWeekInCycle + 3, parseInt(year));
        planCycleMaxDate.setDate(planCycleMaxDate.getDate() + 6);

        const cycleActivities = yearActivities.filter(a => {
          const d = new Date(a.start_date);
          return d >= planCycleMinDate && d <= planCycleMaxDate;
        });

        if (cycleActivities.length > 0) {
          periods.push({
            activities: cycleActivities,
            startDate: planCycleMinDate,
            endDate: planCycleMaxDate,
            year: parseInt(year),
            cycleIndex
          });
        }
      }
    });
  }

  periods.sort((a, b) => new Date(a.activities[0]?.start_date) - new Date(b.activities[0]?.start_date));

  return periods;
}

// Функция для расчета прогресса по периодам (последние 14 четырёхнедельных циклов)
export function computePeriodSummary(activities, userProfile, userPlan) {
  if (!activities.length) return null;

  const allPeriods = calculatePeriods(activities);

  return allPeriods
    .slice(-14)
    .map((periodData) => percentForPeriod(
      periodData.activities,
      userProfile,
      userPlan,
      [],
      periodData.startDate,
      periodData.endDate
    ));
}

// Функция для расчета данных plan-fact-hero (текущий 4-недельный цикл)
export function computePlanFactHero(activities, userPlan, lastRealIntervals) {
  const allPeriods = calculatePeriods(activities);
  const currentPeriod = allPeriods.slice(-1)[0];

  const recent = currentPeriod ? currentPeriod.activities : [];
  const planCycleMinDate = currentPeriod ? currentPeriod.startDate : null;
  const planCycleMaxDate = currentPeriod ? currentPeriod.endDate : null;
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const count = recent.length;
  const longRides = recent.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;

  const plan = {
    rides: userPlan.rides,
    km: userPlan.km,
    long: userPlan.long,
    intervals: userPlan.intervals
  };
  const data = [
    { label: 'Workouts', fact: count, plan: plan.rides, pct: Math.round(count / plan.rides * 100) },
    { label: 'Volume, km', fact: Math.round(totalKm), plan: plan.km, pct: Math.round(totalKm / plan.km * 100) },
    { label: 'Long rides', fact: longRides, plan: plan.long, pct: Math.round(longRides / plan.long * 100) },
    { label: 'FTP/VO₂max', fact: lastRealIntervals.count, min: lastRealIntervals.min, plan: lastRealIntervals.label, pct: '', color: lastRealIntervals.color },
  ];
  return {
    data,
    minDate: planCycleMinDate,
    maxDate: planCycleMaxDate,
  };
}

// Функция для форматирования дат периода
export function formatPeriodDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

// Функция для проверки есть ли данные в текущем периоде
export function isEmptyPeriod(summaryData) {
  if (!summaryData) return true;

  const hasRides = summaryData.totalRides > 0;
  const hasKm = summaryData.totalKm > 0;
  const hasLongRides = summaryData.longRidesCount > 0;

  return !hasRides && !hasKm && !hasLongRides;
}
