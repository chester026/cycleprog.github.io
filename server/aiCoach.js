// server/aiCoach.js
//
// AI Coach — conversational cycling coach for BikeLab.
//
// This module is a dependency-injected factory rather than a plain export:
// server.js already owns the Postgres pool and the in-memory activities/
// bikes caches. Re-requiring or duplicating those here would fork the
// source of truth (and, for Strava auth, duplicate a token-refresh flow
// that has no business living twice). Goal progress itself is computed via
// goalCalculator.js (backed by @bikelab/shared/calc), required directly
// below rather than threaded through these deps — it is pure/stateless, so
// there is no server.js state to inject.
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
  FOCUS_TAGS,
} = require('./aiGoals');
const {
  getUserProfile,
  getAllTrainingTypes,
  getGoalSpecificRecommendations,
} = require('./recommendations');
const { getUserAchievements } = require('./achievements');
// Single shared HR-zones implementation (T-3.1) — used below to classify an
// activity's average HR into a zone instead of an ad-hoc reserve calculation.
const { computeHrZones, zoneForHr, ridePowerWatts } = require('@bikelab/shared/calc');
// Universal declarative goal-progress calculator — see goalCalculator.js's
// header and md/GOALS_REDESIGN_PLAN_FINAL.md. Pure functions, no dependency
// on server.js state, so a direct require here is safe.
const goalCalculator = require('./goalCalculator');
const ouraService = require('./ouraService');
const config = require('./config');
const logger = require('./lib/logger');
const checklistRepo = require('./repositories/checklist');
const checklistService = require('./services/checklist');

const COACH_MODEL = config.COACH_MODEL;

// Used to validate start_date/end_date on calendar tool calls before they
// hit Postgres — see create_calendar_event/update_calendar_event executors.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Format alone isn't enough — "2024-04-09" passes ISO_DATE_RE just fine but
// is still a hallucinated date if the model lost track of what year it is
// (observed in production: the model defaulted to a date near its training
// cutoff instead of using the real "Today" line in the system prompt).
// Generous window (90 days back, ~3 years ahead) so legitimate near-term
// backdating and multi-year training plans still work.
function isPlausibleEventDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const minMs = now - 90 * 86400000;
  const maxMs = now + 3 * 365 * 86400000;
  return d.getTime() >= minMs && d.getTime() <= maxMs;
}

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
        'Get all of the user\'s goals (active and completed) with computed progress toward each sub-metric, their focus_tags (theme), and a summary of linked calendar sessions (scheduled/completed). Use for "how is my goal going" or to see the full picture before suggesting or scheduling something new.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description:
        "Create a new structured training goal using the app's terrain/experience-aware planning engine. Only call this AFTER confirming the goal and rough timeframe with the user in conversation. Pass a clear, complete restatement of what they want — the engine analyzes their profile and recent performance and generates the metric targets, focus tags, and training plan itself. This ALWAYS creates the goal — it never refuses for being a possible duplicate of an existing one (the result may include a possibleDuplicate note; if so, mention the similar goal to the user, don't undo the creation).",
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
        'Update an existing goal. Two things this covers: (1) meta-goal level — mark it completed, change status, or change its target date (confirm with the user first, e.g. after get_goals_progress returned readyToComplete for it). (2) sub-goal level — for a sub-goal whose metric.source is "coach" (a qualitative goal like technique or confidence that only YOU can assess, not a formula), move its current_value (0-100) based on what the rider reports in conversation; also use new_target_value to adjust a sub-goal that\'s badly over/under-shooting. A sub-goal has no deadline of its own — it runs for as long as its meta-goal does, so "give me more time" means changing the meta-goal\'s target_date.',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'integer', description: 'The meta-goal id to update' },
          status: { type: 'string', enum: ['active', 'completed'], description: 'New status for the meta-goal' },
          target_date: { type: 'string', description: 'New target date for the meta-goal, ISO format (YYYY-MM-DD)' },
          sub_goal_id: { type: 'integer', description: 'A specific sub-goal (goals table row) to update instead of/in addition to the meta-goal fields above.' },
          current_value: { type: 'number', description: 'New current_value (0-100) for a coach-tracked sub-goal — your own honest assessment based on the conversation, requires sub_goal_id.' },
          new_target_value: { type: 'number', description: 'Adjust a sub-goal\'s target_value, requires sub_goal_id.' },
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
      name: 'log_bike_service',
      description:
        'Mark one or more bike components as just serviced/replaced — resets that component\'s wear counter to zero starting from today\'s mileage, exactly like tapping "Mark as replaced" in the Garage tab. Call this any time the rider mentions doing maintenance in conversation ("I changed my chain", "just put new brake pads on", "replaced the cassette and chain last week") — don\'t make them go open the Garage tab and do it manually. If the rider has more than one bike and it isn\'t obvious which one from context, call get_bike_health first to see their bikes/ids and ask which bike if still unclear.',
      parameters: {
        type: 'object',
        properties: {
          bike_id: {
            type: 'string',
            description:
              "The bike's id (from get_bike_health). Omit if the rider only has one bike or clearly means their primary/default bike — the primary bike is used automatically in that case.",
          },
          components: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'chain', 'cassette', 'chainrings', 'brake_pads', 'rotors',
                'tires', 'sealant', 'wheel_bearings', 'bar_tape', 'saddle',
                'pedals', 'cleats',
              ],
            },
            description:
              'Which component(s) were serviced/replaced, mapped to these exact ids regardless of what language/wording the rider used ' +
              '(e.g. "chain" for chain/цепь, "cassette" for cassette/кассета, "brake_pads" for brake pads/тормозные колодки, ' +
              '"tires" for tires/покрышки, "bar_tape" for bar tape/обмотка руля, "sealant" for tubeless sealant, ' +
              '"wheel_bearings" for wheel/hub bearings, "chainrings" for chainrings, "rotors" for brake rotors/disc rotors, ' +
              '"cleats" for cleats, "pedals" for pedals, "saddle" for saddle).',
          },
        },
        required: ['components'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_bike_gear_label',
      description:
        'Attach the rider\'s actual product name to their bike\'s tracked parts, so the Garage tab shows real gear names instead of generic categories. Two independent scopes: ' +
        '"group" renames a whole section header when every part in it is really one purchase — e.g. wheels/tires/sealant/wheel_bearings are all "your wheelset", so if the rider says "my wheels are Hunt Carbon 45" set target_type="group", target_key="wheels", custom_name="Hunt Carbon 45" (same idea for target_key="drivetrain" when they name a groupset like Shimano Di2). ' +
        '"component" renames a single card without touching its neighbors — e.g. bar tape/saddle/pedals/cleats are unrelated products bundled only for display, so "my pedals are Favero Assioma" (a power meter) should set target_type="component", target_key="pedals", custom_name="Favero Assioma" and leave bar tape/saddle/cleats alone. ' +
        'A rider can name both in one sentence ("wheels are Hunt, tires are Conti GP5000 TR S") — pass both entries in the same call. Call get_bike_health first if you need the bike_id and don\'t already have it from this conversation.',
      parameters: {
        type: 'object',
        properties: {
          bike_id: {
            type: 'string',
            description:
              "The bike's id (from get_bike_health). Omit if the rider only has one bike or clearly means their primary/default bike.",
          },
          labels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                target_type: { type: 'string', enum: ['group', 'component'] },
                target_key: {
                  type: 'string',
                  description:
                    'For target_type="group": one of drivetrain, brakes, wheels, contact. ' +
                    'For target_type="component": one of chain, cassette, chainrings, brake_pads, rotors, tires, sealant, wheel_bearings, bar_tape, saddle, pedals, cleats.',
                },
                custom_name: { type: 'string', description: "The rider's own product name, e.g. \"Hunt Carbon 45\" or \"Favero Assioma\"." },
              },
              required: ['target_type', 'target_key', 'custom_name'],
            },
          },
        },
        required: ['labels'],
      },
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
      name: 'get_calendar',
      description:
        "Get the user's calendar events (planned rides, rest days, maintenance, purchases, races, notes) " +
        'for a date range. Use to check what\'s already scheduled before suggesting new plans, or when the ' +
        'user asks what\'s coming up / what they have planned. Also returns completed Strava activities in the ' +
        'same range so you see the full picture (what happened + what\'s planned) in one call.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date (YYYY-MM-DD). Default: today.' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD). Default: 30 days from now.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description:
        'Create a calendar event for the user — planned ride, rest day, bike maintenance, purchase reminder, ' +
        'race/event, or a free-form note. Confirm the details (what, when) with the user before calling unless ' +
        'they were already fully explicit. Call get_calendar first if you need to check for schedule conflicts. ' +
        'If this event is part of a training plan working toward a goal, pass goal_id — see the "Goals + Training ' +
        'Plan linking" section below for when that\'s required.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'],
            description: 'Event type.',
          },
          title: { type: 'string', description: 'Short title.' },
          description: { type: 'string', description: 'Optional details.' },
          start_date: { type: 'string', description: 'Date (YYYY-MM-DD).' },
          end_date: { type: 'string', description: 'End date if multi-day (YYYY-MM-DD). Omit for single-day.' },
          location: { type: 'string', description: 'Optional location.' },
          duration_minutes: {
            type: 'integer',
            description:
              'Roughly how long this session takes, in minutes (e.g. 45 for a core workout, 90 for a long ride). ' +
              'Optional — set it whenever you have a reasonable estimate for an actual training session, so the ' +
              'app can show it on the event card. Omit for events where duration is meaningless (a rest day, a ' +
              'maintenance reminder, a purchase, a plain note).',
          },
          goal_id: {
            type: 'integer',
            description:
              'Meta-goal id this session is training toward (from create_goal\'s result or get_goals_progress). ' +
              'Omit for one-off events not tied to a specific goal (a single rest day, a maintenance reminder, a ' +
              'purchase, a plain note).',
          },
        },
        required: ['type', 'title', 'start_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description: 'Update an existing calendar event. Call get_calendar first to get the event ID.',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'integer', description: 'Calendar event ID.' },
          title: { type: 'string' },
          description: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          type: { type: 'string', enum: ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'] },
          completed: { type: 'boolean' },
          location: { type: 'string' },
          duration_minutes: { type: 'integer', description: 'Update the estimated duration, in minutes.' },
          goal_id: {
            type: 'integer',
            description: 'Re-link this event to a different goal, or link a previously unlinked event. Pass null to unlink.',
          },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_event',
      description: 'Delete a calendar event. Confirm with the user before calling.',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'integer', description: 'Calendar event ID.' },
        },
        required: ['event_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_readiness',
      description:
        'Call this — instead of only narrating from memory — exactly when discussing training readiness, ' +
        'fatigue, or recovery AND Apple Health is connected (the Health & Recovery section of your system ' +
        'prompt says whether it is). This tells the app to show a Recovery card (score, sleep, resting HR/HRV) ' +
        'and a heart-rate-vs-speed fatigue trend chart alongside your reply, so the rider sees the real numbers ' +
        'behind what you say instead of just reading your summary. Call it at most once per turn, only when ' +
        "you're actually about to discuss readiness/recovery in this reply — never for unrelated questions.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_connect_apple_health',
      description:
        'Call this — instead of only writing about it in your reply — exactly when you decide, per the Health & ' +
        'Recovery guidance in your system prompt, to suggest the rider connect Apple Health (i.e. they asked ' +
        'something readiness/fatigue/recovery-shaped and Health is not connected yet). This has no effect on its ' +
        'own; it tells the app to show a real "Connect Apple Health" button that takes the rider straight to the ' +
        'connect screen, instead of leaving them to find it themselves. Call it at most once per turn, and only ' +
        'on turns where you actually raise the suggestion in your reply — never call it for unrelated questions ' +
        'or repeatedly if the rider has already ignored it earlier in the conversation.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_oura_readiness',
      description:
        "Get the rider's Oura Ring readiness/sleep/activity data for recent days — readiness score, sleep score, total sleep hours, HRV, resting heart rate, minimum heart rate, daily stress (day summary + high-stress/recovery time), resilience level, and blood oxygen (SpO2, Gen 3 rings only). Use when the rider asks how recovered/rested they are, about sleep quality, or whether today's a good day to push hard vs go easy. Returns an empty-state note if they haven't connected Oura yet.",
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'integer',
            description: 'How many most recent days to return (default 7, max 30)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_checklist',
      description:
        "Get the rider's checklist (their shopping/packing/todo list), grouped by section, with each item's " +
        'id/checked/link. Use this whenever the rider asks what\'s on their list, what they planned to buy or ' +
        'pack, or before adding a new item (to check it isn\'t already there under a slightly different name) ' +
        'or checking one off. Also call it before recommending gear to buy, so you don\'t suggest something ' +
        "already on the list or already checked off as bought.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_checklist_items',
      description:
        'Add one or more items to the rider\'s checklist. Call this any time the rider mentions wanting, ' +
        'planning, or needing to buy something ("I want new tires", "need a power meter", "thinking about ' +
        'getting bibs"), or explicitly asks you to add/remember/note something for them — don\'t make them ' +
        'open the Checklist tab and type it in manually. Also use it when YOU recommend a purchase (e.g. ' +
        'suggesting new tires as part of maintenance advice): either ask briefly if they want it added, or add ' +
        'it and say so in your reply — never add silently without mentioning it, and never add speculative gear ' +
        'you didn\'t actually recommend or that the rider didn\'t ask about. Call get_checklist first if you\'re ' +
        'not sure it\'s already there, to avoid duplicates.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            description:
              'Which section to add to. Default to "Shopping" for things to buy, "Packing" for ride/trip kit. ' +
              'If the rider already has a checklist (see get_checklist) with a section that clearly fits better, ' +
              'reuse that exact section name instead of creating a near-duplicate.',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item: { type: 'string', description: 'What to add, e.g. "Continental GP5000 TR S tires".' },
                link: { type: 'string', description: 'Optional product URL, if the rider gave one.' },
              },
              required: ['item'],
            },
            description: 'One or more items to add in a single call — don\'t call this tool once per item.',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_checklist_item',
      description:
        'Update or remove one checklist item — get its id from get_checklist first. Use this whenever the ' +
        'rider says they\'ve bought, packed, or done something on their list ("купил покрышки", "got the ' +
        'bibs", "packed the pump") to check it off (checked: true), or to rename it, move it to another ' +
        'section, change/add its link, un-check it, or delete it entirely (delete: true).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The checklist item id, from get_checklist.' },
          checked: { type: 'boolean', description: 'Mark bought/packed/done (true) or undo (false).' },
          item: { type: 'string', description: 'Rename the item text.' },
          section: { type: 'string', description: 'Move the item to a different section.' },
          link: { type: 'string', description: 'Set the item\'s product link. Pass an empty string to clear it.' },
          delete: { type: 'boolean', description: 'Set true to remove the item entirely instead of updating it.' },
        },
        required: ['id'],
      },
    },
  },
];

// --- System prompt ----------------------------------------------------------

// YYYY-MM-DD using the server's local calendar fields directly — avoids the
// classic toISOString() pitfall (which converts through UTC and can roll
// the date back or forward a day depending on the server's timezone offset,
// exactly the bug that shifted calendar_events dates before the DATE type
// parser fix in server.js). This is only used to build human-readable
// reference text for the model, but there's no reason to reintroduce that
// footgun here either.
function fmtLocalDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Pure helper for get_goals_progress's N+1 fix (S-35, docs/audit/00-AUDIT-
// AND-PLAN.md): groups one flat `goals` result set (already
// `ORDER BY meta_goal_id, priority ASC` from the caller's query) back into
// per-meta-goal arrays, exactly like a `WHERE meta_goal_id = $1
// ORDER BY priority ASC` query run once per meta-goal used to hand back.
// Pulled out as its own function (rather than inlined in the executor) so
// it's unit-testable without a database — see test/aiCoach.groupGoals.test.js.
function groupGoalsByMetaGoal(goalRows) {
  const byMetaGoal = new Map();
  for (const g of goalRows || []) {
    if (!byMetaGoal.has(g.meta_goal_id)) byMetaGoal.set(g.meta_goal_id, []);
    byMetaGoal.get(g.meta_goal_id).push(g);
  }
  return byMetaGoal;
}

// The model only ever conveys a *duration* ("45 min core workout"), never a
// real clock time — 09:00 is just an arbitrary placeholder start so that
// duration can be stored/derived via the existing start_time/end_time TIME
// columns (added for a different purpose, never populated until now)
// instead of adding a whole new duration_minutes column.
const DURATION_ANCHOR_START = '09:00:00';
function durationToTimes(minutes) {
  const total = Math.round(Number(minutes));
  if (!Number.isFinite(total) || total <= 0) return null;
  const [h, m] = DURATION_ANCHOR_START.split(':').map(Number);
  const endTotal = h * 60 + m + total;
  const pad = (n) => String(n).padStart(2, '0');
  return { start_time: DURATION_ANCHOR_START, end_time: `${pad(Math.floor(endTotal / 60) % 24)}:${pad(endTotal % 60)}:00` };
}

function mondayOf(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

/**
 * @param {object} [healthContext] - On-device Apple Health snapshot summary,
 *   forwarded transiently from the client for this one request only (see
 *   src/utils/healthService.ts buildHealthContext + coachSSE.ts). NEVER
 *   logged or persisted here or anywhere downstream — it only ever lives in
 *   the prompt string handed to the model for this single turn.
 */
function buildSystemPrompt(healthContext) {
  // Computed fresh on every call (this function is invoked per-request, not
  // cached at startup) so the model always has real ground truth for "today"
  // instead of guessing from its training cutoff — without this it was
  // scheduling calendar events on wrong/stale dates (e.g. defaulting to some
  // arbitrary date months in the past).
  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const todayISO = fmtLocalDate(today);

  // "This/next week" is one of the most common relative-date phrasings the
  // coach hears ("plan my training for next week", "what's on this week")
  // and asking the model to derive Monday/Sunday boundaries itself from
  // just todayISO is exactly the kind of off-by-a-few-days arithmetic LLMs
  // get wrong (observed in production: get_calendar came back "empty" for
  // "next week" despite events existing, because the model's own computed
  // range didn't actually cover it). Handing it precomputed boundaries
  // removes that arithmetic step entirely.
  const thisMonday = mondayOf(today);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  // Built once per request from whatever the client sent this turn — see
  // the jsdoc above. `healthContext` is never fetched or cached here, it's
  // just formatted into prompt text.
  let healthSection;
  if (healthContext && typeof healthContext === 'object') {
    const h = healthContext;
    const lines = [];
    if (h.recovery_score != null) lines.push(`- Recovery score: ${h.recovery_score}/100 (composite of HRV, resting HR, and sleep vs the rider's own recent baseline — directional, not a lab measurement)`);
    if (h.resting_hr_bpm != null) lines.push(`- Resting heart rate: ${h.resting_hr_bpm} bpm${h.resting_hr_baseline_bpm != null ? ` (14-day baseline: ${Math.round(h.resting_hr_baseline_bpm)} bpm)` : ''}`);
    if (h.hrv_ms != null) lines.push(`- HRV (SDNN): ${Math.round(h.hrv_ms)} ms${h.hrv_baseline_ms != null ? ` (14-day baseline: ${Math.round(h.hrv_baseline_ms)} ms)` : ''}`);
    if (h.sleep_hours != null) lines.push(`- Last night's sleep: ${h.sleep_hours.toFixed(1)}h${h.sleep_deep_pct != null ? `, ${Math.round(h.sleep_deep_pct)}% deep` : ''}`);
    if (h.weight_kg != null) lines.push(`- Weight: ${h.weight_kg.toFixed(1)} kg${h.weight_trend_30d_kg != null ? ` (${h.weight_trend_30d_kg >= 0 ? '+' : ''}${h.weight_trend_30d_kg.toFixed(1)} kg over 30 days)` : ''}`);
    // Deliberately NOT including h.vo2max here even though Apple Health provides it —
    // BikeLab computes its own VO2max estimate from ride data (see get_analytics_snapshot),
    // and that's the number the rider sees on the Analytics screen, so it's the one that
    // should stay consistent when the coach mentions VO2max. Call get_analytics_snapshot
    // instead if a VO2max question comes up.
    healthSection = `## Health & Recovery (from Apple Health, synced on-device)
The rider has connected Apple Health, and the numbers below are REAL, CURRENT readings already provided to you right now in this prompt — not something you need to be given, fetched, or shared manually. Current readings${h.data_freshness ? ` (as of ${h.data_freshness})` : ''}:
${lines.join('\n') || '- No metrics available yet — Health is connected but hasn\'t recorded enough data.'}
Use these directly, by name and number, when the rider asks anything readiness/fatigue/recovery-shaped ("should I ride hard today", "am I recovered", "how tired am I", "успел ли я восстановиться"). Do NOT say you don't have access to this data, do NOT say these metrics "require explicit provision by the system" or aren't "displayed to you directly", and do NOT ask the rider to share their sleep/HRV/resting-HR numbers manually — you already have them, right above. This is a common mistake: don't default to a generic "I don't have real-time device access" disclaimer just because the question is about biometric data — that disclaimer does not apply here, this data was handed to you already. Don't bring these numbers up unprompted in unrelated conversations (e.g. don't mention sleep when they ask about gear). Also call the analyze_readiness tool once in that same turn — it tells the app to show a Recovery card and a fatigue trend chart alongside your reply, so the rider sees the real numbers, not just your summary of them. Note: this Health data does NOT include VO2max — if VO2max comes up, call get_analytics_snapshot instead, which has BikeLab's own computed estimate (the same one shown on the Analytics screen).`;
  } else {
    healthSection = `## Health & Recovery
The rider has NOT connected Apple Health, so you have no recovery/sleep/HRV data for them. Only when they ask something readiness/fatigue/recovery-shaped ("should I ride hard today", "am I recovered enough for intervals", "analyze my recovery") — mention, briefly and once, that connecting Apple Health would let you factor in their real sleep, HRV, and resting heart rate, AND call the suggest_connect_apple_health tool in that same turn so the app can show a real "Connect" button (don't just describe where to find it in text — the button is more useful than instructions). Do not bring this up for unrelated questions, and do not call the tool or repeat the suggestion again later in the conversation if they don't act on it the first time.`;
  }

  return `You are BikeLab Coach — a knowledgeable, motivating cycling coach embedded in the BikeLab app.

## Today
Today's date is ${todayLabel} (${todayISO}). Always compute relative dates ("tomorrow", "next week", "in 3 days") from this — never guess or use a date from your training data. All calendar tool date arguments must be YYYY-MM-DD in or after ${todayISO} unless the user explicitly asks to log something in the past.
This week is ${fmtLocalDate(thisMonday)} to ${fmtLocalDate(thisSunday)} (Mon–Sun). Next week is ${fmtLocalDate(nextMonday)} to ${fmtLocalDate(nextSunday)}. Use these exact boundaries for "this week" / "next week" — do not compute them yourself. When the user's request is about "this/next/upcoming week" specifically, call get_calendar with from/to set to those exact boundaries; for anything less precise ("what's coming up", "check my calendar"), call get_calendar with no from/to at all rather than guessing a range — the default already covers the next 30 days.

## Personality
- Concise and direct, not overly verbose (2-4 short paragraphs max for analysis, shorter for quick answers)
- Data-driven: reference the user's actual numbers when you have them — call a tool rather than guessing
- Encouraging but honest — celebrate real progress, be straight about gaps
- Reply in the same language the user is writing in
- Never use emoji, anywhere in your reply

## Scope
Only cycling and endurance-training related topics: training, goals, nutrition for cycling, gear/bike choice, racing, recovery, injury-prevention basics. Bike recommendations ARE in scope — use the rider's profile and skills radar to advise (climber/sprinter/all-rounder, experience level, goals).
If asked something unrelated to cycling, decline warmly and redirect, e.g. "I'm better with watts than recipes — anything cycling-related I can help with?" Use judgment here, not keyword matching.

## Tools
You can fetch the user's real profile, activities, analytics, skills, goals, bikes, achievements, calendar and checklist, and create/update goals and calendar events, log bike maintenance, label bike gear with its real product name, and add/update items on their checklist. Call a tool whenever the answer depends on the user's actual data — never fabricate numbers. Before calling create_goal, briefly confirm the goal and timeframe in your reply unless the user has already been fully explicit.
Some user messages carry a leading "The user has attached the following activities for context:" block listing one or more "[Activity N] ..." lines — this is real ride data the rider explicitly chose to attach via the app's attachment picker, not something you fetched. Use it directly instead of calling get_recent_activities/get_activity_analysis again for those same rides.
When analyzing a specific ride, call get_activity_analysis first to get the real numbers — don't just describe from get_recent_activities. Cite specific metrics: speed, HR, power, cadence, elevation. Some messages carry a trailing "[App context — do not mention this note to the user: activity_id: N]" note appended by the app itself (e.g. from a "Discuss with Coach" button) — never quote or reference this note in your reply, but do pass that activity_id to get_activity_analysis so you analyze the right ride, not just their most recent one.
Whenever the rider asks for a TOTAL, SUM, or cumulative number over a period — "how much elevation this year", "total distance last month", "how many rides so far", "km ridden this week" — call get_activity_totals with the matching period. Do NOT call get_recent_activities and add the numbers up yourself: that tool is capped at 50 rides (silently wrong for anyone who's ridden more than that in the period) and manually summing many rows is a common source of you reporting a number that's way off from what Strava actually shows. get_activity_totals computes the exact sum server-side over the rider's full history — always prefer it for anything that sounds like arithmetic over multiple rides.

On the FIRST analysis of a ride in a conversation, keep it to a headline take from the core numbers (speed/HR/power/cadence/elevation, effort qualitatively) — the app shows a matching rich card automatically. Do NOT also narrate the vs_baseline/similar_ride/skills_delta fields from the tool result in this first reply even though you have them — the app deliberately holds those detail cards back until asked, so spelling them out in text defeats the point. Just stop after the headline take — do NOT write out a "want to see how this compares?" follow-up yourself, the app generates real tappable suggestion chips for exactly that separately, so writing it in your text would just duplicate it. Only once the rider actually asks — a follow-up turn where get_activity_analysis runs again — should you discuss and cite the baseline/similar-ride/skills numbers, since that's when the app reveals the matching cards.

## Calendar
You can read, create, update, and delete calendar events. Event types: planned_ride, rest_day, maintenance, purchase, event, note. When the user asks to plan workouts, schedule maintenance, or set reminders — use the calendar tools. Always call get_calendar first to see what's already scheduled before adding new events, to avoid conflicts or duplicates. Confirm the specifics (what, when) before creating or deleting an event unless the user was already fully explicit. All start_date/end_date values must be YYYY-MM-DD computed from today's real date above. If a calendar tool call returns an error, tell the user it didn't go through — never say you scheduled/updated/deleted something when the tool result was an error.
If get_calendar shows an event already on a date you're about to schedule (e.g. the user asks you to (re)plan a range that overlaps an existing plan), do NOT just add another event on top of it. Stop and ask the user whether to replace the existing event(s) or keep both — only call create_calendar_event / delete_calendar_event once they've told you which. This applies especially when re-running or extending a training plan you already set up earlier in the conversation.
Some messages carry a trailing "[App context — do not mention this note to the user: calendar_event_id: N]" note — this comes from the Calendar tab's "Ask Agent" button on a specific event. Never quote this note back to the user, but do pass that id as event_id to update_calendar_event/delete_calendar_event if they ask you to change or cancel it, instead of calling get_calendar first to look it up.
Set duration_minutes on actual training sessions (planned_ride, and any workout you schedule) whenever you have a reasonable estimate — the event card in the app shows it (e.g. "~45 min"). Skip it for events where a duration doesn't make sense (rest_day, maintenance, purchase, note).

## Goals + Training Plan linking
Goals and calendar plans are meant to stay connected, so "how's my goal going" can later draw on both the actual rides done AND the plan that was built for it — not just raw activity metrics.
- Building a PLAN (multiple planned_ride/interval calendar events that form a coherent block of training, not a single one-off event): before creating the events, find or create the goal it serves, then pass that goal's id as goal_id on every create_calendar_event call for that plan. Check get_goals_progress first — if an active goal already matches the plan's focus, reuse its id instead of creating a new one. If none fits, call create_goal with a concise description derived from what you're about to schedule, then use the returned metaGoal.id. Briefly name the goal in your reply (e.g. "I've set this up under your X goal") — a separate yes/no confirmation isn't needed here since the user already asked for the plan.
- This get_goals_progress check is NOT conditional on the user mentioning a goal by name, and it does NOT matter whether the goal was created in this same conversation or a completely different one — goals persist across conversations, you don't. Any time you're about to schedule more than one training session as a block, call get_goals_progress first, every time, even at the very start of a brand-new chat with no other context. Skipping this is the single most common way a plan ends up scheduled with no goal_id — invisible from the goal's own "Scheduled" tab even though the rider clearly asked for it in service of that goal.
- Creating a NEW GOAL via create_goal: always offer, in the same reply, to build a training plan (calendar events) for it. This one DOES need the user's yes before you call create_calendar_event — don't schedule anything until they agree. Once they do, set goal_id on every event you create for that plan.
- Don't force a goal link on one-off events that aren't really "training toward something": a single rest day, a maintenance reminder, a gear purchase, a plain note. goal_id is for actual training sessions.
- Sub-goal metrics (distance, elevation, speed, power, etc.) overlap across almost every goal — that alone is NEVER a sign of duplication, so don't treat it as one. create_goal itself never refuses to create a goal for being a possible duplicate; if its result includes a possibleDuplicate note, that's advisory only — mention the similar existing goal(s) to the user conversationally (multiple goals sharing a theme is completely normal — e.g. three separate climbing goals for three different mountains), and if the new goal's title reads generically, suggest a more specific one so the two stay easy to tell apart later (e.g. "Climbing: Alpe d'Huez" rather than a second plain "Climbing Goal").

## Goal Measurement & Lifecycle
Each sub-goal measures itself one of four ways (get_goals_progress' subGoals[].source tells you which): "activity" (a sum/avg/max/count computed from the rider's rides — distance, elevation, speed, power, cadence, HR, optionally filtered to flat/hilly/long rides or by name), "skills" (their skills radar score 0-100 — climbing/sprint/endurance/tempo/power/consistency), "health" (Apple Health — HRV/resting HR/sleep/weight, only when connected), or "coach" (qualitative — technique, confidence, habits — nothing to compute, YOU move current_value via update_goal based on what the rider tells you). All of these are just target_value/current_value/unit on the sub-goal — there's no fixed catalog of goal types anymore, so a goal can track anything trackable 0-100%, including a skill score or a qualitative habit.
The deadline lives on the meta-goal (target_date) and every sub-goal runs for exactly that window — sub-goals are metrics OF the goal, not separately-scheduled goals. Any duration works, a focused 1-2 week sprint is as valid as a 6-month build. "I need more time" = update_goal with a new target_date on the meta-goal, which moves every sub-goal with it.
When get_goals_progress returns, use these flags per goal:
- readyToComplete: true — the rider has effectively hit every sub-goal (≥98% of target). Mention it and ask if they want to mark it complete via update_goal — don't just announce it as already done, and don't call update_goal until they say yes.
- expired: true — target_date passed while still active. Note it and ask whether to extend, adjust the target, or close it.
- overachieving: true — some sub-goal is past 130% of target. Suggest raising that sub-goal's target_value (update_goal with sub_goal_id + new_target_value) so it stays a real goal, not free money.
- pace on a sub-goal (present whenever the meta-goal has a target_date): percentDelta tells you ahead/behind schedule. If clearly behind (below -20%), mention it and suggest a concrete adjustment (more volume, or extending the meta-goal's target_date) rather than just noting the number.

## Bike Maintenance
The Garage tab tracks wear on 12 fixed components (chain, cassette, chainrings, brake pads, rotors, tires, sealant, wheel bearings, bar tape, saddle, pedals, cleats) as a % health that resets whenever the rider services/replaces that part. Historically the only way to reset it was tapping "Mark as replaced" inside the app — you can now do this directly from the conversation.
- Any time the rider mentions doing maintenance — "I changed my chain", "just put new brake pads on", "swapped the cassette and chain last week", "new tires" — call log_bike_service with the matching component id(s) right away. Don't ask permission first; this is a factual log entry, not a plan change, so just do it and confirm what you logged in your reply (e.g. "Logged — chain reset from today's mileage").
- One message can cover several components at once — pass them all in the same components array rather than calling the tool multiple times.
- If the rider has more than one bike and which one isn't obvious from context, call get_bike_health first to see their bikes/ids, then either infer the right one (e.g. they only ride one bike regularly) or ask which bike before logging.
- This only resets the wear counter for parts already in the fixed 12-component list — it can't create a new custom part that isn't in that list.
- Separately, whenever the rider names an actual product for their gear — "my wheels are Hunt Carbon 45", "I run Shimano Di2", "my pedals are Favero Assioma" (power meter pedals), "tires are Conti GP5000 TR S" — call set_bike_gear_label right away, same as logging service: don't ask permission, just do it and confirm briefly. Pick "group" scope when the whole section is really one purchase (wheels: tires+sealant+wheel_bearings; drivetrain: chain+cassette+chainrings) and "component" scope for a single card in a group of otherwise-unrelated parts (contact points: bar_tape/saddle/pedals/cleats are independent products). A rider can name more than one thing in the same sentence ("wheels are Hunt, tires are Conti GP5000") — pass every entry in one call, don't call the tool twice.
- Whenever you call get_bike_health and see components still sitting under their generic names (groupLabels/componentLabels empty or missing for a group), ask the rider once — briefly, not pushy — whether they'd like to tell you the actual product names for their gear (groupset, wheels, tires, contact points, etc.), and mention that it helps you give more specific, accurate maintenance and upgrade advice. If they answer with names, call set_bike_gear_label as above. If they decline or ignore it, drop it for the rest of the conversation — don't ask again on every subsequent bike question.

## Checklist
The rider has a checklist (a shopping/packing/todo list, grouped into sections like "Shopping" and "Packing") in its own tab. Purchases and plans they mention belong there, not just in your reply: whenever the rider says they want, plan, or need to buy something (new tires, a power meter, bibs), or asks you to add/remember something, call add_checklist_items right away — same "just do it" bar as logging bike maintenance. When YOU are the one recommending a purchase, either ask briefly if they'd like it added or add it and say so in your reply — never add it silently without mentioning it. When the rider says they bought, packed, or did something on the list ("купил покрышки", "got the bibs"), call update_checklist_item to check it off rather than just acknowledging it in text. Call get_checklist before adding anything you're not sure is already there, and also before advising on gear — don't recommend buying something the rider already has listed or has already checked off as bought.

${healthSection}

## Response format
- Use markdown (bold, short lists) — the app renders it
- Cite specific numbers from tool results when analyzing performance
- Never write your own "what do you want next?" list or follow-up questions/options at the end of your reply — the app always generates real tappable suggestion chips separately after your message, so anything you write in that vein just duplicates them. End your reply once you've actually answered the question.`;
}

// --- Factory -----------------------------------------------------------------

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {{get:(k:any)=>Promise<any>}} deps.activitiesCache - async cache (lib/cache.js) of Strava activities per user
 * @param {{get:(k:any)=>Promise<any>}} deps.bikesCache - async cache (lib/cache.js) of formatted bikes per user
 * @param {()=>Array<{id:string, baseLifecycle:number}>} deps.getBikeComponents - lazy accessor for server.js's BIKE_COMPONENTS list
 */
function createCoachModule(deps) {
  const { pool, activitiesCache, bikesCache, getBikeComponents } = deps;

  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 60000, maxRetries: 2 });

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
      // Carried through so `ridePowerWatts` has BikeLab's own per-ride power
      // here too — without it every coach tool silently fell back to
      // Strava's raw watts, the exact split this helper exists to close.
      estimated_power: r.estimated_power ?? null,
    };
  }

  // Cache miss → read this user's mirrored rides straight from Postgres.
  // Deliberately NOT capped (S-35 review): the 'all_time' totals period and
  // goal progress need the full history, and this is one indexed query
  // (synced_activities(user_id, start_date)) returning slim rows — cheaper
  // than a wrong answer. Not routed through services/strava/activities.js
  // getActivities() either: its cold path triggers a Strava sync, and a
  // hidden rate-limited network call inside an LLM tool invocation is not
  // wanted here.
  async function getCachedActivities(userId) {
    const cached = await activitiesCache.get(userId);
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) return cached.data;

    try {
      const result = await pool.query(
        'SELECT * FROM synced_activities WHERE user_id = $1 ORDER BY start_date DESC',
        [userId]
      );
      if (result.rows.length > 0) return result.rows.map(mapSyncedActivityRow);
    } catch (err) {
      logger.error({ err: err.message }, '[aiCoach] Failed to read synced_activities:');
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
        // BikeLab's own per-ride power, the same number the app shows the
        // rider — not Strava's raw watts, which on a meterless ride read far
        // too low and would have the coach discussing a different number
        // than the one on screen.
        average_watts: ridePowerWatts(a),
        max_watts: a.max_watts || null,
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

      // Which HR zone (1-5) the ride's average HR falls in, using the same
      // shared zone computation as the rest of the app (T-3.1) — gives the
      // coach a consistent zone label instead of re-deriving one ad hoc.
      const avgHrZone = activity.average_heartrate
        ? zoneForHr(computeHrZones(profile), activity.average_heartrate)
        : null;

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
          avg_hr_zone: avgHrZone,
          max_hr_bpm: activity.max_heartrate || null,
          avg_cadence_rpm: activity.average_cadence || null,
          avg_watts: ridePowerWatts(activity),
          max_watts: activity.max_watts || null,
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
        // Both sides are ridePowerWatts now (the snapshot's avg_power is
        // built from it too — services/analyticsSnapshot.js), so this
        // compares like with like instead of a raw ride value against an
        // estimated baseline.
        const ridePower = ridePowerWatts(activity);
        if (ridePower && snapshot.avg_power) {
          result.vs_baseline.power_watts = {
            ride: ridePower,
            avg: round1(Number(snapshot.avg_power)),
            diff: round1(ridePower - Number(snapshot.avg_power)),
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
          avg_watts: ridePowerWatts(similar),
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
      // One query for every goal's linked calendar events rather than N+1 —
      // grouped in JS below by goal_id. Lets "how's my goal going" answer
      // with the training PLAN too (scheduled vs completed sessions), not
      // just activity-derived metric progress.
      const linkedEventsResult = await pool.query(
        `SELECT goal_id, completed, start_date FROM calendar_events WHERE user_id = $1 AND goal_id IS NOT NULL`,
        [userId]
      );
      // Needed for sub-goals whose metric.source === 'skills' (goalCalculator.js)
      // — one query for all goals, not per sub-goal.
      const skillsResult = await pool.query(
        'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
        [userId]
      );
      const skillsSnapshot = skillsResult.rows[0] || null;
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      const userProfile = profileResult.rows[0] || null;

      // S-35 (docs/audit/00-AUDIT-AND-PLAN.md): this used to be one
      // `SELECT * FROM goals WHERE meta_goal_id = $1` per meta-goal inside
      // the loop below — N+1 round trips for a rider with N meta-goals.
      // One `= ANY($1::int[])` query for every sub-goal across every
      // meta-goal instead, grouped back out by groupGoalsByMetaGoal (a pure
      // function, exported off createCoachModule for unit testing) so the
      // per-meta-goal `ORDER BY priority ASC` ordering is preserved exactly
      // like the old per-goal query gave it.
      const metaGoalIds = metaResult.rows.map((mg) => mg.id);
      const allSubGoalsResult = metaGoalIds.length
        ? await pool.query(
            'SELECT * FROM goals WHERE meta_goal_id = ANY($1::int[]) ORDER BY meta_goal_id, priority ASC',
            [metaGoalIds]
          )
        : { rows: [] };
      const subGoalsByMetaGoal = groupGoalsByMetaGoal(allSubGoalsResult.rows);

      const today = fmtLocalDate(new Date());
      const goals = [];
      for (const metaGoal of metaResult.rows) {
        const subGoalRows = subGoalsByMetaGoal.get(metaGoal.id) || [];
        const subGoals = subGoalRows.map((g) => {
          // goalCalculator (backed by @bikelab/shared's computeGoalProgress)
          // falls back to its own ported legacy goal_type switch whenever
          // g.metric is null — i.e. every goal created before this redesign
          // keeps working unmodified (T-3.4).
          const current = goalCalculator.calculateProgress(g, {
            activities,
            skillsSnapshot,
            userProfile,
          }) || 0;
          const target = Number(g.target_value) || 1;
          const pace = goalCalculator.addPaceData({ ...g, current_value: current });
          return {
            id: g.id,
            label: g.title || g.goal_type,
            source: g.metric?.source || (g.goal_type ? 'activity' : null),
            period: g.period, // legacy sliding-window fallback only — null on new goals (they use the meta-goal's window)
            start_date: g.start_date,
            end_date: g.end_date,
            current,
            target,
            percent: Math.round(Math.min((Number(current) / target) * 100, 100)),
            pace, // null unless the meta-goal has a target_date to measure against
          };
        });

        // Lifecycle flags. Threshold is 98%, not 100% — landing exactly on a
        // target is rare (a rider aiming for 400km who rides 393km has, in
        // spirit, hit the goal). This does NOT auto-close anything: the
        // coach sees the flag and raises it in conversation, closing the
        // goal via update_goal only if the rider agrees — see the Goal
        // Lifecycle guidance in buildSystemPrompt.
        const readyToComplete =
          subGoals.length > 0 &&
          subGoals.every((g) => g.current >= g.target * 0.98) &&
          metaGoal.status === 'active';
        const expired =
          !!metaGoal.target_date && new Date(metaGoal.target_date) < new Date() && metaGoal.status === 'active';
        const overachieving = subGoals.some((g) => g.current > g.target * 1.3);

        const linkedEvents = linkedEventsResult.rows.filter((e) => e.goal_id === metaGoal.id);
        goals.push({
          id: metaGoal.id,
          title: metaGoal.title,
          status: metaGoal.status,
          tier: metaGoal.tier,
          focus_tags: metaGoal.focus_tags || [],
          target_date: metaGoal.target_date,
          subGoals,
          readyToComplete,
          expired,
          overachieving,
          linkedSessions: {
            total: linkedEvents.length,
            completed: linkedEvents.filter((e) => e.completed).length,
            upcoming: linkedEvents.filter((e) => !e.completed && e.start_date >= today).length,
          },
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

      // Fed into the prompt (see aiGoals.js's existingGoalsBlock) so the
      // model doesn't propose a near-identical sub-goal under a brand new
      // meta-goal — advisory only, never blocks generation.
      const existingGoalsResult = await pool.query(
        `SELECT mg.id, mg.title, mg.focus_tags, mg.target_date,
                g.title AS sub_title, g.metric, g.target_value, g.unit
         FROM meta_goals mg
         LEFT JOIN goals g ON g.meta_goal_id = mg.id
         WHERE mg.user_id = $1 AND mg.status = 'active'
         ORDER BY mg.id`,
        [userId]
      );
      const existingGoalsMap = new Map();
      for (const row of existingGoalsResult.rows) {
        if (!existingGoalsMap.has(row.id)) {
          existingGoalsMap.set(row.id, { title: row.title, focus_tags: row.focus_tags || [], target_date: row.target_date, subGoals: [] });
        }
        if (row.sub_title) {
          existingGoalsMap.get(row.id).subGoals.push({ title: row.sub_title, metric: row.metric, target_value: row.target_value, unit: row.unit });
        }
      }
      const existingGoals = Array.from(existingGoalsMap.values());

      const aiResponse = await generateGoalsWithAI(userGoalDescription, userProfile, recentStats, trends, analysis, existingGoals, userId);

      if (aiResponse.error) {
        return { error: aiResponse.error, message: aiResponse.message };
      }

      const aiTier = aiResponse.metaGoal?.tier || aiResponse.tier;
      const tier = ['legendary', 'epic', 'grand', 'base'].includes(aiTier) ? aiTier : 'base';
      // aiGoals.js already filters this down to a validated subset of
      // FOCUS_TAGS (defaulting to ["general_fitness"] if the model returned
      // nothing usable) — no need to re-validate here.
      const focusTags = Array.isArray(aiResponse.metaGoal?.focusTags) ? aiResponse.metaGoal.focusTags : [];
      const aiContext = JSON.stringify({
        userGoal: userGoalDescription,
        trainingTypes: aiResponse.metaGoal.trainingTypes || [],
      });

      // Soft duplicate signal, NOT a hard block: sub-goal metric types
      // (distance/elevation/speed/etc) overlap across almost every goal —
      // blocking on that (the old behavior) made the coach effectively
      // refuse to ever create a second goal. focus_tags capture the goal's
      // actual THEME instead, so two genuinely distinct goals sharing a
      // theme (two different mountains, both "climbing") still both get
      // created — the model just gets told about the overlap so it can
      // mention it conversationally and help the rider give the new goal a
      // distinguishing title if they want one.
      let possibleDuplicate = null;
      if (focusTags.length > 0) {
        const existingActive = await pool.query(
          `SELECT id, title, focus_tags FROM meta_goals WHERE user_id = $1 AND status = 'active'`,
          [userId]
        );
        const overlapping = existingActive.rows
          .map((g) => ({ id: g.id, title: g.title, sharedTags: (g.focus_tags || []).filter((t) => focusTags.includes(t)) }))
          .filter((g) => g.sharedTags.length > 0);
        if (overlapping.length > 0) {
          possibleDuplicate = { existingGoals: overlapping.map(({ id, title, sharedTags }) => ({ id, title, sharedTags })) };
        }
      }

      // meta_goal + all its sub-goals must land together — a failure on
      // sub-goal N (e.g. a schema constraint the seed data didn't expect)
      // used to leave an orphaned meta_goal with zero sub-goals sitting in
      // the DB, since each pool.query() was its own auto-committed
      // statement. Wrapped in a transaction (same BEGIN/COMMIT/ROLLBACK
      // pattern as DELETE /api/account in server.js) so either the whole
      // goal is created or none of it is.
      const client = await pool.connect();
      let metaGoal;
      let createdSubGoalsCount = 0;
      try {
        await client.query('BEGIN');

        const metaGoalResult = await client.query(
          `INSERT INTO meta_goals (user_id, title, description, target_date, ai_generated, ai_context, status, tier, focus_tags)
           VALUES ($1, $2, $3, $4, true, $5, 'active', $6, $7)
           RETURNING *`,
          [
            userId,
            aiResponse.metaGoal.title,
            aiResponse.metaGoal.description,
            aiResponse.metaGoal.target_date || null,
            aiContext,
            tier,
            focusTags,
          ]
        );
        metaGoal = metaGoalResult.rows[0];

        for (const subGoal of aiResponse.subGoals || []) {
          // New goals carry `metric` (+ source, derived from metric.source)
          // instead of goal_type/period — see md/GOALS_REDESIGN_PLAN_FINAL.md.
          // goal_type/period are left NULL for these (not '4w' as before)
          // since goalCalculator.js branches on `metric IS NULL`, not on
          // goal_type/period being present — a leftover '4w' would be dead
          // data, not a real fallback. This requires `goal_type`'s original
          // NOT NULL constraint to have been dropped (see the ALTER in
          // server.js's startup block) — without that, this INSERT throws
          // for every new-style goal. No dates: the window comes from the
          // meta-goal (services/goals.js's goalWindow).
          await client.query(
            `INSERT INTO goals (
               user_id, meta_goal_id, title, description, target_value, current_value,
               unit, goal_type, period, source, metric, priority, reasoning
             ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12)`,
            [
              userId,
              metaGoal.id,
              subGoal.title,
              subGoal.description,
              subGoal.target_value || 0,
              subGoal.unit,
              subGoal.goal_type || null,
              subGoal.period || null,
              subGoal.metric?.source || null,
              subGoal.metric ? JSON.stringify(subGoal.metric) : null,
              subGoal.priority || 3,
              subGoal.reasoning || '',
            ]
          );
          createdSubGoalsCount += 1;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const result = {
        created: true,
        metaGoal: {
          id: metaGoal.id,
          title: metaGoal.title,
          description: metaGoal.description,
          tier: metaGoal.tier,
          target_date: metaGoal.target_date,
          focus_tags: metaGoal.focus_tags,
        },
        subGoalsCount: createdSubGoalsCount,
      };
      if (possibleDuplicate) {
        result.possibleDuplicate = possibleDuplicate;
        result.note =
          `Heads up: the rider already has ${possibleDuplicate.existingGoals.length > 1 ? 'other active goals' : 'another active goal'} ` +
          `sharing a theme with this one — ${possibleDuplicate.existingGoals.map((g) => `"${g.title}" (id ${g.id}, shared: ${g.sharedTags.join(', ')})`).join('; ')}. ` +
          `This is NOT necessarily a problem (e.g. two climbing goals for two different peaks are both valid) — the new goal was created regardless. ` +
          `Just mention the similar existing goal(s) to the rider conversationally, and if the new goal's title is generic, consider suggesting a more ` +
          `specific one so the two stay easy to tell apart.`;
      }
      return result;
    },

    async update_goal(args, { userId }) {
      const { goal_id, status, target_date, sub_goal_id, current_value, new_target_value } = args || {};
      if (!goal_id) throw new Error('goal_id is required');

      const result = { updated: true };

      // Sub-goal level update — verifies the sub-goal actually belongs to
      // this meta_goal + user before touching it (goal_id is meta_goals.id,
      // sub_goal_id is goals.id; joining through meta_goal_id + user_id
      // prevents one user's coach session from editing another's row).
      if (sub_goal_id) {
        const sets = [];
        const values = [];
        let i = 1;
        if (current_value != null) {
          sets.push(`current_value = $${i++}`);
          values.push(current_value);
        }
        if (new_target_value != null) {
          sets.push(`target_value = $${i++}`);
          values.push(new_target_value);
        }
        if (sets.length === 0) throw new Error('Nothing to update on the sub-goal — provide current_value and/or new_target_value');
        sets.push(`updated_at = NOW()`);

        values.push(sub_goal_id, goal_id, userId);
        const subResult = await pool.query(
          `UPDATE goals SET ${sets.join(', ')}
           WHERE id = $${i++} AND meta_goal_id = $${i++} AND user_id = $${i}
           RETURNING *`,
          values
        );
        if (subResult.rows.length === 0) return { error: 'not_found', message: 'Sub-goal not found' };
        result.subGoal = subResult.rows[0];
      }

      // Meta-goal level update — independent of the sub-goal block above, a
      // single call can do both (e.g. bump a sub-goal's current_value AND
      // mark the whole meta-goal completed in one turn).
      if (status || target_date) {
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
        values.push(goal_id, userId);
        const metaResult = await pool.query(
          `UPDATE meta_goals SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
          values
        );
        if (metaResult.rows.length === 0) return { error: 'not_found', message: 'Goal not found' };
        result.metaGoal = metaResult.rows[0];
      }

      if (!result.subGoal && !result.metaGoal) {
        throw new Error('Nothing to update — provide status/target_date for the meta-goal and/or sub_goal_id with current_value/new_target_value');
      }
      return result;
    },

    async get_training_recommendations(args, { userId }) {
      if (args?.goal_id) {
        return await getGoalSpecificRecommendations(pool, userId, args.goal_id);
      }
      return { trainingTypes: getAllTrainingTypes() };
    },

    async get_bike_health(args, { userId }) {
      const cached = await bikesCache.get(userId);
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
          logger.error({ err: err.message }, '[aiCoach] Failed to read synced_bikes:');
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

    async log_bike_service(args, { userId }) {
      const validIds = (getBikeComponents ? getBikeComponents() : []).map((c) => c.id);
      const requested = Array.isArray(args?.components) ? args.components : [];
      const components = [...new Set(requested.filter((c) => validIds.includes(c)))];

      if (components.length === 0) {
        return {
          success: false,
          note: `No valid component ids given — valid ids are: ${validIds.join(', ')}. Map the rider's wording to one of these before calling again.`,
        };
      }

      // Same three-tier bike lookup as get_bike_health.
      const cached = await bikesCache.get(userId);
      let bikes = cached && Array.isArray(cached.data) ? cached.data : [];
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
          logger.error({ err: err.message }, '[aiCoach] Failed to read synced_bikes:');
        }
      }

      if (bikes.length === 0) {
        return {
          success: false,
          note: 'No bike data available right now — ask the user to open the Garage tab once to sync from Strava, then try again.',
        };
      }

      let bike = args?.bike_id ? bikes.find((b) => String(b.id) === String(args.bike_id)) : null;
      if (!bike) bike = bikes.find((b) => b.primary) || bikes[0];

      const currentKm = bike.distanceKm || 0;

      // Same insert the in-app "Mark as replaced" button does (see
      // POST /api/bikes/:bikeId/components/:component/reset in server.js),
      // just tagged source='chat' instead of 'manual' and wrapped in a
      // transaction since a single message can service several components
      // at once ("changed the chain and cassette").
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const component of components) {
          await client.query(
            'INSERT INTO bike_component_resets (user_id, bike_id, component, reset_km, source) VALUES ($1, $2, $3, $4, $5)',
            [userId, bike.id, component, currentKm, 'chat']
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      return {
        success: true,
        bike: { id: bike.id, name: bike.name, brand_name: bike.brand_name, model_name: bike.model_name },
        components,
        resetKm: currentKm,
      };
    },

    async set_bike_gear_label(args, { userId }) {
      // Keep this list in sync with BikeGarageScreen.tsx's `group` array
      // (drivetrain/brakes/wheels/contact) — groups are a pure display
      // concept that only exists client-side, there's no server-side
      // BIKE_GROUPS constant to import the way BIKE_COMPONENTS is.
      const validGroupKeys = ['drivetrain', 'brakes', 'wheels', 'contact'];
      const validComponentIds = (getBikeComponents ? getBikeComponents() : []).map((c) => c.id);

      const requested = Array.isArray(args?.labels) ? args.labels : [];
      const clean = requested
        .filter((l) => l && typeof l.custom_name === 'string' && l.custom_name.trim())
        .filter((l) =>
          l.target_type === 'group' ? validGroupKeys.includes(l.target_key)
          : l.target_type === 'component' ? validComponentIds.includes(l.target_key)
          : false
        )
        .map((l) => ({ target_type: l.target_type, target_key: l.target_key, custom_name: l.custom_name.trim().slice(0, 64) }));

      if (clean.length === 0) {
        return {
          success: false,
          note: `No valid labels given. Valid group keys: ${validGroupKeys.join(', ')}. Valid component ids: ${validComponentIds.join(', ')}.`,
        };
      }

      // Same three-tier bike lookup as get_bike_health/log_bike_service.
      const cached = await bikesCache.get(userId);
      let bikes = cached && Array.isArray(cached.data) ? cached.data : [];
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
          logger.error({ err: err.message }, '[aiCoach] Failed to read synced_bikes:');
        }
      }

      if (bikes.length === 0) {
        return {
          success: false,
          note: 'No bike data available right now — ask the user to open the Garage tab once to sync from Strava, then try again.',
        };
      }

      let bike = args?.bike_id ? bikes.find((b) => String(b.id) === String(args.bike_id)) : null;
      if (!bike) bike = bikes.find((b) => b.primary) || bikes[0];

      for (const l of clean) {
        await pool.query(
          `INSERT INTO bike_component_labels (user_id, bike_id, target_type, target_key, custom_name, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, bike_id, target_type, target_key)
           DO UPDATE SET custom_name = EXCLUDED.custom_name, updated_at = NOW()`,
          [userId, bike.id, l.target_type, l.target_key, l.custom_name]
        );
      }

      return {
        success: true,
        bike: { id: bike.id, name: bike.name, brand_name: bike.brand_name, model_name: bike.model_name },
        labels: clean,
      };
    },

    async get_achievements(args, { userId }) {
      const achievements = await getUserAchievements(pool, userId);
      return { achievements };
    },

    async get_checklist(args, { userId }) {
      const rows = await checklistRepo.listItems(userId);
      const sections = {};
      for (const r of rows) {
        if (!sections[r.section]) sections[r.section] = [];
        sections[r.section].push({ id: r.id, item: r.item, checked: !!r.checked, link: r.link ?? null });
      }
      return { sections };
    },

    async add_checklist_items(args, { userId }) {
      const section = (args?.section && String(args.section).trim()) || 'Shopping';
      const requested = Array.isArray(args?.items) ? args.items : [];
      const added = [];
      for (const entry of requested) {
        const item = entry?.item && String(entry.item).trim();
        if (!item) continue;
        const link = entry?.link ? String(entry.link).trim() : null;
        const row = await checklistRepo.createItem(userId, { section, item, link });
        added.push({ id: row.id, section: row.section, item: row.item, link: row.link ?? null });
      }
      if (added.length === 0) return { added: [], note: 'No valid items given — each item needs non-empty text.' };
      return { added, section };
    },

    // id comes from get_checklist. `delete: true` removes the item instead
    // of updating it; every other field is passed straight to the same
    // partial-update service the PUT /api/checklist/:id route uses, so the
    // validation (at least one field, ownership scoping) stays in one place.
    async update_checklist_item(args, { userId }) {
      const id = args?.id;
      if (id == null) return { error: 'id is required — call get_checklist first to find it.' };

      if (args?.delete) {
        const row = await checklistRepo.deleteItem(id, userId);
        if (!row) return { error: 'not_found', message: 'Checklist item not found.' };
        return { deleted: true, id: row.id };
      }

      const patch = {};
      if (args?.checked !== undefined) patch.checked = args.checked;
      if (args?.item !== undefined) patch.item = args.item;
      if (args?.section !== undefined) patch.section = args.section;
      // '' is the model's way of clearing the link (tool schema has no
      // separate null type — see the tool description).
      if (args?.link !== undefined) patch.link = args.link === '' ? null : args.link;

      const row = await checklistService.updateItem(id, userId, patch);
      if (!row) return { error: 'not_found', message: 'Checklist item not found.' };
      return { id: row.id, section: row.section, item: row.item, checked: !!row.checked, link: row.link ?? null };
    },

    async get_calendar(args, { userId }) {
      const from = args?.from || new Date().toISOString().split('T')[0];
      const to = args?.to || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      const events = await pool.query(
        `SELECT ce.id, ce.type, ce.title, ce.description, ce.location, ce.start_date, ce.end_date, ce.all_day,
                ce.completed, ce.source, ce.goal_id, mg.title AS goal_title
         FROM calendar_events ce
         LEFT JOIN meta_goals mg ON mg.id = ce.goal_id
         WHERE ce.user_id = $1 AND ce.start_date >= $2 AND ce.start_date <= $3
         ORDER BY ce.start_date ASC`,
        [userId, from, to]
      );

      // Past Strava activities in the same range, so the model sees what
      // actually happened alongside what's planned without a second turn.
      const activities = await pool.query(
        // synced_activities has no "id" column — it's keyed on
        // (user_id, strava_id) — selecting "id" here threw "column does
        // not exist" on every call, which is why get_calendar always
        // failed and the model could never see existing events to avoid
        // duplicating them.
        `SELECT strava_id AS id, name, type, start_date, distance, moving_time, total_elevation_gain, average_heartrate
         FROM synced_activities
         WHERE user_id = $1 AND start_date::date >= $2 AND start_date::date <= $3
         ORDER BY start_date ASC`,
        [userId, from, to]
      );

      return { events: events.rows, activities: activities.rows };
    },

    async create_calendar_event(args, { userId, conversationId }) {
      const { type, title, description, start_date, end_date, location, goal_id, duration_minutes } = args || {};
      if (!title || !start_date) return { error: 'title and start_date are required' };
      // Confirm the goal actually belongs to this user before linking — a
      // stale or hallucinated id would otherwise silently attach the event
      // to nothing (FK ON DELETE SET NULL) or, if IDs were ever shared
      // across users, someone else's goal.
      let goalTitle = null;
      if (goal_id != null) {
        const goalCheck = await pool.query('SELECT title FROM meta_goals WHERE id = $1 AND user_id = $2', [goal_id, userId]);
        if (goalCheck.rows.length === 0) {
          return { error: `goal_id ${goal_id} not found. Call get_goals_progress or create_goal first to get a valid id.` };
        }
        goalTitle = goalCheck.rows[0].title;
      }
      // Catch malformed dates here with a clear message the model can react
      // to, instead of letting a raw Postgres "invalid input syntax" error
      // bubble up — before this, a bad date silently produced no row while
      // the model sometimes still told the user it scheduled the event.
      if (!ISO_DATE_RE.test(start_date)) {
        return { error: `start_date must be in YYYY-MM-DD format, got "${start_date}"` };
      }
      if (!isPlausibleEventDate(start_date)) {
        return {
          error: `start_date "${start_date}" looks wrong (too far in the past or future). ` +
            `Re-check today's real date from the system prompt and recompute.`,
        };
      }
      if (end_date) {
        if (!ISO_DATE_RE.test(end_date)) {
          return { error: `end_date must be in YYYY-MM-DD format, got "${end_date}"` };
        }
        if (!isPlausibleEventDate(end_date)) {
          return {
            error: `end_date "${end_date}" looks wrong (too far in the past or future). ` +
              `Re-check today's real date from the system prompt and recompute.`,
          };
        }
      }
      const eventType = ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'].includes(type)
        ? type
        : 'planned_ride';
      const times = duration_minutes != null ? durationToTimes(duration_minutes) : null;
      const result = await pool.query(
        `INSERT INTO calendar_events
           (user_id, type, title, description, start_date, end_date, location, source, coach_conversation_id, goal_id, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'coach', $8, $9, $10, $11)
         RETURNING *`,
        [
          userId, eventType, title, description || null, start_date, end_date || null, location || null,
          conversationId || null, goal_id || null, times?.start_time || null, times?.end_time || null,
        ]
      );
      // goal_title riding along on the returned event lets the app's
      // "Added to Calendar" chat card show which goal this session supports
      // without a second lookup.
      return { event: { ...result.rows[0], goal_title: goalTitle } };
    },

    async update_calendar_event(args, { userId }) {
      const { event_id, ...fields } = args || {};
      if (!event_id) return { error: 'event_id is required' };
      if (fields.start_date) {
        if (!ISO_DATE_RE.test(fields.start_date)) {
          return { error: `start_date must be in YYYY-MM-DD format, got "${fields.start_date}"` };
        }
        if (!isPlausibleEventDate(fields.start_date)) {
          return {
            error: `start_date "${fields.start_date}" looks wrong (too far in the past or future). ` +
              `Re-check today's real date from the system prompt and recompute.`,
          };
        }
      }
      if (fields.end_date) {
        if (!ISO_DATE_RE.test(fields.end_date)) {
          return { error: `end_date must be in YYYY-MM-DD format, got "${fields.end_date}"` };
        }
        if (!isPlausibleEventDate(fields.end_date)) {
          return {
            error: `end_date "${fields.end_date}" looks wrong (too far in the past or future). ` +
              `Re-check today's real date from the system prompt and recompute.`,
          };
        }
      }
      // fields.goal_id === null is a deliberate unlink and must go through;
      // only a genuinely non-null value needs the ownership check below.
      if (fields.goal_id != null) {
        const goalCheck = await pool.query('SELECT id FROM meta_goals WHERE id = $1 AND user_id = $2', [fields.goal_id, userId]);
        if (goalCheck.rows.length === 0) {
          return { error: `goal_id ${fields.goal_id} not found. Call get_goals_progress or create_goal first to get a valid id.` };
        }
      }
      // duration_minutes isn't a real column — translate it into the
      // start_time/end_time pair the same way create_calendar_event does.
      if (fields.duration_minutes !== undefined) {
        const times = durationToTimes(fields.duration_minutes);
        if (times) {
          fields.start_time = times.start_time;
          fields.end_time = times.end_time;
        }
        delete fields.duration_minutes;
      }
      const allowed = ['title', 'description', 'start_date', 'end_date', 'type', 'completed', 'location', 'goal_id', 'start_time', 'end_time'];
      const sets = [];
      const values = [event_id, userId];
      let i = 3;
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          sets.push(`${key} = $${i}`);
          values.push(fields[key]);
          i++;
        }
      }
      if (sets.length === 0) return { error: 'No fields to update' };
      sets.push('updated_at = NOW()');
      const result = await pool.query(
        `UPDATE calendar_events SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
        values
      );
      if (result.rows.length === 0) return { error: 'Event not found' };
      const updated = result.rows[0];
      // Same goal_title convenience as create_calendar_event's return value.
      let goalTitle = null;
      if (updated.goal_id != null) {
        const goalRow = await pool.query('SELECT title FROM meta_goals WHERE id = $1', [updated.goal_id]);
        goalTitle = goalRow.rows[0]?.title || null;
      }
      return { event: { ...updated, goal_title: goalTitle } };
    },

    async delete_calendar_event(args, { userId }) {
      const result = await pool.query(
        'DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 RETURNING id, migrated_from_ride_id',
        [args?.event_id, userId]
      );
      if (result.rows.length === 0) return { error: 'Event not found' };
      // See the matching comment on DELETE /api/calendar/:id in server.js —
      // events backfilled from `rides` need their source row dropped too,
      // or the startup migration resurrects them on next restart.
      const migratedRideId = result.rows[0].migrated_from_ride_id;
      if (migratedRideId) {
        try {
          await pool.query('DELETE FROM rides WHERE id = $1 AND user_id = $2', [migratedRideId, userId]);
        } catch (e) {
          logger.error({ err: e.message }, '[calendar] Failed to delete source rides row:');
        }
      }
      return { deleted: true };
    },

    // Pure signal, nothing to fetch — server.js detects this call by name
    // and turns it into a deterministic "Connect Apple Health" suggestion
    // chip (see the suggestedConnectHealth flag there). The return value
    // itself is never surfaced to the rider.
    async suggest_connect_apple_health() {
      return { ok: true };
    },

    // Pure signal again, deliberately — NOT an echo of healthContext. Every
    // tool_call result (including this one) gets persisted verbatim into
    // coach_messages.tool_calls (see the INSERT near the end of
    // /api/coach/chat), and health data must never touch Postgres. So the
    // client renders RecoveryCard from its OWN local health snapshot (the
    // same object it already sent up this request, via useHealthData()) —
    // this result only needs to signal THAT the model called the tool, not
    // carry any of the actual numbers back.
    async analyze_readiness(args, { healthContext }) {
      return { connected: !!healthContext };
    },

    // Oura is cached in Postgres (unlike Apple Health's healthContext,
    // which deliberately never touches the DB — see analyze_readiness
    // above) because its OAuth tokens have to live server-side anyway to
    // be refreshed. So this reads oura_daily_data directly instead of
    // threading anything through ctx.healthContext.
    async get_oura_readiness(args, { userId }) {
      const days = Math.min(Math.max(parseInt(args?.days, 10) || 7, 1), 30);
      const fetchCached = () => pool.query(
        `SELECT day, readiness_score, sleep_score, activity_score, total_sleep_hours, average_hrv, resting_heart_rate, min_heart_rate,
                stress_high_seconds, stress_recovery_high_seconds, stress_day_summary,
                resilience_level, resilience_sleep_recovery, resilience_daytime_recovery, resilience_stress,
                spo2_average, breathing_disturbance_index
         FROM oura_daily_data WHERE user_id = $1 ORDER BY day DESC LIMIT $2`,
        [userId, days]
      );
      try {
        let result = await fetchCached();

        // Lazy refresh: there's no background job or app-side auto-sync
        // keeping this table current (the rider has to open the Oura tab
        // and tap Refresh — see OuraIntegrationScreen.tsx), so before
        // answering a question that hinges on TODAY's recovery, pull a
        // fresh window straight from Oura if the cache looks stale.
        // fetchAndCacheOuraData is a safe no-op ({synced:0}) when the
        // rider hasn't connected Oura at all.
        const latestCachedDay = result.rows[0]?.day
          ? new Date(result.rows[0].day).toISOString().slice(0, 10)
          : null;
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const isStale = !latestCachedDay || latestCachedDay < yesterday;

        if (isStale) {
          try {
            const end = new Date();
            const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
            const fmt = (d) => d.toISOString().slice(0, 10);
            await ouraService.fetchAndCacheOuraData(pool, userId, { startDate: fmt(start), endDate: fmt(end) });
            result = await fetchCached();
          } catch (refreshErr) {
            logger.error({ err: refreshErr.response?.data || refreshErr.message }, '[aiCoach] Oura lazy refresh failed, serving cached data:');
          }
        }

        if (result.rows.length === 0) {
          return {
            days: [],
            note: 'No Oura data available yet — ask the rider to open the Oura tab and tap Connect, or tap Refresh if already connected.',
          };
        }
        const round1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);
        return {
          days: result.rows.map((r) => ({
            day: r.day,
            readiness_score: r.readiness_score,
            sleep_score: r.sleep_score,
            activity_score: r.activity_score,
            total_sleep_hours: round1(r.total_sleep_hours),
            average_hrv_ms: round1(r.average_hrv),
            resting_heart_rate_bpm: round1(r.resting_heart_rate),
            min_heart_rate_bpm: round1(r.min_heart_rate),
            stress_high_minutes: r.stress_high_seconds != null ? Math.round(r.stress_high_seconds / 60) : null,
            stress_recovery_minutes: r.stress_recovery_high_seconds != null ? Math.round(r.stress_recovery_high_seconds / 60) : null,
            stress_day_summary: r.stress_day_summary,
            resilience_level: r.resilience_level,
            spo2_average_percent: round1(r.spo2_average),
          })),
        };
      } catch (err) {
        logger.error({ err: err.message }, '[aiCoach] get_oura_readiness failed:');
        return { days: [], note: 'Could not load Oura data right now.' };
      }
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
// Exposed for unit testing only (test/aiCoach.groupGoals.test.js) — does not
// change createCoachModule's own call signature or return shape.
module.exports.groupGoalsByMetaGoal = groupGoalsByMetaGoal;
