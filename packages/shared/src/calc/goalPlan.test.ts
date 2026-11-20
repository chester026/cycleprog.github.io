import { describe, expect, it } from 'vitest';
import { goalPlanTimeline, weeksToTarget, type PlanEvent } from './goalPlan.js';

let nextId = 1;
const session = (date: string, minutes: number, over: Partial<PlanEvent> = {}): PlanEvent => ({
  id: nextId++,
  type: 'planned_ride',
  title: `Ride ${date}`,
  start_date: date,
  // The coach stores a duration as 09:00 + minutes.
  start_time: '09:00:00',
  end_time: `${String(9 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`,
  completed: false,
  ...over,
});

// 23 Nov 2026 is a Monday.
const plan: PlanEvent[] = [
  session('2026-11-24', 60, { completed: true }),
  session('2026-11-26', 90, { completed: true }),
  session('2026-11-28', 120),
  session('2026-12-01', 60, { completed: true }),
  session('2026-12-05', 180, { completed: true }),
  session('2026-12-08', 60),
  session('2026-12-12', 150),
  session('2026-12-19', 240, { workout: { duration_s: 4 * 3600 } }),
];

describe('goalPlanTimeline', () => {
  it('is null without a training session — other events of the goal are not a plan', () => {
    expect(goalPlanTimeline([], { today: '2026-11-19' })).toBeNull();
    expect(goalPlanTimeline([{ ...session('2027-03-26', 0), type: 'event' }], { today: '2026-11-19' })).toBeNull();
  });

  it('sums planned and done minutes by Monday-to-Sunday week and finds today in the plan', () => {
    const t = goalPlanTimeline(plan, { today: '2026-12-09' });
    expect(t?.weeks).toEqual([
      { start: '2026-11-23', plannedMin: 270, doneMin: 150 },
      { start: '2026-11-30', plannedMin: 240, doneMin: 240 },
      { start: '2026-12-07', plannedMin: 210, doneMin: 0 },
      { start: '2026-12-14', plannedMin: 240, doneMin: 0 },
    ]);
    expect(t).toMatchObject({ phase: 'running', currentWeek: 2, peakWeek: 0, plannedMin: 960, doneMin: 390 });
    // The session of the 8th has passed undone; the next one to do is the 12th.
    expect(t?.nextSession).toMatchObject({ date: '2026-12-12', title: 'Ride 2026-12-12' });
  });

  it("runs to the race week when the goal's date is later than the last session, with empty weeks between", () => {
    const t = goalPlanTimeline(plan, { today: '2026-11-25', targetDate: '2027-01-09T00:00:00.000Z' });
    expect(t?.weeks).toHaveLength(7);
    expect(t?.weeks[6]).toEqual({ start: '2027-01-04', plannedMin: 0, doneMin: 0 });
    expect(t?.currentWeek).toBe(0);
    // A target date before the plan's end does not cut the plan short.
    expect(goalPlanTimeline(plan, { today: '2026-11-25', targetDate: '2026-12-01' })?.weeks).toHaveLength(4);
  });

  it('says so when today is before the first week or past the last', () => {
    expect(goalPlanTimeline(plan, { today: '2026-11-19' })).toMatchObject({ phase: 'ahead', currentWeek: null });
    const over = goalPlanTimeline(plan, { today: '2026-12-21' });
    expect(over).toMatchObject({ phase: 'over', currentWeek: null, nextSession: null });
  });

  it('reads a session without a duration as zero and skips one without a real date', () => {
    const t = goalPlanTimeline(
      [session('2026-11-24', 60), { ...session('2026-11-25', 0), start_time: null, end_time: null }, session('not-a-date', 90)],
      { today: '2026-11-24' },
    );
    expect(t?.weeks).toEqual([{ start: '2026-11-23', plannedMin: 60, doneMin: 0 }]);
  });
});

describe('goalPlanTimeline: what was done', () => {
  it("counts the rider's rides of each week, whether or not a session was ticked", () => {
    const t = goalPlanTimeline(plan, {
      today: '2026-12-09',
      rides: [
        // Week 1: 3 h 20 ridden against 2 h 30 ticked.
        { date: '2026-11-24T07:10:00Z', minutes: 62 },
        { date: '2026-11-28T08:00:00Z', minutes: 138 },
        // Week 2: one short ride — the sessions ticked by hand (4 h) still stand.
        { date: '2026-12-02', minutes: 45 },
        // Week 3, the current one: nothing ticked, 1 h 15.4 ridden.
        { date: '2026-12-08T17:30:00Z', minutes: 75.4 },
        // Outside the plan, and one without a real date: ignored.
        { date: '2026-11-15T09:00:00Z', minutes: 300 },
        { date: '2027-06-01T09:00:00Z', minutes: 300 },
        { date: 'yesterday', minutes: 90 },
      ],
    });
    expect(t?.weeks.map((w) => w.doneMin)).toEqual([200, 240, 75, 0]);
    expect(t?.doneMin).toBe(515);
  });
});

describe('goalPlanTimeline: edges', () => {
  it('counts two sessions on one day, and names the heaviest week wherever it is', () => {
    const t = goalPlanTimeline([session('2026-11-24', 60), session('2026-11-24', 30), session('2026-12-02', 240)], { today: '2026-11-24' });
    expect(t?.weeks.map((w) => w.plannedMin)).toEqual([90, 240]);
    expect(t?.peakWeek).toBe(1);
  });

  it('stops at two years of weeks: a stray session dated far away is left out', () => {
    const t = goalPlanTimeline([session('2026-11-24', 60), session('2030-01-10', 600)], { today: '2026-11-24' });
    expect(t?.weeks).toHaveLength(104);
    expect(t?.plannedMin).toBe(60);
  });
});

describe('weeksToTarget', () => {
  it('counts weeks to a date ahead, and is null without one', () => {
    expect(weeksToTarget('2026-11-19', '2027-03-26')).toBe(18);
    expect(weeksToTarget('2026-11-19', '2026-11-21')).toBe(1);
    expect(weeksToTarget('2026-11-19', '2026-11-19')).toBeNull();
    expect(weeksToTarget('2026-11-19', null)).toBeNull();
    expect(weeksToTarget('2026-11-19', 'soon')).toBeNull();
  });
});
