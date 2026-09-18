// Pure calendar / priority-workout math extracted from the old monolithic
// WeeklyTrainingCalendar.jsx (T-6.3, audit W-21) so it can be unit tested
// without mounting the component tree. No React, no fetching — everything
// here takes plain data in and returns plain data out.

export const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_NAMES_SHORT = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const DAY_NAMES_FULL = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function getDayName(dayKey) {
  return DAY_NAMES_SHORT[dayKey] || dayKey;
}

export function getFullDayName(dayKey) {
  return DAY_NAMES_FULL[dayKey] || dayKey;
}

/** Every non-rest day of `weeklyPlan.plan`, tagged with its day key. */
export function getAllTrainings(weeklyPlan) {
  if (!weeklyPlan?.plan) return [];
  const trainings = [];
  DAY_KEYS.forEach((day) => {
    const dayPlan = weeklyPlan.plan[day];
    if (dayPlan && dayPlan.type !== 'rest') {
      trainings.push({ ...dayPlan, day });
    }
  });
  return trainings;
}

/**
 * Sorts `getAllTrainings(weeklyPlan)` by `weeklyPlan.priorities` (index 0 =
 * highest priority training type), descending score first.
 */
export function sortTrainingsByPriority(weeklyPlan) {
  const allTrainings = getAllTrainings(weeklyPlan);
  const priorities = weeklyPlan?.priorities || [];

  const trainingsWithScore = allTrainings.map((training) => {
    const priorityIndex = priorities.indexOf(training.trainingType);
    const score = priorityIndex !== -1 ? priorities.length - priorityIndex : 0;
    return { ...training, priorityScore: score };
  });

  return trainingsWithScore.sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Week number mod 3 — purely a rotation seed so "Priority Workouts" isn't
 * in the exact same order every single week, with no server state needed.
 * `date` is injectable for tests (defaults to `new Date()`).
 */
export function getWeekNumber(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.floor((date - startOfYear) / (7 * 24 * 60 * 60 * 1000));
  return weekNumber % 3;
}

/**
 * Rotates the top-4 priority trainings by week variation (0, 1 or 2) from
 * `getWeekNumber` so the order varies week to week.
 */
export function rotatePriorityWorkouts(trainings, weekVariation) {
  if (!trainings || trainings.length < 4) return trainings;

  const rotated = [...trainings];

  if (weekVariation === 1) {
    if (rotated.length > 1) {
      [rotated[0], rotated[1]] = [rotated[1], rotated[0]];
    }
  } else if (weekVariation === 2) {
    if (rotated.length > 2) {
      const last = rotated.pop();
      rotated.unshift(last);
    }
  }

  return rotated;
}

/** Composite-workout summary shown on a calendar day, e.g. "90 min • Endurance + Tempo". */
export function getCompositeDescription(parts, trainingTypes) {
  if (!parts || parts.length === 0) return '';

  const totalDuration = parts.reduce((sum, part) => sum + (parseInt(part.duration, 10) || 0), 0);
  const mainTypes = parts.map((part) => {
    const trainingType = (trainingTypes || []).find((t) => t.key === part.type);
    return trainingType?.name || part.type;
  });
  const uniqueTypes = [...new Set(mainTypes)];

  let description = `${totalDuration} min`;
  if (uniqueTypes.length > 0) {
    description += ` • ${uniqueTypes.join(' + ')}`;
  }
  return description;
}

/**
 * The training shown for a given day: a custom (user-saved) day overrides
 * the generated plan; the "manual" view only ever shows customs, never the
 * AI-generated plan underneath.
 */
export function getDayTraining({ viewMode, dayKey, customPlan, weeklyPlan }) {
  const custom = customPlan?.[dayKey] || weeklyPlan?.customPlan?.[dayKey];
  if (viewMode === 'manual') return custom;
  return custom || weeklyPlan?.plan?.[dayKey];
}

/**
 * Builds the AI-generated-mode Priority Workouts list from a metaGoal's
 * `trainingTypes`, resolving each entry against the training-type library
 * for its intensity/duration/etc. details.
 */
function groupAiGeneratedTrainings(metaGoal, trainingTypes) {
  const sorted = [...metaGoal.trainingTypes].sort((a, b) => a.priority - b.priority);

  const formatted = sorted.map((training) => {
    // AI returns exact library keys ("hill_climbing", "sprint", "tempo", ...).
    const libraryTraining = (trainingTypes || []).find((t) => t.key === training.type);

    return {
      name: training.title,
      type: libraryTraining?.key || training.type,
      trainingType: libraryTraining?.key || training.type,
      recommendation: training.description,
      details: libraryTraining
        ? {
            intensity: libraryTraining.intensity,
            duration: libraryTraining.duration,
            cadence: libraryTraining.cadence,
            hr_zones: libraryTraining.hr_zones,
            structure: libraryTraining.structure,
            benefits: libraryTraining.benefits,
            technical_aspects: libraryTraining.technical_aspects,
            tips: libraryTraining.tips,
            common_mistakes: libraryTraining.common_mistakes,
          }
        : { intensity: 'Variable', duration: '60-90 min' },
      day: null,
      priorityScore: 10 - training.priority,
    };
  });

  return {
    mostRecommended: formatted[0] || null,
    priority: formatted.slice(1, 4),
    all: formatted,
  };
}

/**
 * Groups the week's trainings into `{ mostRecommended, priority (next 3),
 * all }`, either from an AI-generated metaGoal (GoalDetailPage's
 * `mode="ai-generated"`) or from the generated weekly plan (default), with
 * a weekly rotation applied to the plan-based top 4.
 */
export function groupTrainings({ mode, metaGoal, trainingTypes, weeklyPlan, now }) {
  if (mode === 'ai-generated' && metaGoal?.trainingTypes && metaGoal.trainingTypes.length > 0) {
    return groupAiGeneratedTrainings(metaGoal, trainingTypes);
  }

  const sortedTrainings = sortTrainingsByPriority(weeklyPlan);
  const top4Trainings = sortedTrainings.slice(0, 4);
  const rotatedTop4 = rotatePriorityWorkouts(top4Trainings, getWeekNumber(now));

  return {
    mostRecommended: rotatedTop4[0] || null,
    priority: rotatedTop4.slice(1, 4),
    all: sortedTrainings,
  };
}
