/**
 * Attached activities → hidden context for the model. The user's own chat
 * bubble stays free of this; only the request payload carries it.
 */
import type { AttachedActivity, AttachedRoute } from '../types/coachUi.js';

// ~200 tokens per serialised activity is the budget this cap assumes; it
// keeps a multi-activity question well within the turn's context without
// the picker needing a scroll-within-scroll UI.
export const MAX_ATTACHED_ACTIVITIES = 5;

const ATTACHMENTS_HEADER = 'The user has attached the following activities for context:';

function formatDuration(movingTimeSec: number): string {
  return `${Math.floor(movingTimeSec / 3600)}h${Math.floor((movingTimeSec % 3600) / 60)}m`;
}

/**
 * One plain-text line per activity (id, name, type, date, distance, time,
 * climb, optional avg HR / power), under a fixed English header the prompt
 * expects. Dates are rendered in en-US regardless of UI language — this
 * text is for the model, not the rider.
 */
export function serializeAttachedActivities(activities: readonly AttachedActivity[]): string {
  const lines = activities.map((a) => {
    const date = new Date(a.start_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const dist = (a.distance / 1000).toFixed(1);
    const elev = Math.round(a.total_elevation_gain);
    let line = `[Activity ${a.id}] ${a.name} (${a.type}) — ${date}, ${dist}km, ${formatDuration(a.moving_time)}, ${elev}m↑`;
    if (a.average_heartrate) line += `, avg HR ${Math.round(a.average_heartrate)}`;
    if (a.average_watts) line += `, avg ${Math.round(a.average_watts)}W`;
    return line;
  });
  return `${ATTACHMENTS_HEADER}\n${lines.join('\n')}`;
}

// A stage race is three to five stages; each route line is ~60 tokens.
export const MAX_ATTACHED_ROUTES = 5;

/** Climbs named in a route line — the longest ones; the plan itself has them all. */
const ROUTE_MAX_CLIMBS = 6;

function routeLine(route: AttachedRoute): string {
  const climbs = [...route.climbs]
    .sort((a, b) => b.length_km - a.length_km)
    .slice(0, ROUTE_MAX_CLIMBS)
    .sort((a, b) => a.at_km - b.at_km)
    .map((c) => `${c.length_km} km at ${c.grade_pct}% from km ${c.at_km}`);
  const line = `[Route ${route.course_id}] ${route.name ?? 'Unnamed route'} — ${route.distance_km} km, ${route.elevation_gain_m} m↑`;
  return `${line}${climbs.length ? `; climbs: ${climbs.join('; ')}` : '; no climbs to speak of'}`;
}

/**
 * The attached routes, one line each, under a fixed English header the
 * prompt expects: the course_id (what plan_race takes), name, length,
 * climbing and the main climbs in riding order. The lines keep the order the
 * rider attached the files in — for a stage race, the order of the stages.
 */
export function serializeAttachedRoutes(routes: readonly AttachedRoute[]): string {
  const header = routes.length === 1 ? 'The user has attached a route file:' : `The user has attached ${routes.length} route files:`;
  return `${header}\n${routes.map(routeLine).join('\n')}`;
}
