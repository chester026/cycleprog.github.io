// Activities business logic (T-4.1 domain extraction). Moved verbatim from
// server.js — see routes/activities.js for the routes that use these and
// repositories/activities.js for the SQL.
const logger = require('../lib/logger');
const stravaTokens = require('./strava/tokens');
const stravaActivities = require('./strava/activities');
const activitiesRepo = require('../repositories/activities');
const goalCalculator = require('../goalCalculator');
const { loadGoalProgressContext, goalWindow } = require('./goals');
const { getGoalTypeLabel } = require('@bikelab/shared/constants');

// A sub-goal whose value moved by less than this is not worth a "+0 km"
// badge on the ride card (floating-point noise, or a rounding-level
// contribution to an averaged metric).
const MIN_CONTRIBUTION = 0.05;

/** One decimal for small contributions, whole units once they get big. */
function formatContribution(delta) {
  return delta >= 100 ? String(Math.round(delta)) : String(Math.round(delta * 10) / 10);
}

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

  // Если для ЭТОГО заезда есть сохранённые данные — возвращаем их, но только
  // для мета-целей, которые ещё существуют и активны. Осиротевшие строки
  // (мета-цель удалена/завершена, а кеш остался — в проде на таблице не было
  // FK) раньше отдавались как "Unknown Goal" или, отфильтрованные клиентом,
  // превращались в вечное "No active goals found": кеш есть → пересчёт не
  // запускается. Теперь такие строки вычищаются и мы падаем в пересчёт.
  if (cachedProgress.length > 0) {
    const metaGoalIds = cachedProgress.map((r) => r.meta_goal_id);
    const metaGoals = await activitiesRepo.getMetaGoalsByIds(metaGoalIds, userId);
    const liveById = new Map(metaGoals.filter((mg) => !activitiesRepo.isFinishedStatus(mg.status)).map((mg) => [mg.id, mg]));

    const orphanIds = cachedProgress.map((r) => r.meta_goal_id).filter((id) => !liveById.has(id));
    if (orphanIds.length > 0) {
      await activitiesRepo.deleteProgressForMetaGoals(userId, orphanIds);
      logger.info({ userId, activityId, removed: orphanIds.length }, '[activities] pruned stale meta-goal progress rows');
    }

    const result = cachedProgress
      .filter((row) => liveById.has(row.meta_goal_id))
      .map((row) => {
        const metaGoal = liveById.get(row.meta_goal_id);
        return {
          id: row.meta_goal_id,
          title: metaGoal.title,
          status: metaGoal.status,
          progress: Math.round(row.progress_after),
          progressGain: Math.max(0, Math.round(row.progress_after - row.progress_before)),
          contributions: row.contributions || [],
        };
      });

    // Rows written before this function computed contributions from the
    // goal calculator carry an empty `contributions` for every metric-based
    // sub-goal (the old code only knew four legacy goal_types). A cached
    // answer where NOTHING contributed is indistinguishable from that, so
    // recompute rather than serve a card with no numbers on it — same
    // "всё было мусором — считаем заново" rule as the filter above.
    if (result.some((r) => r.contributions.length > 0)) {
      logger.debug(`✅ Returning cached progress for activity ${activityId}`);
      return result;
    }
  }

  // Пересчёт. Прогресс считает тот же универсальный калькулятор, что и
  // GET /api/goals, дважды: по всем активностям и по ним же без этого
  // заезда. Разница и есть вклад заезда — без таблицы вычитаний по
  // goal_type (она знала только distance/elevation/rides_count/time и для
  // metric-целей, у которых goal_type = NULL, не давала вообще ничего), и
  // одинаково работает для legacy- и metric-целей.
  const ctx = await loadGoalProgressContext(userId);
  const isThisRide = (a) => String(a.id) === String(activityId);

  if (!ctx.activities.some(isThisRide)) {
    // Заезд ещё не доехал до зеркала в Postgres (кэш/инкрементальный синк
    // отстают от Strava) — тянем его напрямую и кладём в набор "после",
    // иначе вклад свежего райда всегда был бы нулевым.
    const activity = await getActivityDetails(activityId, userId);
    if (!activity) {
      return null;
    }
    ctx.activities = [...ctx.activities, activity];
  }
  const ctxWithoutRide = { ...ctx, activities: ctx.activities.filter((a) => !isThisRide(a)) };

  const metaGoals = await activitiesRepo.getActiveMetaGoals(userId);
  const allSubGoals = await activitiesRepo.getSubGoalsForMetaGoals(metaGoals.map((mg) => mg.id));
  const subGoalsByMeta = new Map();
  for (const sg of allSubGoals) {
    if (!subGoalsByMeta.has(sg.meta_goal_id)) subGoalsByMeta.set(sg.meta_goal_id, []);
    subGoalsByMeta.get(sg.meta_goal_id).push(sg);
  }

  const result = [];
  for (const metaGoal of metaGoals) {
    const subGoals = subGoalsByMeta.get(metaGoal.id) || [];
    if (subGoals.length === 0) continue;

    const contributions = [];
    let percentAfter = 0;
    let percentBefore = 0;

    for (const sg of subGoals) {
      const target = Number(sg.target_value) || 1;
      // Same effective window GET /api/goals uses — a sub-goal carries no
      // dates of its own, it inherits its meta-goal's (services/goals.js).
      const windowed = { ...sg, ...goalWindow(sg, ctx) };
      const after = Number(goalCalculator.calculateProgress(windowed, ctx)) || 0;
      const before = Number(goalCalculator.calculateProgress(windowed, ctxWithoutRide)) || 0;
      percentAfter += Math.min((after / target) * 100, 100);
      percentBefore += Math.min((before / target) * 100, 100);

      // health/coach/manual sub-goals pass their stored value through both
      // runs (see goalCalculator.js's header), so they land here as a 0
      // delta and contribute nothing — correct: a ride didn't move them.
      const delta = after - before;
      if (delta > MIN_CONTRIBUTION) {
        contributions.push({
          type: String(sg.metric?.field || sg.metric?.source || sg.goal_type || 'progress'),
          label: sg.title || getGoalTypeLabel(sg.goal_type || '') || 'Progress',
          value: `+${formatContribution(delta)}${sg.unit ? ` ${sg.unit}` : ''}`,
        });
      }
    }

    const avgProgressAfter = percentAfter / subGoals.length;
    const avgProgressBefore = percentBefore / subGoals.length;

    // Сохраняем в БД - ПЕРЕЗАПИСЫВАЕМ последний заезд для этой мета-цели
    await activitiesRepo.upsertProgress(activityId, metaGoal.id, userId, avgProgressBefore, avgProgressAfter, contributions);

    result.push({
      id: metaGoal.id,
      title: metaGoal.title,
      status: metaGoal.status,
      progress: Math.round(avgProgressAfter),
      progressGain: Math.max(0, Math.round(avgProgressAfter - avgProgressBefore)),
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
