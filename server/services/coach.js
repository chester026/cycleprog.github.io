// AI Coach service instance (T-4.1). Extracted verbatim from server.js —
// see aiCoach.js for the module factory (TOOLS/executeTool/buildSystemPrompt/
// openai client) and routes/coach.js for the HTTP/SSE layer built on top of it.
const { pool } = require('../db');
const createCoachModule = require('../aiCoach');
const stravaActivities = require('./strava/activities');

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

function sseSend(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

module.exports = { coach, sseSend };
