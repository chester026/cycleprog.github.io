// AI Coach service instance (T-4.1). Extracted verbatim from server.js —
// see aiCoach.js for the module factory (TOOLS/executeTool/buildSystemPrompt/
// openai client) and routes/coach.js for the HTTP/SSE layer built on top of it.
const { pool } = require('../db');
const createCoachModule = require('../aiCoach');
const stravaActivities = require('./strava/activities');
const coachRepo = require('../repositories/coach');
const { notFound } = require('../lib/apiError');

const { activitiesCache, bikesCache } = stravaActivities;

// AI Coach — see aiCoach.js. Goal progress is computed via goalCalculator.js
// (backed by @bikelab/shared/calc, T-3.4) directly inside aiCoach.js, not
// threaded through here.
const coach = createCoachModule({
  pool,
  activitiesCache,
  bikesCache,
  // BIKE_COMPONENTS is declared in services/bikes.js (near the bike-health
  // route) — wrapped in a getter because this object is built at
  // module-load time, before that module may have finished loading, but the
  // getter itself is only ever called once a real request comes in, long
  // after the whole file has finished loading.
  getBikeComponents: () => require('./bikes').BIKE_COMPONENTS,
});

async function renameConversation(id, userId, title) {
  const row = await coachRepo.renameConversation(id, userId, title);
  if (!row) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  return row;
}

function sseSend(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// SSE comment frames (`: ping`) are ignored by every client per the spec,
// but keep proxies/load balancers from idling out the connection while the
// model is still thinking (a reasoning turn can be silent for 30 s+).
const SSE_HEARTBEAT_INTERVAL_MS = 15000;

// Returns the stop function; the route hooks it to the response's `finish`
// and `close` events so no timer outlives the response, however it ends.
function startSseHeartbeat(res, intervalMs = SSE_HEARTBEAT_INTERVAL_MS) {
  const timer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(timer);
      return;
    }
    res.write(': ping\n\n');
  }, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { coach, sseSend, startSseHeartbeat, SSE_HEARTBEAT_INTERVAL_MS, renameConversation };
