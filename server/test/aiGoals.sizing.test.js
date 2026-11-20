// A goal's targets sized to the goal (owner, 19.11.2026: a goal running to
// March came back with 400 km in total and 230 W average on an FTP of 183).
const { openai } = require('../lib/openaiResponses');
const { textResponse } = require('./fakeResponses');
const { weeksUntil, expectedWeek, fitTargetsToGoal, calculateRecentStats, generateGoalsWithAI } = require('../aiGoals');

const TODAY = new Date('2026-11-19T10:00:00Z');
// Thirteen weeks of riding: 1380 km, 16 100 m, 39 rides, 55 h at 25 km/h.
const RECENT = { totalDistance: 1380, totalElevation: 16100, totalRides: 39, totalHours: 55.2, avgSpeed: 25, avgWatts: 140 };

const sum = (field, unit, target, extra = {}) => ({
  title: `Total ${field}`, description: `Ride ${target} ${unit} by the deadline`, reasoning: `${target} ${unit} builds the base`,
  metric: { source: 'activity', aggregate: 'sum', field, ...extra }, target_value: target, unit, priority: 1,
});

describe('weeksUntil', () => {
  it('counts the weeks to the deadline to the nearest whole one, at least one', () => {
    expect(weeksUntil('2027-03-26', TODAY)).toBe(18);
    expect(weeksUntil('2026-12-17', TODAY)).toBe(4);
    expect(weeksUntil('2026-12-20', TODAY)).toBe(4);
    expect(weeksUntil('2026-12-21', TODAY)).toBe(5);
    expect(weeksUntil('2026-11-20', TODAY)).toBe(1);
    expect(weeksUntil('2026-11-01', TODAY)).toBe(1);
    expect(weeksUntil('2027-03-26T00:00:00.000Z', TODAY)).toBe(18);
  });

  it('is null without a readable date', () => {
    expect(weeksUntil(null, TODAY)).toBeNull();
    expect(weeksUntil('next spring', TODAY)).toBeNull();
  });
});

describe('expectedWeek', () => {
  it('from history: the current week raised by the experience overload', () => {
    const week = expectedWeek(RECENT, { experienceLevel: 'intermediate' });
    expect(week.basis).toBe('history');
    expect(week.distanceKm).toBeCloseTo((1380 / (92 / 7)) * 1.2, 5);
    expect(week.elevationM).toBeCloseTo((16100 / (92 / 7)) * 1.2, 5);
    expect(week.rides).toBeCloseTo((39 / (92 / 7)) * 1.2, 5);
    expect(week.hours).toBeCloseTo((55.2 / (92 / 7)) * 1.2, 5);
    expect(expectedWeek(RECENT, { experienceLevel: 'beginner' }).distanceKm).toBeCloseTo((1380 / (92 / 7)) * 1.15, 5);
    expect(expectedWeek(RECENT, { experienceLevel: 'advanced' }).distanceKm).toBeCloseTo((1380 / (92 / 7)) * 1.25, 5);
    // An unknown level counts as intermediate.
    expect(expectedWeek(RECENT).distanceKm).toBeCloseTo(week.distanceKm, 5);
  });

  it('from a plan: its hours at the rider\'s own speed and climbing per km, no overload on top', () => {
    const week = expectedWeek(RECENT, { experienceLevel: 'advanced', plannedHoursPerWeek: 5 });
    expect(week).toEqual({ distanceKm: 125, elevationM: 125 * (16100 / 1380), hours: 5, rides: null, basis: 'plan' });
  });

  it('a plan without any ride history to take a speed from falls back to history, and nothing gives null', () => {
    expect(expectedWeek({ ...RECENT, avgSpeed: 0 }, { plannedHoursPerWeek: 5 }).basis).toBe('history');
    expect(expectedWeek({}, { plannedHoursPerWeek: 5 })).toBeNull();
    expect(expectedWeek({ totalDistance: 0, totalRides: 0 })).toBeNull();
    expect(expectedWeek()).toBeNull();
  });
});

describe('fitTargetsToGoal', () => {
  const week = expectedWeek(RECENT, { experienceLevel: 'intermediate' }); // 126 km, 1470 m, 3.6 rides, 5 h
  const fit = (subGoals, sizing = {}) => fitTargetsToGoal(subGoals, { weeks: 18, week, ftp: 183, avgWatts: 140, ...sizing });

  it('raises month-sized totals to the window and rewrites the number where the words quote it', () => {
    const [distance, climbing, hours] = fit([
      sum('distance', 'km', 400, { transform: 0.001 }),
      sum('total_elevation_gain', 'm', 6000),
      sum('moving_time', 'h', 20, { transform: 0.000277778 }),
    ]);
    expect(distance).toMatchObject({ target_value: 2250, description: 'Ride 2250 km by the deadline', reasoning: '2250 km builds the base' });
    expect(climbing).toMatchObject({ target_value: 26500, description: 'Ride 26500 m by the deadline' });
    // A two-digit number could be anything in the text ("20 weeks") — only the target changes.
    expect(hours).toMatchObject({ target_value: 90, description: 'Ride 20 h by the deadline' });
  });

  it('leaves alone a total that is already in scale, or above it', () => {
    const goals = [sum('distance', 'km', 1900, { transform: 0.001 }), sum('total_elevation_gain', 'm', 40000)];
    expect(fit(goals)).toEqual(goals);
  });

  it('sizes a plain ride count, and no filtered sum or count', () => {
    const rides = { title: 'Rides', metric: { source: 'activity', aggregate: 'count' }, target_value: 16, unit: 'rides', priority: 2 };
    const longRides = { title: 'Long Rides (80+ km)', metric: { source: 'activity', aggregate: 'count', filter: { min_distance: 80000 } }, target_value: 5, unit: 'rides', priority: 2 };
    const hillyKm = sum('distance', 'km', 300, { transform: 0.001, filter: { min_elevation_rate: 0.015 } });
    const outdoorKm = sum('distance', 'km', 400, { transform: 0.001, filter: { type_in: ['Ride'] } });
    const fitted = fit([rides, longRides, hillyKm, outdoorKm]);
    expect(fitted[0].target_value).toBe(65);
    expect(fitted[1]).toEqual(longRides);
    expect(fitted[2]).toEqual(hillyKm);
    // type_in does not narrow which rides count toward the volume.
    expect(fitted[3].target_value).toBe(2250);
  });

  it('only reads units it knows, and other sources not at all', () => {
    const metres = sum('distance', 'm', 400000);
    const skill = { title: 'Climbing', metric: { source: 'skills', skill: 'climbing' }, target_value: 60, unit: 'score', priority: 1 };
    const speed = { title: 'Speed', metric: { source: 'activity', aggregate: 'avg', field: 'average_speed', transform: 3.6 }, target_value: 31, unit: 'km/h', priority: 1 };
    expect(fit([metres, skill, speed])).toEqual([metres, skill, speed]);
    expect(fit([sum('distance', 'км', 400, { transform: 0.001 })])[0].target_value).toBe(2250);
  });

  it('does nothing to totals without a window or without anything to size from', () => {
    const goals = [sum('distance', 'km', 400, { transform: 0.001 })];
    expect(fit(goals, { weeks: null })).toEqual(goals);
    expect(fit(goals, { week: null })).toEqual(goals);
    // A plan gives no ride count: a count is then left as the model set it.
    const rides = [{ title: 'Rides', metric: { source: 'activity', aggregate: 'count' }, target_value: 16, unit: 'rides', priority: 2 }];
    expect(fit(rides, { week: expectedWeek(RECENT, { plannedHoursPerWeek: 5 }) })).toEqual(rides);
  });

  it('brings a ride-average power target at threshold level down to a ride average', () => {
    const power = (target, aggregate = 'avg') => ({ title: 'Ride Power', description: `Hold ${target} W`, metric: { source: 'activity', aggregate, field: 'average_watts' }, target_value: target, unit: 'W', priority: 2 });
    // 5% above what the rider averages now.
    expect(fit([power(230)])[0]).toMatchObject({ target_value: 147, description: 'Hold 147 W' });
    expect(fit([power(183, 'median')])[0].target_value).toBe(147);
    // No measured average, or one already at threshold level: 75% of FTP.
    expect(fit([power(230)], { avgWatts: 0 })[0].target_value).toBe(137);
    expect(fit([power(230)], { avgWatts: 170 })[0].target_value).toBe(137);
    // In scale already; a best-ride (max) target; no FTP to judge by.
    expect(fit([power(150)])[0].target_value).toBe(150);
    expect(fit([power(230, 'max')])[0].target_value).toBe(230);
    expect(fit([power(230)], { ftp: null })[0].target_value).toBe(230);
  });
});

describe('calculateRecentStats', () => {
  it('adds the hours ridden and the average of measured power only', () => {
    const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const stats = calculateRecentStats([
      { start_date: day(3), distance: 60000, total_elevation_gain: 700, moving_time: 9000, average_speed: 6.7, average_watts: 150, device_watts: true },
      { start_date: day(10), distance: 40000, total_elevation_gain: 300, moving_time: 5400, average_speed: 7.4, average_watts: 130, device_watts: true },
      { start_date: day(20), distance: 30000, total_elevation_gain: 200, moving_time: 3600, average_speed: 8.3, average_watts: 210, device_watts: false },
    ]);
    expect(stats).toMatchObject({ totalRides: 3, totalDistance: 130, totalElevation: 1200, totalHours: 5, avgWatts: 140 });
    expect(calculateRecentStats([])).toMatchObject({ totalHours: 0, avgWatts: 0 });
  });
});

describe('generateGoalsWithAI sizing', () => {
  // What the model sent back on 18.11: a month's totals and a threshold as the ride average.
  const monthSized = (targetDate) => JSON.stringify({
    metaGoal: { title: 'Gran Fondo Cyprus Preparation', description: 'Build for the gran fondo.', tier: 'grand', target_date: targetDate, focusTags: ['endurance', 'race_prep'] },
    subGoals: [
      sum('distance', 'km', 400, { transform: 0.001 }),
      sum('total_elevation_gain', 'm', 6000),
      { title: 'Long Rides (80+ km)', metric: { source: 'activity', aggregate: 'count', filter: { min_distance: 80000 } }, target_value: 5, unit: 'rides', priority: 2 },
      { title: 'Ride Power', metric: { source: 'activity', aggregate: 'avg', field: 'average_watts' }, target_value: 230, unit: 'W', priority: 2 },
    ],
    timeline: '18 weeks',
    mainFocus: 'endurance',
  });
  const inWeeks = (n) => new Date(Date.now() + n * 7 * 86400000).toISOString().slice(0, 10);
  let createSpy;
  const generate = (sizing) => generateGoalsWithAI('Gran fondo in March, 120 km', { experience_level: 'intermediate' }, RECENT, null, null, [], null, sizing);

  afterEach(() => createSpy.mockRestore());

  it('with the event day and the plan\'s hours: the deadline is the event day and the totals are the plan\'s', async () => {
    createSpy = vi.spyOn(openai.responses, 'create').mockResolvedValue(textResponse(monthSized(inWeeks(4))));
    const goal = await generate({ targetDate: inWeeks(18), plannedHoursPerWeek: 5, ftp: 183 });

    expect(goal.metaGoal.target_date).toBe(inWeeks(18));
    // 18 weeks × 5 h × 25 km/h, and the rider's 11.7 m of climbing per km.
    expect(goal.subGoals.map((g) => g.target_value)).toEqual([2250, 26500, 5, 147]);

    const prompt = createSpy.mock.calls[0][0].input;
    expect(prompt).toContain(`THE DEADLINE IS GIVEN: metaGoal.target_date is ${inWeeks(18)} (18 weeks from today)`);
    expect(prompt).toContain('One week of this goal is 125 km and 1458 m of climbing, about 5 h — the rider\'s plan of 5 h a week');
    expect(prompt).toContain('This goal\'s window is 18 weeks: about 2250 km and 26500 m of climbing.');
    expect(prompt).toContain('FTP: 183 W');
    expect(prompt).toContain('Average power of a ride (power meter): 140 W');
  });

  it('without them: the model\'s own deadline decides the window, sized from the rider\'s recent riding', async () => {
    createSpy = vi.spyOn(openai.responses, 'create').mockResolvedValue(textResponse(monthSized(inWeeks(18))));
    const goal = await generate({});

    expect(goal.metaGoal.target_date).toBe(inWeeks(18));
    expect(goal.subGoals.map((g) => g.target_value)).toEqual([2250, 26500, 5, 230]);
    const prompt = createSpy.mock.calls[0][0].input;
    expect(prompt).toContain('So 4 weeks hold about 500 km and 5900 m of climbing, 9 weeks 1150 km and 13000 m of climbing, 13 weeks 1650 km and 19000 m of climbing, 18 weeks 2250 km and 26500 m of climbing.');
    expect(prompt).not.toContain('THE DEADLINE IS GIVEN');
  });

  it('a recovery goal keeps a deliberately small total', async () => {
    const recovery = JSON.parse(monthSized(inWeeks(18)));
    recovery.metaGoal.focusTags = ['recovery'];
    createSpy = vi.spyOn(openai.responses, 'create').mockResolvedValue(textResponse(JSON.stringify(recovery)));
    expect((await generate({})).subGoals[0].target_value).toBe(400);
  });

  it('a rider with no history and no plan gets the model\'s numbers as they are, and no window block', async () => {
    createSpy = vi.spyOn(openai.responses, 'create').mockResolvedValue(textResponse(monthSized(inWeeks(18))));
    const goal = await generateGoalsWithAI('Gran fondo in March', {}, {}, null, null, [], null);
    expect(goal.subGoals.map((g) => g.target_value)).toEqual([400, 6000, 5, 230]);
    expect(createSpy.mock.calls[0][0].input).not.toContain('WINDOW ARITHMETIC');
  });
});
