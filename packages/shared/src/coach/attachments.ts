/**
 * Attached activities → hidden context for the model. The user's own chat
 * bubble stays free of this; only the request payload carries it.
 */
import type { AttachedActivity } from '../types/coachUi.js';

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
