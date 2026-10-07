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
//     --out ../bench-coach.json [--scenarios ride,readiness,plan,power,complete] [--repeat 1]
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const coachService = require('../services/coach');
const llm = require('../lib/openaiResponses');
const { isReadinessIntent } = require('../lib/coachIntents');

// $ per 1M tokens: input / cached input / output (OpenAI list prices, 10/2026).
const PRICES = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-5-nano': { input: 0.05, cached: 0.005, output: 0.4 },
};

const WRITE_TOOLS = new Set([
  'create_goal', 'update_goal', 'complete_goal', 'delete_goal', 'create_calendar_event', 'update_calendar_event',
  'delete_calendar_event', 'log_bike_service', 'set_bike_gear_label', 'add_checklist_items',
  'update_checklist_item', 'remember_about_rider', 'forget_about_rider', 'update_rider_profile',
]);

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
async function runTurn({ coach, model, effort, instructions, input, userId, forceReadiness, log }) {
  const tools = coach.TOOLS;
  const calls = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cached_tokens: 0 };
  let text = '';
  const started = Date.now();
  let firstTokenMs = null;
  for (let round = 0; round < 6; round++) {
    const roundCalls = [];
    const reasoning = [];
    let roundText = '';
    for await (const ev of llm.streamTurn({
      model,
      effort: effort === 'none' ? undefined : effort,
      instructions,
      input,
      tools,
      toolChoice: round === 0 && forceReadiness ? { type: 'function', name: 'analyze_readiness' } : 'auto',
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
      if (WRITE_TOOLS.has(tc.name)) {
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
        for (const userText of sc.turns) {
          input.push({ role: 'user', content: userText });
          log(`   user: ${userText}`);
          try {
            const t = await runTurn({ coach, model: cfg.model, effort: cfg.effort, instructions, input, userId, forceReadiness: isReadinessIntent(userText), log });
            turns.push({ user: userText, ...t, cost: cost(cfg.model, t.usage) });
            log(`   coach (${t.latencyMs} ms, ${t.usage.completion_tokens} out / ${t.usage.reasoning_tokens} reasoning): ${t.text.slice(0, 160).replace(/\n/g, ' ')}…`);
          } catch (err) {
            failed = err.message;
            log(`   ✖ ${err.message}`);
            break;
          }
        }
        const called = new Set(turns.flatMap((t) => t.calls.map((c) => c.name)));
        report.results.push({
          model: cfg.model, effort: cfg.effort, scenario: name, repeat: rep,
          failed,
          expectedToolsHit: sc.expectTools.filter((t) => called.has(t)),
          expectedToolsMissed: sc.expectTools.filter((t) => !called.has(t)),
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
