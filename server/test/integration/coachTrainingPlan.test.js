// A whole training plan into the calendar in one go (owner, 19.11.2026: an
// 18-week plan went in three to six sessions per reply). On real Postgres:
// schedule_training_plan itself, what the clients and the model each get from
// it, and the chat loop around it — a round cut at the output limit, and the
// rounds running out.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { asStream, RAW_USAGE, completed, toolCallEvents, textStream, textResponse } = require('../fakeResponses');

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

describe('coach training plan → calendar', () => {
  let app, pool, coach, rider, goalId, otherGoalId;
  const today = localISO(new Date());
  const thisMonday = addDays(today, weekdayOf(today) === 0 ? -6 : 1 - weekdayOf(today));
  const nextMonday = addDays(thisMonday, 7);
  const auth = (req) => req.set('Authorization', `Bearer ${rider.token}`);
  const eventsOfGoal = async (id) =>
    (await pool.query(
      `SELECT id, title, description, to_char(start_date, 'YYYY-MM-DD') AS date, type, source, completed, workout, start_time, end_time
       FROM calendar_events WHERE user_id = $1 AND goal_id = $2 ORDER BY start_date`,
      [rider.id, id]
    )).rows;
  const schedule = (args, ctx = {}) => coach.executeTool('schedule_training_plan', args, { userId: rider.id, ...ctx });

  const tempo = (reps, minutes) => [
    { kind: 'warmup', minutes: 15, zone: 2, watts_low: 102, watts_high: 137, cue: 'Вкатывайся.' },
    { repeat: reps, steps: [{ kind: 'work', minutes, zone: 3, watts_low: 138, watts_high: 155, cue: 'Ровно, без рывков.' }, { kind: 'recovery', minutes: 4, zone: 1 }] },
    { kind: 'cooldown', minutes: 10, zone: 1 },
  ];
  const steady = (minutes) => [
    { kind: 'warmup', minutes: 10, zone: 1 },
    { kind: 'steady', minutes: minutes - 15, zone: 2, watts_low: 102, watts_high: 137, cue: 'Спокойно, в диапазоне.' },
    { kind: 'cooldown', minutes: 5, zone: 1 },
  ];
  // The owner's plan shape: three sessions a week (Tue / Thu / Sat) for 18
  // weeks, the Thursday ride identical throughout, the others progressing.
  const planSessions = (fromWeek, toWeek) => {
    const weeks = Array.from({ length: toWeek - fromWeek + 1 }, (_, i) => fromWeek + i);
    return [
      ...weeks.map((week) => ({
        weeks: [week], weekday: 'tue', title: `Нед ${week}: 3×${7 + week}′ @ 138–155 Вт`, description: 'Темповые отрезки, работай ровно.', workout_steps: tempo(3, 7 + week),
      })),
      { weeks, weekday: 'thu', title: '60′ Z2 @ 102–137 Вт', description: 'Спокойная аэробная поездка.', workout_steps: steady(60) },
      ...weeks.map((week) => ({
        weeks: [week], weekday: 'sat', title: `Нед ${week}: длинная ${120 + week * 10}′ Z2`, description: 'Холмистый маршрут без ускорений.', workout_steps: steady(120 + week * 10),
      })),
    ];
  };

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ coach } = require('../../services/coach'));
    rider = await createUser(pool, app, request);
    const goal = (title) => pool.query(`INSERT INTO meta_goals (user_id, title, status) VALUES ($1, $2, 'active') RETURNING id`, [rider.id, title]);
    goalId = (await goal('Gran Fondo Cyprus Preparation')).rows[0].id;
    otherGoalId = (await goal('FTP 200')).rows[0].id;
  }, 30000);

  it('is offered to the model with sessions by plan week and weekday', () => {
    const tool = coach.TOOLS.find((t) => t.function.name === 'schedule_training_plan');
    expect(tool.function.parameters.required).toEqual(['goal_id', 'week1_start', 'sessions']);
    const session = tool.function.parameters.properties.sessions.items;
    expect(session.required).toEqual(['weeks', 'weekday', 'title', 'description', 'workout_steps']);
    // No way to give a session as a bare duration: its time comes from its blocks.
    expect(session.properties.duration_minutes).toBeUndefined();
    expect(session.properties.weekday.enum).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(session.properties.workout_steps.type).toBe('array');
  });

  it('puts an 18-week plan in the calendar: every session on its weekday, linked to the goal, with its blocks', async () => {
    // The way the coach is told to send it: about four weeks per call.
    const results = [];
    for (const [from, to] of [[1, 4], [5, 8], [9, 12], [13, 16], [17, 18]]) {
      results.push(await schedule({ goal_id: goalId, week1_start: nextMonday, sessions: planSessions(from, to) }));
    }
    for (const result of results) expect(result.error).toBeUndefined();
    expect(results.map((r) => r.scheduled)).toEqual([12, 12, 12, 12, 6]);
    expect(results[0]).toMatchObject({
      already_in_calendar: 0, replaced: 0, skipped_past: [],
      first_session: addDays(nextMonday, 1), last_session: addDays(nextMonday, 3 * 7 + 5),
      weeks: { from: 1, to: 4, covers: `${nextMonday} to ${addDays(nextMonday, 27)}` },
      goal: { id: goalId, title: 'Gran Fondo Cyprus Preparation' },
    });
    expect(results[4].weeks).toEqual({ from: 17, to: 18, covers: `${addDays(nextMonday, 16 * 7)} to ${addDays(nextMonday, 18 * 7 - 1)}` });
    // Each session as written, with the time its blocks add up to: 15 + 3×(8+4) + 10.
    expect(results[0].sessions[0]).toEqual({ title: 'Нед 1: 3×8′ @ 138–155 Вт', minutes: 61, weeks: [1] });
    expect(results[0].sessions[4]).toEqual({ title: '60′ Z2 @ 102–137 Вт', minutes: 60, weeks: [1, 2, 3, 4] });

    const events = await eventsOfGoal(goalId);
    expect(events).toHaveLength(54);
    expect(events.map((e) => weekdayOf(e.date))).toEqual(Array.from({ length: 18 }, () => [2, 4, 6]).flat());
    expect(events[53].date).toBe(addDays(nextMonday, 17 * 7 + 5));
    expect(events.every((e) => e.type === 'planned_ride' && e.source === 'coach' && e.completed === false)).toBe(true);
    expect(events[0]).toMatchObject({ title: 'Нед 1: 3×8′ @ 138–155 Вт', description: 'Темповые отрезки, работай ровно.', start_time: '09:00:00', end_time: '10:01:00' });
    expect(events[0].workout).toMatchObject({ version: 1, duration_s: 61 * 60 });
    expect(events[0].workout.steps).toHaveLength(8);

    // What the app reads — through the contract, with response validation on.
    const res = await auth(request(app).get('/api/calendar')).query({ goal_id: goalId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(54);
  });

  it('a repeated call adds nothing twice', async () => {
    const again = await schedule({ goal_id: goalId, week1_start: nextMonday, sessions: planSessions(1, 4) });
    expect(again).toMatchObject({ scheduled: 0, already_in_calendar: 12, replaced: 0, events: [] });
    expect(await eventsOfGoal(goalId)).toHaveLength(54);
  });

  it('one unreadable session and the whole call schedules nothing, naming what to fix', async () => {
    const sessions = [...planSessions(19, 19), { weeks: [19], weekday: 'sun', title: 'Сломанная', workout_steps: [{ kind: 'work' }] }];
    const result = await schedule({ goal_id: goalId, week1_start: nextMonday, sessions });
    expect(result.error).toMatch(/^sessions\[3\] \("Сломанная"\): workout_steps\[0\]: minutes must be a number above 0\. Nothing was scheduled/);
    expect(await eventsOfGoal(goalId)).toHaveLength(54);

    expect((await schedule({ goal_id: goalId, week1_start: nextMonday, sessions: [{ weeks: [0], weekday: 'tue', title: 'Week zero' }] })).error).toMatch(/weeks must be a list of plan week numbers from 1 to 60/);
    expect((await schedule({ goal_id: goalId, week1_start: nextMonday, sessions: [{ weeks: [1], weekday: 'tuesday', title: 'Day' }] })).error).toMatch(/weekday must be one of mon, tue/);
    expect((await schedule({ goal_id: goalId, week1_start: 'next monday', sessions: planSessions(1, 1) })).error).toMatch(/week1_start must be the Monday/);
    expect((await schedule({ goal_id: goalId, week1_start: '2024-04-08', sessions: planSessions(1, 1) })).error).toMatch(/week1_start must be the Monday/);
    expect((await schedule({ goal_id: 999999, week1_start: nextMonday, sessions: planSessions(1, 1) })).error).toMatch(/goal_id 999999 not found/);
    expect((await schedule({ week1_start: nextMonday, sessions: planSessions(1, 1) })).error).toMatch(/goal_id is required/);
    expect(await eventsOfGoal(goalId)).toHaveLength(54);
  });

  it('replace_existing swaps this goal\'s not-yet-ridden sessions of those weeks and nothing else', async () => {
    // In the way: another goal's session and a ridden one of this goal, both in week 2.
    const week2Tuesday = addDays(nextMonday, 8);
    await pool.query(
      `INSERT INTO calendar_events (user_id, type, title, start_date, source, goal_id, completed)
       VALUES ($1, 'planned_ride', 'FTP test', $2, 'coach', $3, false), ($1, 'planned_ride', 'Ridden already', $2, 'coach', $4, true)`,
      [rider.id, week2Tuesday, otherGoalId, goalId]
    );
    const before = await eventsOfGoal(goalId);
    const week3 = before.filter((e) => e.date >= addDays(nextMonday, 14) && e.date <= addDays(nextMonday, 20)).map((e) => e.id);

    // Weeks 1–2 re-planned on a new FTP: two sessions a week instead of three.
    const result = await schedule({
      goal_id: goalId,
      week1_start: nextMonday,
      replace_existing: true,
      sessions: [
        { weeks: [1, 2], weekday: 'wed', title: '2×15′ @ 150–165 Вт', description: 'Новые ватты после теста.', workout_steps: tempo(2, 15) },
        { weeks: [1, 2], weekday: 'sun', title: '2 ч Z2', description: 'Длинная.', workout_steps: steady(120) },
      ],
    });
    expect(result).toMatchObject({ scheduled: 4, replaced: 6, already_in_calendar: 0 });
    expect(result.sessions).toEqual([
      { title: '2×15′ @ 150–165 Вт', minutes: 63, weeks: [1, 2] },
      { title: '2 ч Z2', minutes: 120, weeks: [1, 2] },
    ]);

    const after = await eventsOfGoal(goalId);
    const firstTwoWeeks = after.filter((e) => e.date <= addDays(nextMonday, 13));
    expect(firstTwoWeeks.map((e) => e.title).sort()).toEqual(['2 ч Z2', '2 ч Z2', '2×15′ @ 150–165 Вт', '2×15′ @ 150–165 Вт', 'Ridden already']);
    // The session's length in the calendar is what its blocks add up to.
    expect(firstTwoWeeks.find((e) => e.title === '2 ч Z2')).toMatchObject({ start_time: '09:00:00', end_time: '11:00:00' });
    // Week 3 onwards and the other goal are untouched.
    expect(after.filter((e) => week3.includes(e.id))).toHaveLength(3);
    expect(after).toHaveLength(54 - 6 + 4 + 1);
    expect((await eventsOfGoal(otherGoalId)).map((e) => e.title)).toEqual(['FTP test']);
  });

  // bench 19.11.2026: all 54 sessions of a plan came as title + brief + minutes, and the race as one of them.
  it('refuses a session without blocks — and says where the race day goes', async () => {
    const fresh = (await pool.query(`INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'No blocks', 'active') RETURNING id`, [rider.id])).rows[0].id;
    const result = await schedule({
      goal_id: fresh,
      week1_start: nextMonday,
      sessions: [
        { weeks: [1], weekday: 'tue', title: '60′ Z2', description: 'Спокойно.', workout_steps: steady(60) },
        { weeks: [1], weekday: 'sun', title: 'Марафон 200 км', description: 'Старт.', duration_minutes: 480 },
      ],
    });
    expect(result.error).toMatch(/^sessions\[1\] \("Марафон 200 км"\): workout_steps is required/);
    expect(result.error).toMatch(/add it with create_calendar_event \(type "event"\)\. Nothing was scheduled/);
    expect(await eventsOfGoal(fresh)).toEqual([]);
  });

  it('leaves out the days already behind and reads any day of week 1 as its Monday', async () => {
    const fresh = (await pool.query(`INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Past days', 'active') RETURNING id`, [rider.id])).rows[0].id;
    const everyDay = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((weekday) => ({ weeks: [1], weekday, title: `Easy ${weekday}`, workout_steps: steady(45) }));
    // Wednesday of this week stands for this week's Monday.
    const result = await schedule({ goal_id: fresh, week1_start: addDays(thisMonday, 2), sessions: everyDay });
    const week = Array.from({ length: 7 }, (_, i) => addDays(thisMonday, i));
    expect(result.skipped_past).toEqual(week.filter((d) => d < today));
    expect(result.scheduled).toBe(week.filter((d) => d >= today).length);
    expect(result.first_session).toBe(today);
    expect((await eventsOfGoal(fresh)).map((e) => e.date)).toEqual(week.filter((d) => d >= today));
  });

  it('schedules the later weeks of a plan that started months ago', async () => {
    const fresh = (await pool.query(`INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Long running', 'active') RETURNING id`, [rider.id])).rows[0].id;
    const week1 = addDays(thisMonday, -15 * 7);
    const result = await schedule({ goal_id: fresh, week1_start: week1, sessions: [{ weeks: [15, 17, 18], weekday: 'sun', title: 'Long ride', workout_steps: steady(180) }] });
    expect(result).toMatchObject({ scheduled: 2, skipped_past: [addDays(thisMonday, -1)], first_session: addDays(thisMonday, 13), last_session: addDays(thisMonday, 20) });
  });

  it('get_calendar says what lies beyond its window', async () => {
    const result = await coach.executeTool('get_calendar', { from: nextMonday, to: addDays(nextMonday, 6) }, { userId: rider.id });
    expect(result.range).toEqual({ from: nextMonday, to: addDays(nextMonday, 6) });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => e.start_date <= addDays(nextMonday, 6))).toBe(true);
    expect(result.later_events.count).toBeGreaterThan(40);
    expect(result.later_events.last_date).toBe(addDays(nextMonday, 17 * 7 + 5));

    const nothingLater = await coach.executeTool('get_calendar', { from: addDays(nextMonday, 400), to: addDays(nextMonday, 430) }, { userId: rider.id });
    expect(nothingLater.later_events).toEqual({ count: 0, last_date: null });
  });

  describe('through the chat', () => {
    let createSpy;
    const chat = (message) =>
      auth(request(app).post('/api/coach/chat'))
        .send({ message })
        .buffer(true)
        .parse((res, callback) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => callback(null, raw));
        });
    const sseEvents = (res) => res.body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
    const planCall = (n, args) => toolCallEvents({ itemId: `fc_${n}`, callId: `call_${n}`, name: 'schedule_training_plan', argumentsJson: JSON.stringify(args) });
    const cutAtOutputLimit = { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: RAW_USAGE } };
    // The streamed rounds the fake model plays, in order; the suggestions call gets none.
    const playRounds = (rounds) => {
      let round = 0;
      createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (!params.stream) return textResponse('[]');
        return rounds[Math.min(round++, rounds.length - 1)]();
      });
    };
    const streamedCalls = () => createSpy.mock.calls.map(([params]) => params).filter((params) => params.stream);
    let chatGoalId;

    beforeAll(async () => {
      chatGoalId = (await pool.query(`INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Chat plan', 'active') RETURNING id`, [rider.id])).rows[0].id;
    });
    afterEach(() => createSpy.mockRestore());

    it('shows the clients one create_calendar_event per session and hands the model only the totals', async () => {
      const args = { goal_id: chatGoalId, week1_start: nextMonday, sessions: planSessions(1, 2) };
      playRounds([
        () => asStream([...planCall(1, args), completed(RAW_USAGE)]),
        () => textStream('В календаре 6 тренировок.'),
      ]);
      const res = await chat('Занеси план в календарь');
      expect(res.status).toBe(200);
      const events = sseEvents(res);

      // Clients: the running pill, then six results under the name they know.
      const toolEvents = events.filter((e) => e.type === 'tool_call' || e.type === 'tool_result');
      expect(toolEvents.map((e) => `${e.type}:${e.name}`)).toEqual(Array.from({ length: 6 }, () => ['tool_call:create_calendar_event', 'tool_result:create_calendar_event']).flat());
      expect(toolEvents[0].args).toEqual({});
      expect(toolEvents[1].result.event).toMatchObject({ title: 'Нед 1: 3×8′ @ 138–155 Вт', start_date: addDays(nextMonday, 1), goal_id: chatGoalId, goal_title: 'Chat plan', workout_summary: { minutes: 61, blocks: 8 } });
      expect(toolEvents[2].args).toMatchObject({ type: 'planned_ride', start_date: toolEvents[3].result.event.start_date });

      // The model: the call it made, answered with totals — no event rows.
      const secondRound = streamedCalls()[1].input;
      expect(secondRound.find((item) => item.type === 'function_call')).toMatchObject({ name: 'schedule_training_plan', call_id: 'call_1' });
      const output = JSON.parse(secondRound.find((item) => item.type === 'function_call_output').output);
      expect(output).toMatchObject({ scheduled: 6, weeks: { from: 1, to: 2 }, goal: { id: chatGoalId } });
      expect(output).not.toHaveProperty('events');

      // Stored with the reply the same way, so a reloaded chat shows the same card.
      const conversationId = events.find((e) => e.type === 'done').conversation_id;
      const detail = await auth(request(app).get(`/api/coach/conversations/${conversationId}`));
      const stored = detail.body.messages.find((m) => m.role === 'assistant');
      expect(stored.content).toBe('В календаре 6 тренировок.');
      expect(stored.tool_calls).toHaveLength(6);
      expect(stored.tool_calls.every((tc) => tc.name === 'create_calendar_event' && tc.status === 'done' && tc.result.event.id > 0)).toBe(true);
      // The sessions carry the conversation they came from.
      const linked = await pool.query('SELECT COUNT(*)::int AS n FROM calendar_events WHERE coach_conversation_id = $1', [conversationId]);
      expect(linked.rows[0].n).toBe(6);
    });

    it('an 18-week plan goes in within one reply, a call per round after the reads', async () => {
      const seasonGoalId = (await pool.query(`INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Season', 'active') RETURNING id`, [rider.id])).rows[0].id;
      const reads = ['get_goals_progress', 'get_calendar'].map((name, i) => toolCallEvents({ itemId: `fc_r${i}`, callId: `call_r${i}`, name, outputIndex: i }));
      playRounds([
        () => asStream([...reads.flat(), completed(RAW_USAGE)]),
        ...[[1, 4], [5, 8], [9, 12], [13, 16], [17, 18]].map(([from, to], i) => () =>
          asStream([...planCall(i, { goal_id: seasonGoalId, week1_start: nextMonday, sessions: planSessions(from, to) }), completed(RAW_USAGE)])
        ),
        () => textStream('Весь план в календаре: 54 тренировки.'),
      ]);
      const events = sseEvents(await chat('Занеси весь план до конца марта'));

      expect(streamedCalls()).toHaveLength(7);
      expect(events.filter((e) => e.type === 'tool_result' && e.result.event)).toHaveLength(54);
      expect(await eventsOfGoal(seasonGoalId)).toHaveLength(54);
      expect(events.filter((e) => e.type === 'token').map((e) => e.content).join('')).toBe('Весь план в календаре: 54 тренировки.');
    });

    it('a call cut at the output limit is not run on a guess: the model is told and sends it again', async () => {
      const args = { goal_id: chatGoalId, week1_start: nextMonday, sessions: planSessions(3, 3) };
      const json = JSON.stringify(args);
      playRounds([
        // The call is still being written when the limit hits: no output_item.done for it.
        () => asStream([
          { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_cut', call_id: 'call_cut', name: 'schedule_training_plan', arguments: '' } },
          { type: 'response.function_call_arguments.delta', item_id: 'fc_cut', delta: json.slice(0, 80) },
          cutAtOutputLimit,
        ]),
        () => asStream([...planCall(2, args), completed(RAW_USAGE)]),
        () => textStream('Неделя 3 в календаре.'),
      ]);
      const events = sseEvents(await chat('Занеси третью неделю'));

      const rounds = streamedCalls();
      expect(rounds).toHaveLength(3);
      // `input` is one array that grows through the reply: the note sits right
      // after the rider's message, before the call that then went through.
      const { input } = rounds[1];
      expect(input[0]).toEqual({ role: 'user', content: 'Занеси третью неделю' });
      expect(input[1].role).toBe('user');
      expect(input[1].content).toMatch(/^\[App context — do not mention this note to the user: your last reply hit the output limit before its tool call was complete, so NOTHING was done/);
      expect(input[2]).toMatchObject({ type: 'function_call', call_id: 'call_2' });
      expect(events.filter((e) => e.type === 'tool_result' && e.result.event)).toHaveLength(3);
      expect(events.filter((e) => e.type === 'token').map((e) => e.content).join('')).toBe('Неделя 3 в календаре.');
    });

    it('a cut round keeps the calls that were complete and tells the model the rest was lost', async () => {
      const done = { goal_id: chatGoalId, week1_start: nextMonday, sessions: planSessions(4, 4) };
      playRounds([
        () => asStream([
          ...planCall(1, done),
          { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', id: 'fc_cut', call_id: 'call_cut', name: 'schedule_training_plan', arguments: '' } },
          cutAtOutputLimit,
        ]),
        () => textStream('Неделя 4 в календаре, остальное продолжу.'),
      ]);
      const events = sseEvents(await chat('Занеси недели 4 и 5'));

      expect(events.filter((e) => e.type === 'tool_result' && e.result.event)).toHaveLength(3);
      const input = streamedCalls()[1].input;
      expect(input.filter((item) => item.type === 'function_call')).toHaveLength(1);
      expect(input[input.length - 2].type).toBe('function_call_output');
      expect(input[input.length - 1].content).toMatch(/only the tool calls answered above were made/);
    });

    it('arguments that are not JSON get an error back instead of a run with empty arguments', async () => {
      const before = (await eventsOfGoal(chatGoalId)).length;
      playRounds([
        () => asStream([...toolCallEvents({ itemId: 'fc_1', callId: 'call_1', name: 'schedule_training_plan', argumentsJson: '{"goal_id": 1, "sessions": [' }), completed(RAW_USAGE)]),
        () => textStream('Не получилось, повторю.'),
      ]);
      const events = sseEvents(await chat('Занеси план'));

      expect(events.find((e) => e.type === 'tool_result').result.error).toMatch(/cut off or are not valid JSON, so nothing was done/);
      const output = JSON.parse(streamedCalls()[1].input.find((item) => item.type === 'function_call_output').output);
      expect(output.error).toMatch(/Send the call again/);
      expect(await eventsOfGoal(chatGoalId)).toHaveLength(before);
    });

    it('when the rounds run out the reply still ends with words: a closing round without tools', async () => {
      let calls = 0;
      // A model that never stops asking for the calendar.
      createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (!params.stream) return textResponse('[]');
        if (params.tool_choice === 'none') return textStream('Сделал первые недели, остальное продолжу по твоей команде.');
        return asStream([...toolCallEvents({ itemId: `fc_${++calls}`, callId: `call_${calls}`, name: 'get_calendar' }), completed(RAW_USAGE)]);
      });
      const events = sseEvents(await chat('Что в календаре?'));

      const rounds = streamedCalls();
      expect(rounds).toHaveLength(11);
      expect(rounds.slice(0, 10).every((params) => params.tool_choice !== 'none')).toBe(true);
      expect(rounds[10].tool_choice).toBe('none');
      expect(rounds[10].instructions).toMatch(/You have used all the tool calls this reply allows/);
      expect(rounds[0].instructions).not.toMatch(/You have used all the tool calls/);
      expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(10);
      expect(events.filter((e) => e.type === 'token').map((e) => e.content).join('')).toBe('Сделал первые недели, остальное продолжу по твоей команде.');
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });
  });
});
