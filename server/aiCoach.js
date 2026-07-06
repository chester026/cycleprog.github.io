// server/aiCoach.js
//
// AI Coach — conversational cycling coach for BikeLab.
//
// This module is a dependency-injected factory rather than a plain export:
// server.js already owns the Postgres pool, the in-memory activities/bikes
// caches, and helper functions like calculateGoalProgress. Re-requiring or
// duplicating those here would fork the source of truth (and, for Strava
// auth, duplicate a token-refresh flow that has no business living twice).
// Instead server.js calls `createCoachModule({ pool, activitiesCache, ... })`
// once at startup and mounts the returned TOOLS/executeTool/buildSystemPrompt
// into the /api/coach/chat route.
//
// create_goal deliberately reuses generateGoalsWithAI from aiGoals.js — the
// terrain/experience-aware planning engine (region keywords -> focus metrics,
// experience-scaled targets, trend + strengths/weaknesses analysis) is real
// domain expertise that predates this chat feature and should stay the single
// source of truth for how a goal gets built, whether triggered from the old
// one-shot UI or from the coach conversation.

const OpenAI = require('openai');
const {
  generateGoalsWithAI,
  calculateRecentStats,
  analyzePerformanceTrends,
  identifyStrengthsAndWeaknesses,
} = require('./aiGoals');
const {
  getUserProfile,
  getAllTrainingTypes,
  getGoalSpecificRecommendations,
} = require('./recommendations');
const { getUserAchievements } = require('./achievements');

const COACH_MODEL = process.env.COACH_MODEL || 'gpt-4.1-mini';

// --- Tool schemas (OpenAI function-calling format) -------------------------

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description:
        "Get the rider's profile: weight, age, gender, experience level, max/resting HR, lactate threshold. Use whenever you need physical context about the user.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_activities',
      description:
        'Get the user\'s most recent cycling activities, newest first, with distance, duration, elevation, speed, HR, power, cadence. Use for "how was my last ride", training-load analysis, or spotting patterns.',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'integer',
            description: 'How many recent activities to return (default 10, max 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_activity_totals',
      description:
        'Get EXACT cumulative totals (total distance, elevation gain, moving time, ride count, and overall ' +
        'average speed) over a period — "how much elevation have I climbed this year", "how far have I ridden ' +
        'this month", "total distance last 30 days", "how many rides this year", "show my total stats". Always ' +
        'use this tool for any question asking for a sum, total, or cumulative number over a date range — do ' +
        'NOT try to add up individual rides from get_recent_activities yourself, since that tool is capped at ' +
        '50 rides and manual summing over many rows is unreliable. This tool computes the exact sum ' +
        'server-side over the rider\'s COMPLETE ride history for the period, not just a recent subset. For a ' +
        'general "show my total stats" request with no period specified, call it TWICE — once with ' +
        '"all_time" and once with "last_365_days" — and present both figures side by side (all-time vs. the ' +
        'last year) rather than picking just one.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['last_7_days', 'last_30_days', 'last_90_days', 'ytd', 'last_365_days', 'all_time'],
            description:
              '"ytd" = year to date (since Jan 1 of the current year) — use this for "this year" questions. ' +
              'Defaults to "ytd" if not specified.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_activity_analysis',
      description:
        'Get detailed analysis for a specific activity: distance/time/speed/HR/power summary, an effort score ' +
        "(0-100, intensity x duration), comparison with the user's baseline averages, comparison with a similar " +
        "past ride, and skills-radar delta if it changed after this ride. Use for \"analyse my ride\", \"how was my last ride\", " +
        'or any question about a specific activity. If the user\'s message references a specific activity ' +
        '(e.g. an ID mentioned in their message), pass it as activity_id — otherwise this defaults to their ' +
        'most recent activity, which may NOT be the one they mean.',
      parameters: {
        type: 'object',
        properties: {
          activity_id: {
            type: 'integer',
            description:
              'Strava activity ID to analyze. Look for a number the user or app mentioned explicitly ' +
              '(e.g. "activity 12345678"). If not provided, defaults to the most recent activity.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics_snapshot',
      description:
        'Get the latest computed fitness snapshot: avg/max power, avg/max HR, avg speed, cadence, VO2max estimate, activity count. Use for FTP/power/HR trend questions or a general fitness overview.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skills_radar',
      description:
        "Get the user's rider skills snapshot (climbing, sprinting, endurance, etc.) and its trend. Use for \"what are my strengths\", rider-type questions, or bike recommendations.",
      parameters: {
        type: 'object',
        properties: {
          history: {
            type: 'integer',
            description: 'How many past snapshots to include for trend (default 1 = latest only, max 12)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_goals_progress',
      description:
        'Get all of the user\'s goals (active and completed) with computed progress toward each sub-metric. Use for "how is my goal going" or to check for duplicates before suggesting a new one.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description:
        "Create a new structured training goal using the app's terrain/experience-aware planning engine. Only call this AFTER confirming the goal and rough timeframe with the user in conversation. Pass a clear, complete restatement of what they want — the engine analyzes their profile and recent performance and generates the metric targets and training plan itself.",
      parameters: {
        type: 'object',
        properties: {
          userGoalDescription: {
            type: 'string',
            description:
              'Clear, complete restatement of the cycling goal in natural language, e.g. "Ride a 200km gran fondo with 3000m elevation in the Alps in 3 months" or "Improve my FTP by 10% over 8 weeks".',
          },
        },
        required: ['userGoalDescription'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_goal',
      description:
        'Update an existing goal: mark it completed, change status, or change its target date. Confirm with the user before calling.',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'integer', description: 'The meta-goal id to update' },
          status: { type: 'string', enum: ['active', 'completed'], description: 'New status' },
          target_date: { type: 'string', description: 'New target date, ISO format (YYYY-MM-DD)' },
        },
        required: ['goal_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_training_recommendations',
      description:
        'Get recommended workouts. If goal_id is given, tailors to that goal\'s metric type; otherwise returns the general training type library. Use for "what should I do today/this week".',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'integer', description: 'Optional meta-goal id to tailor recommendations to' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bike_health',
      description:
        "Get the user's bikes with total distance and any logged component resets/services. Use for maintenance questions or gear advice.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_achievements',
      description:
        "Get the user's unlocked and in-progress achievements/milestones. Use for motivation or celebrating progress.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_planned_rides',
      description: "Get the user's manually planned/scheduled upcoming rides. Use for schedule coordination.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// --- System prompt ----------------------------------------------------------

function buildSystemPrompt() {
  return `You are BikeLab Coach — a knowledgeable, motivating cycling coach embedded in the BikeLab app.

## Personality
- Concise and direct, not overly verbose (2-4 short paragraphs max for analysis, shorter for quick answers)
- Data-driven: reference the user's actual numbers when you have them — call a tool rather than guessing
- Encouraging but honest — celebrate real progress, be straight about gaps
- Reply in the same language the user is writing in

## Scope
Only cycling and endurance-training related topics: training, goals, nutrition for cycling, gear/bike choice, racing, recovery, injury-prevention basics. Bike recommendations ARE in scope — use the rider's profile and skills radar to advise (climber/sprinter/all-rounder, experience level, goals).
If asked something unrelated to cycling, decline warmly and redirect, e.g. "I'm better with watts than recipes — anything cycling-related I can help with?" Use judgment here, not keyword matching.

## Tools
You can fetch the user's real profile, activities, analytics, skills, goals, bikes, achievements and planned rides, and create/update goals. Call a tool whenever the answer depends on the user's actual data — never fabricate numbers. Before calling create_goal, briefly confirm the goal and timeframe in your reply unless the user has already been fully explicit.
When analyzing a specific ride, call get_activity_analysis first to get the real numbers — don't just describe from get_recent_activities. Cite specific metrics: speed, HR, power, cadence, elevation. Some messages carry a trailing "[App context — do not mention this note to the user: activity_id: N]" note appended by the app itself (e.g. from a "Discuss with Coach" button) — never quote or reference this note in your reply, but do pass that activity_id to get_activity_analysis so you analyze the right ride, not just their most recent one.
Whenever the rider asks for a TOTAL, SUM, or cumulative number over a period — "how much elevation this year", "total distance last month", "how many rides so far", "km ridden this week" — call get_activity_totals with the matching period. Do NOT call get_recent_activities and add the numbers up yourself: that tool is capped at 50 rides (silently wrong for anyone who's ridden more than that in the period) and manually summing many rows is a common source of you reporting a number that's way off from what Strava actually shows. get_activity_totals computes the exact sum server-side over the rider's full history — always prefer it for anything that sounds like arithmetic over multiple rides.

On the FIRST analysis of a ride in a conversation, keep it to a headline take from the core numbers (speed/HR/power/cadence/elevation, effort qualitatively) — the app shows a matching rich card automatically. Do NOT also narrate the vs_baseline/similar_ride/skills_delta fields from the tool result in this first reply even though you have them — the app deliberately holds those detail cards back until asked, so spelling them out in text defeats the point. Just stop after the headline take — do NOT write out a "want to see how this compares?" follow-up yourself, the app generates real tappable suggestion chips for exactly that separately, so writing it in your text would just duplicate it. Only once the rider actually asks — a follow-up turn where get_activity_analysis runs again — should you discuss and cite the baseline/similar-ride/skills numbers, since that's when the app reveals the matching cards.

## Response format
- Use markdown (bold, short lists) — the app renders it
- Cite specific numbers from tool results when analyzing performance
- Never write your own "what do you want next?" list or follow-up questions/options at the end of your reply — the app always generates real tappable suggestion chips separately after your message, so anything you write in that vein just duplicates them. End your reply once you've actually answered the question.`;
}

// --- Factory -----------------------------------------------------------------

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {{get:(k:any)=>any}} deps.activitiesCache - BoundedCache of Strava activities per user
 * @param {{get:(k:any)=>any}} deps.bikesCache - BoundedCache of formatted bikes per user
 * @param {(goal:object, activities:object[], userProfile?:object)=>number} deps.calculateGoalProgress
 */
function createCoachModule(deps) {
  const { pool, activitiesCache, bikesCache, calculateGoalProgress } = deps;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Three-tier read: hot in-memory cache first (fastest, zero DB round trip
  // when a screen already warmed it this session), then the durable Postgres
  // mirror (survives restarts/deploys — see synced_activities in server.js),
  // and only if BOTH are empty (brand new user, never opened Activities even
  // once) does a tool fall back to telling the user to open the tab.
  function mapSyncedActivityRow(r) {
    return {
      id: Number(r.strava_id),
      name: r.name,
      type: r.type,
      start_date: r.start_date,
      distance: Number(r.distance) || 0,
      moving_time: Number(r.moving_time) || 0,
      total_elevation_gain: Number(r.total_elevation_gain) || 0,
      average_speed: Number(r.average_speed) || 0,
      max_speed: Number(r.max_speed) || 0,
      average_heartrate: r.average_heartrate != null ? Number(r.average_heartrate) : null,
      max_heartrate: r.max_heartrate != null ? Number(r.max_heartrate) : null,
      average_cadence: r.average_cadence != null ? Number(r.average_cadence) : null,
      average_watts: r.average_watts != null ? Number(r.average_watts) : null,
      max_watts: r.max_watts != null ? Number(r.max_watts) : null,
      weighted_average_watts: r.weighted_average_watts != null ? Number(r.weighted_average_watts) : null,
    };
  }

  async function getCachedActivities(userId) {
    const cached = activitiesCache.get(userId);
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) return cached.data;

    try {
      const result = await pool.query(
        'SELECT * FROM synced_activities WHERE user_id = $1 ORDER BY start_date DESC',
        [userId]
      );
      if (result.rows.length > 0) return result.rows.map(mapSyncedActivityRow);
    } catch (err) {
      console.error('[aiCoach] Failed to read synced_activities:', err.message);
    }
    return [];
  }

  const executors = {
    async get_user_profile(args, { userId }) {
      const profile = await getUserProfile(pool, userId);
      return profile || {};
    },

    async get_recent_activities(args, { userId }) {
      const count = Math.min(Math.max(parseInt(args?.count, 10) || 10, 1), 50);
      const activities = await getCachedActivities(userId);
      if (activities.length === 0) {
        return {
          activities: [],
          note: 'No activity data available right now — ask the user to open the Activities tab once to sync from Strava.',
        };
      }
      const sorted = [...activities].sort(
        (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );
      const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
      // Raw Strava activities store distance in meters, time in seconds, and
      // speed in METERS PER SECOND — every other place in this app converts
      // before displaying (see `* 3.6` for speed throughout the RN app).
      // Doing that conversion here, with the unit in the key name, means the
      // model never has to guess units and get it wrong (it previously
      // reported raw m/s numbers as if they were km/h).
      const formatted = sorted.slice(0, count).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        start_date: a.start_date,
        distance_km: round1((a.distance || 0) / 1000),
        moving_time_min: round1((a.moving_time || 0) / 60),
        elevation_gain_m: Math.round(a.total_elevation_gain || 0),
        average_speed_kmh: round1((a.average_speed || 0) * 3.6),
        max_speed_kmh: round1((a.max_speed || 0) * 3.6),
        average_heartrate_bpm: a.average_heartrate || null,
        max_heartrate_bpm: a.max_heartrate || null,
        average_cadence_rpm: a.average_cadence || null,
        average_watts: a.average_watts || null,
        max_watts: a.max_watts || null,
        weighted_average_watts: a.weighted_average_watts || null,
      }));
      return { activities: formatted };
    },

    // Computes exact sums server-side instead of handing the model a list
    // to add up itself — get_recent_activities is capped at 50 rows, and
    // even below that cap LLMs are unreliable at manually summing many
    // numbers. getCachedActivities has no such cap (see its own comment),
    // so this can genuinely answer "how much have I climbed this year"
    // against the rider's complete history.
    async get_activity_totals(args, { userId }) {
      const activities = await getCachedActivities(userId);
      if (activities.length === 0) {
        return { note: 'No activity data available right now — ask the user to open the Activities tab once to sync from Strava.' };
      }

      const period = args?.period || 'ytd';
      const now = new Date();
      let startDate;
      switch (period) {
        case 'last_7_days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last_30_days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'last_90_days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'last_365_days':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'all_time':
          startDate = new Date(0);
          break;
        case 'ytd':
        default:
          startDate = new Date(now.getFullYear(), 0, 1);
      }

      const inRange = activities.filter((a) => a.start_date && new Date(a.start_date) >= startDate);
      const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
      const totals = inRange.reduce(
        (acc, a) => {
          acc.distance_km += (a.distance || 0) / 1000;
          acc.elevation_gain_m += a.total_elevation_gain || 0;
          acc.moving_time_hours += (a.moving_time || 0) / 3600;
          return acc;
        },
        { distance_km: 0, elevation_gain_m: 0, moving_time_hours: 0 }
      );

      // Formatted from local date parts rather than toISOString(), which
      // converts to UTC first and can silently roll "Jan 1" back to "Dec 31"
      // for the label depending on server timezone — cosmetic only (the
      // actual filtering above compares real Date instants, unaffected),
      // but there's no reason to hand the model a label that can visibly
      // contradict the period it asked for.
      const startDateLabel = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

      // Total distance / total moving time, NOT an average of each ride's
      // own average_speed_kmh — averaging averages would under/over-weight
      // short vs long rides. This is the same "overall pace across the
      // period" definition a cycling computer's cumulative stats would use.
      const avgSpeedKmh = totals.moving_time_hours > 0 ? totals.distance_km / totals.moving_time_hours : 0;

      return {
        period,
        start_date: startDateLabel,
        ride_count: inRange.length,
        distance_km: round1(totals.distance_km),
        elevation_gain_m: Math.round(totals.elevation_gain_m),
        moving_time_hours: round1(totals.moving_time_hours),
        avg_speed_kmh: round1(avgSpeedKmh),
      };
    },

    // Server-side mirror of the deterministic computations RideAnalyticsScreen
    // does client-side from streams data (Ride Quality, Effort Score, HR
    // zones). We deliberately do NOT re-fetch streams here (thousands of
    // points per channel per activity — expensive and the model doesn't need
    // raw samples to describe a ride). Instead this returns the same summary
    // numbers the dashboard is built from (activity totals, baseline delta,
    // similar-ride delta, skills delta) so the coach can give a grounded,
    // number-backed analysis without duplicating the chart-rendering logic.
    async get_activity_analysis(args, { userId }) {
      const activities = await getCachedActivities(userId);
      if (activities.length === 0) {
        return { note: 'No activity data available right now — ask the user to open the Activities tab once to sync from Strava.' };
      }

      let activity;
      if (args?.activity_id) {
        activity = activities.find((a) => Number(a.id) === Number(args.activity_id));
        if (!activity) return { error: 'not_found', message: 'Activity not found' };
      } else {
        activity = [...activities].sort(
          (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        )[0];
      }

      const snapshotResult = await pool
        .query('SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1', [userId])
        .catch(() => ({ rows: [] }));
      const snapshot = snapshotResult.rows[0] || null;

      const profileResult = await pool
        .query('SELECT * FROM user_profiles WHERE user_id = $1', [userId])
        .catch(() => ({ rows: [] }));
      const profile = profileResult.rows[0] || {};

      const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
      const distKm = round1((activity.distance || 0) / 1000);
      const movingMin = round1((activity.moving_time || 0) / 60);
      const avgSpeedKmh = round1((activity.average_speed || 0) * 3.6);
      const maxSpeedKmh = round1((activity.max_speed || 0) * 3.6);

      // Effort Score used to only exist client-side (RideAnalyticsScreen),
      // computed from the full per-second HR stream. We don't fetch streams
      // here (see module comment above), so this is an average-HR-based
      // approximation of the same formula — same constants (150 scale,
      // 2.5h saturation), just intensity from avg HR instead of integrating
      // over the curve. Close enough for the coach's chat card; not claimed
      // to be pixel-identical to a streams-based score (which no longer
      // exists anywhere in the app since the dashboard card was removed).
      let effortScore = null;
      const maxHR = profile.max_hr || activity.max_heartrate || 190;
      const restHR = profile.resting_hr || 60;
      const hrReserve = maxHR - restHR;
      if (activity.average_heartrate && hrReserve > 0) {
        const intensity = Math.max(0, Math.min(1, (activity.average_heartrate - restHR) / hrReserve));
        const durationHours = (activity.moving_time || 0) / 3600;
        const durationFactor = 1 - Math.exp(-durationHours / 2.5);
        effortScore = Math.min(100, Math.round(intensity * durationFactor * 150));
      }

      const result = {
        activity: {
          id: activity.id,
          name: activity.name,
          date: activity.start_date,
          distance_km: distKm,
          moving_time_min: movingMin,
          elevation_gain_m: Math.round(activity.total_elevation_gain || 0),
          avg_speed_kmh: avgSpeedKmh,
          max_speed_kmh: maxSpeedKmh,
          avg_hr_bpm: activity.average_heartrate || null,
          max_hr_bpm: activity.max_heartrate || null,
          avg_cadence_rpm: activity.average_cadence || null,
          avg_watts: activity.average_watts || null,
          max_watts: activity.max_watts || null,
          weighted_avg_watts: activity.weighted_average_watts || null,
          effort_score: effortScore,
        },
      };

      if (snapshot) {
        result.vs_baseline = {};
        if (activity.average_speed && snapshot.avg_speed) {
          result.vs_baseline.speed_kmh = {
            ride: avgSpeedKmh,
            avg: round1(Number(snapshot.avg_speed)),
            diff: round1(avgSpeedKmh - Number(snapshot.avg_speed)),
          };
        }
        if (activity.average_heartrate && snapshot.avg_hr) {
          result.vs_baseline.hr_bpm = {
            ride: activity.average_heartrate,
            avg: round1(Number(snapshot.avg_hr)),
            diff: round1(activity.average_heartrate - Number(snapshot.avg_hr)),
          };
        }
        if (activity.average_watts && snapshot.avg_power) {
          result.vs_baseline.power_watts = {
            ride: activity.average_watts,
            avg: round1(Number(snapshot.avg_power)),
            diff: round1(activity.average_watts - Number(snapshot.avg_power)),
          };
        }
        if (activity.average_cadence && snapshot.avg_cadence) {
          result.vs_baseline.cadence_rpm = {
            ride: activity.average_cadence,
            avg: round1(Number(snapshot.avg_cadence)),
            diff: round1(activity.average_cadence - Number(snapshot.avg_cadence)),
          };
        }
      }

      const others = activities.filter((a) => a.id !== activity.id);
      const similar = others.find((a) => {
        const distDiff = Math.abs((a.distance || 0) - (activity.distance || 0));
        const elevDiff = Math.abs((a.total_elevation_gain || 0) - (activity.total_elevation_gain || 0));
        return (
          distDiff < (activity.distance || 1) * 0.4 &&
          elevDiff < Math.max((activity.total_elevation_gain || 1) * 0.6, 200)
        );
      });

      if (similar) {
        result.similar_ride = {
          name: similar.name,
          date: similar.start_date,
          distance_km: round1((similar.distance || 0) / 1000),
          avg_speed_kmh: round1((similar.average_speed || 0) * 3.6),
          avg_hr_bpm: similar.average_heartrate || null,
          avg_watts: similar.average_watts || null,
          avg_cadence_rpm: similar.average_cadence || null,
        };
      }

      try {
        const skillsResult = await pool.query(
          'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 2',
          [userId]
        );
        if (skillsResult.rows.length >= 2) {
          const [current, previous] = skillsResult.rows;
          const skillNames = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];
          const deltas = {};
          for (const s of skillNames) {
            const diff = Math.round(current[s] || 0) - Math.round(previous[s] || 0);
            if (diff !== 0) deltas[s] = { current: Math.round(current[s] || 0), previous: Math.round(previous[s] || 0), diff };
          }
          if (Object.keys(deltas).length > 0) result.skills_delta = deltas;
        }
      } catch (e) {
        /* non-critical */
      }

      return result;
    },

    async get_analytics_snapshot(args, { userId }) {
      const result = await pool.query(
        'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
        [userId]
      );
      return result.rows[0] || { note: 'No analytics snapshot computed yet.' };
    },

    async get_skills_radar(args, { userId }) {
      const limit = Math.min(Math.max(parseInt(args?.history, 10) || 1, 1), 12);
      const result = await pool.query(
        'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT $2',
        [userId, limit]
      );
      if (result.rows.length === 0) return { note: 'No skills history yet.' };
      return limit === 1 ? result.rows[0] : { latest: result.rows[0], history: result.rows };
    },

    async get_goals_progress(args, { userId }) {
      const metaResult = await pool.query(
        'SELECT * FROM meta_goals WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      const activities = await getCachedActivities(userId);
      const goals = [];
      for (const metaGoal of metaResult.rows) {
        const subResult = await pool.query(
          'SELECT * FROM goals WHERE meta_goal_id = $1 ORDER BY priority ASC',
          [metaGoal.id]
        );
        const subGoals = subResult.rows.map((g) => {
          const current = calculateGoalProgress(g, activities) || 0;
          const target = Number(g.target_value) || 1;
          return {
            id: g.id,
            metric: g.metric_name || g.goal_type,
            period: g.period,
            current,
            target,
            percent: Math.round(Math.min((Number(current) / target) * 100, 100)),
          };
        });
        goals.push({
          id: metaGoal.id,
          title: metaGoal.title,
          status: metaGoal.status,
          tier: metaGoal.tier,
          target_date: metaGoal.target_date,
          subGoals,
        });
      }
      return { goals };
    },

    async create_goal(args, { userId }) {
      const { userGoalDescription } = args || {};
      if (!userGoalDescription) throw new Error('userGoalDescription is required');

      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      const userProfile = profileResult.rows[0] || {};
      const activities = await getCachedActivities(userId);

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const recentActivities = activities.filter((a) => new Date(a.start_date) >= threeMonthsAgo);

      const recentStats = calculateRecentStats(recentActivities, '3m');
      const trends = analyzePerformanceTrends(recentActivities);
      const analysis = identifyStrengthsAndWeaknesses(recentActivities, userProfile);

      const aiResponse = await generateGoalsWithAI(userGoalDescription, userProfile, recentStats, trends, analysis);

      if (aiResponse.error) {
        return { error: aiResponse.error, message: aiResponse.message };
      }

      // Duplicate guard: in practice the coach has created two goals for the
      // same metric in one conversation (e.g. "average speed" twice), since
      // nothing stopped it beyond a soft hint in the system prompt to check
      // get_goals_progress first. Check objectively against the DB instead
      // of trusting the model's own judgment: if any of the freshly
      // generated sub-goal metric types already has an ACTIVE goal tracking
      // it, refuse to create a second one and tell the model exactly what
      // to do about it (offer to update the existing goal instead).
      const newGoalTypes = (aiResponse.subGoals || []).map((sg) => sg.goal_type).filter(Boolean);
      if (newGoalTypes.length > 0) {
        const existingActive = await pool.query(
          `SELECT mg.id, mg.title, g.goal_type
           FROM meta_goals mg
           JOIN goals g ON g.meta_goal_id = mg.id
           WHERE mg.user_id = $1 AND mg.status = 'active' AND g.goal_type = ANY($2::text[])`,
          [userId, newGoalTypes]
        );
        if (existingActive.rows.length > 0) {
          const conflict = existingActive.rows[0];
          return {
            created: false,
            duplicate: true,
            existingGoal: { id: conflict.id, title: conflict.title, goal_type: conflict.goal_type },
            message:
              `The user already has an active goal ("${conflict.title}", id ${conflict.id}) tracking ` +
              `the "${conflict.goal_type}" metric. Do NOT create another goal for the same metric. ` +
              `Tell the user about the existing goal and ask whether they'd like to update its target ` +
              `date via update_goal, or explicitly confirm they want a second, separate goal for the ` +
              `same metric before calling create_goal again.`,
          };
        }
      }

      const aiTier = aiResponse.metaGoal?.tier || aiResponse.tier;
      const tier = ['legendary', 'epic', 'grand', 'base'].includes(aiTier) ? aiTier : 'base';
      const aiContext = JSON.stringify({
        userGoal: userGoalDescription,
        trainingTypes: aiResponse.metaGoal.trainingTypes || [],
      });

      const metaGoalResult = await pool.query(
        `INSERT INTO meta_goals (user_id, title, description, target_date, ai_generated, ai_context, status, tier)
         VALUES ($1, $2, $3, $4, true, $5, 'active', $6)
         RETURNING *`,
        [
          userId,
          aiResponse.metaGoal.title,
          aiResponse.metaGoal.description,
          aiResponse.metaGoal.target_date || null,
          aiContext,
          tier,
        ]
      );
      const metaGoal = metaGoalResult.rows[0];

      let createdSubGoalsCount = 0;
      for (const subGoal of aiResponse.subGoals || []) {
        await pool.query(
          `INSERT INTO goals (
             user_id, meta_goal_id, title, description, target_value, current_value,
             unit, goal_type, period, priority, reasoning
           ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10)`,
          [
            userId,
            metaGoal.id,
            subGoal.title,
            subGoal.description,
            subGoal.target_value || 0,
            subGoal.unit,
            subGoal.goal_type,
            subGoal.period || '4w',
            subGoal.priority || 3,
            subGoal.reasoning || '',
          ]
        );
        createdSubGoalsCount += 1;
      }

      return {
        created: true,
        metaGoal: {
          id: metaGoal.id,
          title: metaGoal.title,
          description: metaGoal.description,
          tier: metaGoal.tier,
          target_date: metaGoal.target_date,
        },
        subGoalsCount: createdSubGoalsCount,
      };
    },

    async update_goal(args, { userId }) {
      const { goal_id, status, target_date } = args || {};
      if (!goal_id) throw new Error('goal_id is required');

      const sets = [];
      const values = [];
      let i = 1;
      if (status) {
        sets.push(`status = $${i++}`);
        values.push(status);
      }
      if (target_date) {
        sets.push(`target_date = $${i++}`);
        values.push(target_date);
      }
      if (sets.length === 0) throw new Error('Nothing to update — provide status and/or target_date');

      values.push(goal_id, userId);
      const result = await pool.query(
        `UPDATE meta_goals SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
        values
      );
      if (result.rows.length === 0) return { error: 'not_found', message: 'Goal not found' };
      return { updated: true, metaGoal: result.rows[0] };
    },

    async get_training_recommendations(args, { userId }) {
      if (args?.goal_id) {
        return await getGoalSpecificRecommendations(pool, userId, args.goal_id);
      }
      return { trainingTypes: getAllTrainingTypes() };
    },

    async get_bike_health(args, { userId }) {
      const cached = bikesCache.get(userId);
      let bikes = cached && Array.isArray(cached.data) ? cached.data : [];

      // Same three-tier fallback as activities: in-memory cache first, then
      // the durable synced_bikes mirror (survives restarts/deploys), and
      // only then the "go open the Garage tab" note.
      if (bikes.length === 0) {
        try {
          const result = await pool.query('SELECT * FROM synced_bikes WHERE user_id = $1', [userId]);
          bikes = result.rows.map((r) => ({
            id: r.bike_id,
            name: r.name,
            distanceKm: Number(r.distance_km) || 0,
            primary: !!r.is_primary,
            brand_name: r.brand_name,
            model_name: r.model_name,
          }));
        } catch (err) {
          console.error('[aiCoach] Failed to read synced_bikes:', err.message);
        }
      }

      if (bikes.length === 0) {
        return {
          bikes: [],
          note: 'No bike data available right now — ask the user to open the Garage tab once to sync from Strava.',
        };
      }

      const resetsResult = await pool
        .query('SELECT * FROM bike_component_resets WHERE user_id = $1', [userId])
        .catch(() => ({ rows: [] }));

      const bikesWithMaintenance = bikes.map((bike) => {
        const resets = resetsResult.rows.filter((r) => String(r.bike_id) === String(bike.id));
        return {
          id: bike.id,
          name: bike.name,
          distanceKm: bike.distanceKm,
          primary: bike.primary,
          brand_name: bike.brand_name,
          model_name: bike.model_name,
          componentResets: resets.map((r) => ({
            component: r.component,
            reset_at: r.reset_at,
            reset_km: r.reset_km,
          })),
        };
      });

      return { bikes: bikesWithMaintenance };
    },

    async get_achievements(args, { userId }) {
      const achievements = await getUserAchievements(pool, userId);
      return { achievements };
    },

    async get_planned_rides(args, { userId }) {
      const result = await pool.query('SELECT * FROM rides WHERE user_id = $1 ORDER BY start ASC', [userId]);
      return { rides: result.rows };
    },
  };

  async function executeTool(name, args, ctx) {
    const fn = executors[name];
    if (!fn) throw new Error(`Unknown tool: ${name}`);
    return fn(args || {}, ctx);
  }

  return { openai, COACH_MODEL, TOOLS, buildSystemPrompt, executeTool };
}

module.exports = createCoachModule;
