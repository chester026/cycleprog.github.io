// Activities business logic (T-4.1 domain extraction). Moved verbatim from
// server.js — see routes/activities.js for the routes that use these and
// repositories/activities.js for the SQL.
const logger = require('../lib/logger');
const stravaTokens = require('./strava/tokens');
const stravaActivities = require('./strava/activities');
const activitiesRepo = require('../repositories/activities');

// --- GET /api/activities pagination (S-34) ----------------------------------
// `stravaActivities.getActivities()` returns the user's ENTIRE ride history
// as one array (DB-backed, already sorted start_date DESC — see that
// module's header). For a rider with years of history this is an unbounded
// response; S-34 adds OPT-IN pagination on top of it without touching that
// module's caching/sync logic:
//   - no `?limit` -> unchanged behaviour (full array), so the existing web
//     AnalysisPage / app callers keep working until they're migrated
//     (phases 5/6) to ask for pages.
//   - `?limit=N` (1..500) + optional `?cursor=<opaque>` -> at most N items,
//     ordered start_date DESC then strava_id DESC (a plain start_date sort
//     is not a total order — same-day rides need a tiebreaker for a stable,
//     non-overlapping cursor).
// The route always sets X-Total-Count, and X-Next-Cursor whenever another
// page follows (including the unbounded, no-`limit` case, which by
// definition never has a next page).

const MIN_LIMIT = 1;
const MAX_LIMIT = 500;

// Returns undefined (no limit given -> unpaginated), a valid integer, or
// null (present but invalid -> caller responds 400 VALIDATION_ERROR).
function parseActivitiesLimit(raw) {
  if (raw === undefined) return undefined;
  const str = Array.isArray(raw) ? raw[raw.length - 1] : String(raw);
  if (!/^\d+$/.test(str)) return null; // rejects "", "abc", negatives, decimals
  const n = Number(str);
  if (n < MIN_LIMIT || n > MAX_LIMIT) return null;
  return n;
}

// Strava's numeric activity id, however the activity object was built
// (full `raw` JSON vs the reconstructed-from-columns fallback — see
// services/strava/activities.js rowToActivity).
function activityId(activity) {
  return activity && activity.id;
}

function activityStartIso(activity) {
  return new Date(activity.start_date).toISOString();
}

function sortActivitiesDesc(activities) {
  return [...activities].sort((a, b) => {
    const dateDiff = new Date(b.start_date) - new Date(a.start_date);
    if (dateDiff !== 0) return dateDiff;
    return activityId(b) - activityId(a);
  });
}

function encodeCursor(activity) {
  return Buffer.from(`${activityStartIso(activity)}|${activityId(activity)}`, 'utf8').toString('base64');
}

// Returns {startIso, stravaId} or null for an unparseable/malformed cursor
// (treated as "start from the top" by the caller rather than a 400 — an
// opaque cursor round-tripped from our own X-Next-Cursor is always valid;
// only a hand-crafted/garbage one hits this path).
function decodeCursor(cursor) {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const sep = decoded.lastIndexOf('|');
    if (sep === -1) return null;
    const startIso = decoded.slice(0, sep);
    const stravaId = decoded.slice(sep + 1);
    if (!startIso || !stravaId) return null;
    return { startIso, stravaId };
  } catch (_err) {
    return null;
  }
}

// Index of the first item AFTER the cursor's position in `sorted` (0 if the
// cursor is missing/unparseable/not found — i.e. start from the top).
function cursorStartIndex(sorted, cursor) {
  if (!cursor) return 0;
  const decoded = decodeCursor(cursor);
  if (!decoded) return 0;
  const idx = sorted.findIndex(
    (a) => activityStartIso(a) === decoded.startIso && String(activityId(a)) === decoded.stravaId
  );
  return idx === -1 ? 0 : idx + 1;
}

// Fetches this user's full activity list via stravaActivities.getActivities
// (unchanged caching/sync/enrichment) and, when `limit` is given, slices out
// one page of it. `allActivities` is always the full list — callers that
// need it for something unrelated to what's returned to the client (e.g.
// the achievements re-eval in routes/activities.js) should use that, not
// `items`, since `items` may be a partial page.
async function getActivitiesPage(userId, { limit, cursor } = {}) {
  const allActivities = await stravaActivities.getActivities(userId);
  const total = allActivities.length;

  if (limit === undefined) {
    return { items: allActivities, total, nextCursor: null, allActivities };
  }

  const sorted = sortActivitiesDesc(allActivities);
  const startIdx = cursorStartIndex(sorted, cursor);
  const items = sorted.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < sorted.length;
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;
  return { items, total, nextCursor, allActivities };
}

// Helper function to get activity details
async function getActivityDetails(activityId, userId) {
  try {
    return await stravaActivities.getActivity(userId, activityId);
  } catch (error) {
    if (!(error instanceof stravaTokens.StravaNotLinkedError)) {
      logger.error({ err: error }, 'Error fetching activity details:');
    }
    return null;
  }
}

// Get or calculate meta-goals progress for a specific activity. Returns
// `null` when the activity itself can't be found (caller maps that to a
// 404); otherwise the array of {id, title, status, progress, progressGain,
// contributions} the route responds with.
async function getMetaGoalsProgressForActivity(userId, activityId) {
  // Проверяем кеш в БД - для каждой мета-цели храним только последний просмотренный заезд
  const cachedProgress = await activitiesRepo.getCachedProgress(userId, activityId);

  // Если для ЭТОГО заезда есть сохранённые данные - возвращаем
  if (cachedProgress.length > 0) {
    const metaGoalIds = cachedProgress.map((r) => r.meta_goal_id);
    const metaGoals = await activitiesRepo.getMetaGoalsByIds(metaGoalIds, userId);

    const result = cachedProgress.map((row) => {
      const metaGoal = metaGoals.find((mg) => mg.id === row.meta_goal_id);
      return {
        id: row.meta_goal_id,
        title: metaGoal?.title || 'Unknown Goal',
        status: metaGoal?.status || 'unknown',
        progress: Math.round(row.progress_after),
        progressGain: Math.max(0, Math.round(row.progress_after - row.progress_before)),
        contributions: row.contributions || [],
      };
    });

    logger.debug(`✅ Returning cached progress for activity ${activityId}`);
    return result;
  }

  // Если кеша нет - вычисляем
  const activity = await getActivityDetails(activityId, userId);
  if (!activity) {
    return null;
  }

  // Получаем активные мета-цели пользователя
  const metaGoals = await activitiesRepo.getActiveMetaGoals(userId);

  // Получаем предыдущие значения для всех мета-целей (из последних записей)
  const previousProgress = await activitiesRepo.getPreviousProgress(userId);

  const previousProgressMap = new Map(
    previousProgress.map((r) => [r.meta_goal_id, r.progress_after])
  );

  const result = [];

  // Batch load all sub-goals for all meta-goals in one query
  const metaGoalIds = metaGoals.map((mg) => mg.id);
  const allSubGoals = await activitiesRepo.getSubGoalsForMetaGoals(metaGoalIds);
  const subGoalsByMeta = new Map();
  for (const sg of allSubGoals) {
    if (!subGoalsByMeta.has(sg.meta_goal_id)) subGoalsByMeta.set(sg.meta_goal_id, []);
    subGoalsByMeta.get(sg.meta_goal_id).push(sg);
  }

  for (const metaGoal of metaGoals) {
    const subGoals = subGoalsByMeta.get(metaGoal.id) || [];
    if (subGoals.length === 0) continue;

    // Вычисляем текущий прогресс (ПОСЛЕ этого заезда)
    const progressValuesAfter = subGoals.map((sg) => {
      const current = sg.current_value || 0;
      const target = sg.target_value || 1;
      return Math.min((current / target) * 100, 100);
    });

    const avgProgressAfter = progressValuesAfter.reduce((sum, p) => sum + p, 0) / progressValuesAfter.length;

    // Прогресс ДО = progress_after из предыдущей записи (последний просмотренный заезд)
    // Если записи нет - вычисляем как обычно (вычитаем вклад текущего заезда)
    let avgProgressBefore;

    if (previousProgressMap.has(metaGoal.id)) {
      // Используем прогресс из предыдущего просмотренного заезда
      avgProgressBefore = previousProgressMap.get(metaGoal.id);
      logger.debug(`📊 Meta-goal ${metaGoal.id}: Using previous progress ${avgProgressBefore}%`);
    } else {
      // Первый раз - вычисляем вычитая вклад текущего заезда
      const progressValuesBefore = subGoals.map((sg) => {
        const current = sg.current_value || 0;
        const target = sg.target_value || 1;
        let currentWithoutRide = current;

        if (sg.goal_type === 'distance') {
          currentWithoutRide = current - (activity.distance / 1000);
        } else if (sg.goal_type === 'elevation') {
          currentWithoutRide = current - activity.total_elevation_gain;
        } else if (sg.goal_type === 'rides_count') {
          currentWithoutRide = current - 1;
        } else if (sg.goal_type === 'time') {
          currentWithoutRide = current - (activity.moving_time / 60);
        }

        currentWithoutRide = Math.max(0, currentWithoutRide);
        return Math.min((currentWithoutRide / target) * 100, 100);
      });

      avgProgressBefore = progressValuesBefore.reduce((sum, p) => sum + p, 0) / progressValuesBefore.length;
      logger.debug(`📊 Meta-goal ${metaGoal.id}: Calculated initial progress ${avgProgressBefore}%`);
    }

    const progressGain = Math.max(0, Math.round(avgProgressAfter - avgProgressBefore));

    // Вычисляем вклады
    const contributions = [];
    for (const sg of subGoals) {
      let contributionValue = '';

      if (sg.goal_type === 'distance') {
        const distanceKm = activity.distance / 1000;
        if (distanceKm > 0.1) {
          contributionValue = `+${distanceKm.toFixed(1)} km`;
        }
      } else if (sg.goal_type === 'elevation') {
        const elevation = activity.total_elevation_gain;
        if (elevation > 1) {
          contributionValue = `+${Math.round(elevation)} m`;
        }
      } else if (sg.goal_type === 'rides_count') {
        contributionValue = '+1 ride';
      } else if (sg.goal_type === 'time') {
        const timeMin = activity.moving_time / 60;
        if (timeMin > 1) {
          contributionValue = `+${Math.round(timeMin)} min`;
        }
      }

      if (contributionValue) {
        contributions.push({
          type: sg.goal_type,
          label: sg.goal_type === 'distance' ? 'Distance' :
                 sg.goal_type === 'elevation' ? 'Elevation' :
                 sg.goal_type === 'rides_count' ? 'Rides' :
                 sg.goal_type === 'time' ? 'Time' : 'Progress',
          value: contributionValue,
        });
      }
    }

    // Сохраняем в БД - ПЕРЕЗАПИСЫВАЕМ последний заезд для этой мета-цели
    await activitiesRepo.upsertProgress(activityId, metaGoal.id, userId, avgProgressBefore, avgProgressAfter, contributions);

    result.push({
      id: metaGoal.id,
      title: metaGoal.title,
      status: metaGoal.status,
      progress: Math.round(avgProgressAfter),
      progressGain: progressGain,
      contributions,
    });
  }

  logger.debug(`✅ Calculated and saved progress for activity ${activityId}`);
  return result;
}

module.exports = {
  getActivityDetails,
  getMetaGoalsProgressForActivity,
  getActivitiesPage,
  parseActivitiesLimit,
};
