#!/usr/bin/env node
// Side-by-side coach benchmark: runs the SAME scenarios through the real coach
// module (system prompt, tools, tool execution against the configured DB) for
// several model/effort configurations and writes a JSON report with every
// transcript, the tools each model called, token usage (incl. hidden reasoning
// tokens), latency and estimated cost. Written for the 06.10.2026 model
// decision (gpt-6-luna vs gpt-5.4-mini after the Responses API move).
//
// Read-only by construction: tools that WRITE (goals, calendar, checklist,
// memory, profile, bike service) are not executed — the model gets a
// `{simulated: true}` result back and the call is still recorded, so we see
// whether it would have called the right tool with the right arguments.
//
// Usage (from server/, reads server/.env):
//   node scripts/bench-coach.js --strava-id 40612950 \
//     --configs gpt-6-luna:low,gpt-6-luna:medium,gpt-5.4-mini:medium,gpt-4.1-mini:none \
//     --out ../bench-coach.json [--scenarios ride,readiness,feasibility,plan,season,power,complete] [--repeat 1]
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const coachService = require('../services/coach');
const { expandPlanSessions, mondayOfISO } = require('../aiCoach');
const llm = require('../lib/openaiResponses');
const { forcedToolChoice } = require('../lib/coachIntents');

// $ per 1M tokens: input / cached input / output (OpenAI list prices, 10/2026).
const PRICES = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-5-nano': { input: 0.05, cached: 0.005, output: 0.4 },
};

const WRITE_TOOLS = new Set([
  'create_goal', 'update_goal', 'complete_goal', 'delete_goal', 'create_calendar_event', 'schedule_training_plan',
  'update_calendar_event', 'delete_calendar_event', 'log_bike_service', 'set_bike_gear_label', 'add_checklist_items',
  'update_checklist_item', 'remember_about_rider', 'forget_about_rider', 'update_rider_profile',
]);

// The id a simulated create_goal answers with — no such goal exists.
const SIMULATED_GOAL_ID = 900001;
const SEASON_WEEKS = 18;
// How far ahead the season scenario's event lies: the plan's first week then
// starts about five months from today.
const SEASON_EVENT_WEEKS_AHEAD = 40;
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ruDate = (d) => `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** The season scenario's turns for a run started on `today`: a Sunday event and the Monday its 18-week plan starts. */
function seasonTurns(today) {
  const event = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + SEASON_EVENT_WEEKS_AHEAD * 7));
  event.setUTCDate(event.getUTCDate() + ((7 - event.getUTCDay()) % 7));
  const week1 = new Date(event);
  week1.setUTCDate(event.getUTCDate() - (SEASON_WEEKS * 7 - 1));
  return [
    `Новая отдельная цель, не связанная с тем, что уже есть в моих целях и календаре: ${ruDate(event)} еду марафон 200 км с набором 3500 м. ` +
      `Готовиться начну ${ruDate(week1)}, это ${SEASON_WEEKS} недель. Три тренировки в неделю, около 6 часов. Составь план по неделям.`,
    'Отлично. Создай под это цель и занеси весь план в календарь, до последней недели.',
  ];
}

/** Which of the season plan's weeks the schedule_training_plan calls of a scenario covered. */
function planWeeksCovered(turns) {
  const covered = new Set();
  for (const turn of turns) {
    for (const call of turn.calls) {
      // A refused call (resultPreview starts with its error) put nothing in.
      if (call.name !== 'schedule_training_plan' || call.resultPreview.startsWith('{"error"')) continue;
      for (const session of call.args.sessions || []) for (const week of session.weeks || []) covered.add(week);
    }
  }
  const missing = Array.from({ length: SEASON_WEEKS }, (_, i) => i + 1).filter((week) => !covered.has(week));
  // What it took, not only how far: the tool refuses a session without
  // blocks (the first run that reached week 18 sent all 54 without them),
  // and the race day belongs in the calendar as an event of its own.
  const planCalls = turns.flatMap((turn) => turn.calls.filter((call) => call.name === 'schedule_training_plan'));
  const refusedCalls = planCalls.filter((call) => call.resultPreview.startsWith('{"error"')).length;
  const sessions = planCalls.filter((call) => !call.resultPreview.startsWith('{"error"')).flatMap((call) => call.args.sessions || []);
  const raceAsEvent = turns.some((turn) => turn.calls.some((call) => call.name === 'create_calendar_event' && call.args.type === 'event'));
  return { covered: SEASON_WEEKS - missing.length, of: SEASON_WEEKS, missing, sessions: sessions.length, refusedCalls, raceAsEvent };
}

// Each scenario is a short conversation; later turns build on the model's own
// earlier replies, like a real chat. `expectTools` is what a good coach would
// call at least once over the scenario (scored, not enforced).
const SCENARIOS = {
  ride: {
    turns: ['Analyze my last ride'],
    expectTools: ['get_activity_analysis'],
  },
  readiness: {
    turns: ['Проверь мою готовность к тренировкам — стоит ли сегодня делать интервалы?'],
    expectTools: ['analyze_readiness'],
  },
  power: {
    turns: ['What is my FTP based on my rides, and what power zones should I set in Garmin?'],
    expectTools: ['get_power_profile'],
  },
  plan: {
    turns: [
      'I want to prepare for a 120 km gran fondo with 2000 m of climbing in 8 weeks. Look at my current form, my goals and my calendar and build me a week-by-week plan.',
      'Looks good. Put the first two weeks into my calendar and create the goal.',
    ],
    expectTools: ['get_analytics_snapshot', 'get_recent_activities', 'get_calendar', 'create_goal', 'create_calendar_event'],
  },
  // A season-long plan and "put all of it in": scored by how many of its
  // SEASON_WEEKS weeks the schedule_training_plan calls cover (planWeeks in
  // the report). The event is a new goal of its own, dated past anything the
  // rider is likely to have planned already — on an account that had a plan
  // for the same kind of event in the calendar the coach rightly asked which
  // race was meant and scheduled nothing (owner's run, 19.11.2026).
  season: {
    turns: seasonTurns,
    expectTools: ['get_goals_progress', 'create_goal', 'schedule_training_plan'],
  },
  feasibility: {
    turns: ['Стоит мне завтра ехать 160 км с набором 3000 м?'],
    expectTools: ['assess_ride_feasibility'],
  },
  complete: {
    turns: ['I rode the full Lake Garda loop on October 3rd — close my Garda Lake Cycling Challenge goal with that ride.'],
    expectTools: ['get_recent_activities', 'complete_goal'],
  },
};

function parseArgs(argv) {
  const args = { configs: 'gpt-6-luna:low,gpt-6-luna:medium,gpt-5.4-mini:medium,gpt-4.1-mini:none', scenarios: Object.keys(SCENARIOS).join(','), repeat: 1, out: 'bench-coach.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strava-id') args.stravaId = argv[++i];
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--configs') args.configs = argv[++i];
    else if (a === '--scenarios') args.scenarios = argv[++i];
    else if (a === '--repeat') args.repeat = Number(argv[++i]) || 1;
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function cost(model, u) {
  const p = PRICES[model];
  if (!p || !u) return null;
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  const fresh = Math.max(0, (u.prompt_tokens || 0) - cached);
  return (fresh * p.input + cached * p.cached + (u.completion_tokens || 0) * p.output) / 1e6;
}

// One scenario turn through the same loop routes/coach.js runs (minus SSE and
// persistence): model round → execute tool calls → feed outputs back → repeat.
async function runTurn({ coach, model, effort, instructions, input, userId, firstRoundToolChoice, log }) {
  const tools = coach.TOOLS;
  const calls = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cached_tokens: 0 };
  let text = '';
  const started = Date.now();
  let firstTokenMs = null;
  for (let round = 0; round < 10; round++) {
    const roundCalls = [];
    const reasoning = [];
    let roundText = '';
    for await (const ev of llm.streamTurn({
      model,
      effort: effort === 'none' ? undefined : effort,
      instructions,
      input,
      tools,
      toolChoice: round === 0 ? firstRoundToolChoice : 'auto',
      cacheKey: `bench-${userId}`,
      maxOutputTokens: 8000,
    })) {
      if (ev.type === 'text') {
        if (firstTokenMs === null) firstTokenMs = Date.now() - started;
        roundText += ev.delta;
      } else if (ev.type === 'tool_call') roundCalls.push(ev);
      else if (ev.type === 'reasoning') reasoning.push(ev.item);
      else if (ev.type === 'usage') {
        usage.prompt_tokens += ev.usage.prompt_tokens;
        usage.completion_tokens += ev.usage.completion_tokens;
        usage.cached_tokens += ev.usage.prompt_tokens_details?.cached_tokens || 0;
        usage.reasoning_tokens += ev.usage.completion_tokens_details?.reasoning_tokens || 0;
      }
    }
    text += roundText;
    if (roundCalls.length === 0) break;
    input.push(...llm.toolRoundItems({ text: roundText, reasoning, calls: roundCalls }));
    for (const tc of roundCalls) {
      let args;
      try { args = JSON.parse(tc.argumentsJson || '{}'); } catch { args = { _unparsable: tc.argumentsJson }; }
      let result;
      if (tc.name === 'schedule_training_plan') {
        // Not executed either, but checked the way the real tool checks its
        // sessions and answered with the weeks the call covered: the coach
        // decides from that whether the plan is all in.
        const expanded = Array.isArray(args.sessions) && typeof args.week1_start === 'string'
          ? expandPlanSessions(args.sessions, mondayOfISO(args.week1_start))
          : { error: 'sessions and week1_start are required' };
        if (expanded.error) {
          result = { error: `${expanded.error}. Nothing was scheduled — fix it and call schedule_training_plan again.` };
        } else {
          const weeks = expanded.rows.map((row) => row.week);
          result = { simulated: true, scheduled: expanded.rows.length, weeks: { from: Math.min(...weeks), to: Math.max(...weeks) } };
        }
      } else if (tc.name === 'create_goal') {
        // Not executed, but answered with an id: a plan is scheduled under
        // its goal, and without one the coach has nothing to pass on.
        result = { simulated: true, metaGoal: { id: SIMULATED_GOAL_ID, title: 'Benchmark goal' }, subGoals: [] };
      } else if (WRITE_TOOLS.has(tc.name)) {
        result = { simulated: true, note: 'benchmark: write tools are not executed' };
      } else {
        try { result = await coach.executeTool(tc.name, args, { userId, conversationId: null, healthContext: null }); }
        catch (err) { result = { error: err.message }; }
      }
      calls.push({ round, name: tc.name, args, simulated: WRITE_TOOLS.has(tc.name), resultPreview: JSON.stringify(result).slice(0, 300) });
      input.push(llm.toolOutputItem(tc.id, result));
      log(`      ↳ ${tc.name}(${JSON.stringify(args).slice(0, 120)})${WRITE_TOOLS.has(tc.name) ? ' [simulated]' : ''}`);
    }
  }
  input.push({ role: 'assistant', content: text });
  return { text, calls, usage, latencyMs: Date.now() - started, firstTokenMs };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.stravaId && !args.email) {
    console.error('Usage: node scripts/bench-coach.js (--strava-id <id> | --email <addr>) [--configs m:e,…] [--scenarios …] [--repeat N] [--out file]');
    process.exit(2);
  }
  const userRow = args.stravaId
    ? await pool.query('SELECT id FROM users WHERE strava_id = $1', [args.stravaId])
    : await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [args.email]);
  const userId = userRow.rows[0]?.id;
  if (!userId) { console.error('User not found'); process.exit(1); }

  const coach = coachService.coach || coachService;
  const instructions = await coach.buildSystemPrompt(null, userId);
  const configs = args.configs.split(',').map((c) => { const [model, effort = 'none'] = c.split(':'); return { model, effort }; });
  const scenarioNames = args.scenarios.split(',').filter((s) => SCENARIOS[s]);
  const log = (m) => console.log(m);
  const report = { ranAt: new Date().toISOString(), userId, promptChars: instructions.length, configs, results: [] };

  for (const cfg of configs) {
    for (const name of scenarioNames) {
      for (let rep = 0; rep < args.repeat; rep++) {
        const sc = SCENARIOS[name];
        log(`\n=== ${cfg.model} / ${cfg.effort} · ${name}${args.repeat > 1 ? ` #${rep + 1}` : ''}`);
        const input = [];
        const turns = [];
        let failed = null;
        const userTurns = typeof sc.turns === 'function' ? sc.turns(new Date()) : sc.turns;
        for (const userText of userTurns) {
          input.push({ role: 'user', content: userText });
          log(`   user: ${userText}`);
          try {
            const t = await runTurn({ coach, model: cfg.model, effort: cfg.effort, instructions, input, userId, firstRoundToolChoice: forcedToolChoice(userText), log });
            turns.push({ user: userText, ...t, cost: cost(cfg.model, t.usage) });
            log(`   coach (${t.latencyMs} ms, ${t.usage.completion_tokens} out / ${t.usage.reasoning_tokens} reasoning): ${t.text.slice(0, 160).replace(/\n/g, ' ')}…`);
          } catch (err) {
            failed = err.message;
            log(`   ✖ ${err.message}`);
            break;
          }
        }
        const called = new Set(turns.flatMap((t) => t.calls.map((c) => c.name)));
        if (name === 'season') {
          const plan = planWeeksCovered(turns);
          log(`   plan in the calendar: weeks ${plan.covered}/${plan.of}${plan.missing.length ? `, missing ${plan.missing.join(', ')}` : ''} · ${plan.sessions} sessions, ${plan.refusedCalls} refused call(s) · race as an event: ${plan.raceAsEvent ? 'yes' : 'no'}`);
        }
        report.results.push({
          model: cfg.model, effort: cfg.effort, scenario: name, repeat: rep,
          failed,
          expectedToolsHit: sc.expectTools.filter((t) => called.has(t)),
          expectedToolsMissed: sc.expectTools.filter((t) => !called.has(t)),
          ...(name === 'season' ? { planWeeks: planWeeksCovered(turns) } : {}),
          totals: {
            latencyMs: turns.reduce((s, t) => s + t.latencyMs, 0),
            prompt_tokens: turns.reduce((s, t) => s + t.usage.prompt_tokens, 0),
            cached_tokens: turns.reduce((s, t) => s + t.usage.cached_tokens, 0),
            completion_tokens: turns.reduce((s, t) => s + t.usage.completion_tokens, 0),
            reasoning_tokens: turns.reduce((s, t) => s + t.usage.reasoning_tokens, 0),
            costUsd: turns.reduce((s, t) => s + (t.cost || 0), 0),
          },
          turns,
        });
      }
    }
  }

  // Summary table: per config, totals across scenarios.
  log('\n=== Summary (per config, all scenarios)');
  for (const cfg of configs) {
    const rows = report.results.filter((r) => r.model === cfg.model && r.effort === cfg.effort);
    const sum = (k) => rows.reduce((s, r) => s + r.totals[k], 0);
    const hit = rows.reduce((s, r) => s + r.expectedToolsHit.length, 0);
    const exp = rows.reduce((s, r) => s + r.expectedToolsHit.length + r.expectedToolsMissed.length, 0);
    log(`${cfg.model.padEnd(13)} ${cfg.effort.padEnd(7)} tools ${hit}/${exp}  latency ${Math.round(sum('latencyMs') / rows.length)} ms/scenario  reasoning ${sum('reasoning_tokens')} tok  cost $${sum('costUsd').toFixed(4)}  failed ${rows.filter((r) => r.failed).length}`);
  }
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2));
  log(`\nReport: ${path.resolve(args.out)}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
