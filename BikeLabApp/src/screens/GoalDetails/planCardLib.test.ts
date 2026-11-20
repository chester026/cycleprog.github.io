import {barShares, doneShare, formatPlanTime, ghostBarShares, placeCaptions, type PlanCaption} from './planCardLib';

const t = (key: string, opts?: Record<string, unknown>) => `${key}:${opts?.value}`;
const week = (plannedMin: number, doneMin = 0) => ({start: '2026-11-23', plannedMin, doneMin});

describe('formatPlanTime', () => {
  it('gives minutes under an hour and hours to the nearest half above', () => {
    expect(formatPlanTime(45, t)).toBe('goalDetails.planMinutes:45');
    expect(formatPlanTime(240, t)).toBe('goalDetails.planHours:4');
    expect(formatPlanTime(150, t)).toBe('goalDetails.planHours:2.5');
    expect(formatPlanTime(350, t)).toBe('goalDetails.planHours:6');
  });
});

describe('barShares / doneShare', () => {
  it('scales each week to the heaviest, keeps a light week visible and an empty one in its place', () => {
    expect(barShares([week(420), week(210), week(30), week(0)])).toEqual([1, 0.5, 0.14, 0.06]);
    expect(barShares([week(0), week(0)])).toEqual([0.06, 0.06]);
    expect(barShares([])).toEqual([]);
  });

  it('fills a bar by the share of the planned time done, never past full', () => {
    expect(doneShare(week(240, 120))).toBe(0.5);
    expect(doneShare(week(240, 300))).toBe(1);
    expect(doneShare(week(0, 60))).toBe(0);
  });
});

describe('ghostBarShares', () => {
  it('draws one outline per week to the date, tapering at the end; twelve without a date; never a wall of them', () => {
    const shares = ghostBarShares(18);
    expect(shares).toHaveLength(18);
    expect(shares.slice(-3)).toEqual([0.79, 0.57, 0.36]);
    expect(shares.every(share => share > 0 && share <= 1)).toBe(true);
    // Every fourth week is easier than the one before it.
    expect(shares[3]).toBeLessThan(shares[2]);
    expect(ghostBarShares(null)).toHaveLength(12);
    expect(ghostBarShares(1)).toHaveLength(4);
    expect(ghostBarShares(60)).toHaveLength(26);
  });
});

describe('placeCaptions', () => {
  const row = {width: 300, barCount: 18, hasRaceDot: true};
  const current = (anchor: number): PlanCaption => ({key: 'current', text: 'this week, 6 h', anchor, bold: true});
  const end: PlanCaption = {key: 'end', text: 'race, 26 Mar', anchor: 'right'};
  const start: PlanCaption = {key: 'start', text: 'start', anchor: 'left'};
  const peak = (anchor: number): PlanCaption => ({key: 'peak', text: 'peak, 7 h', anchor});

  it('centres a caption under its bar and pins the others to the edges', () => {
    const placed = placeCaptions([current(8), end, start], row);
    expect(placed.map(p => p.key)).toEqual(['current', 'end', 'start']);
    const [cur, right, left] = placed;
    // Bar 8 of 18 sits a little left of the middle of the row.
    expect(cur.left + cur.width / 2).toBeGreaterThan(120);
    expect(cur.left + cur.width / 2).toBeLessThan(150);
    expect(right.left + right.width).toBe(300);
    expect(left.left).toBe(0);
  });

  it('keeps a caption inside the row and drops the less important one it would run into', () => {
    // Week 1: "this week" takes the left edge, so "start" has no room; the peak further right fits.
    const placed = placeCaptions([current(0), end, start, peak(10)], row);
    expect(placed.map(p => p.key)).toEqual(['current', 'end', 'peak']);
    expect(placed[0].left).toBe(0);
    // The last week: "this week" would sit on the race caption — the race gives way.
    expect(placeCaptions([current(17), end, start], row).map(p => p.key)).toEqual(['current', 'start']);
  });

  it('places nothing before the row has a width', () => {
    expect(placeCaptions([current(3)], {width: 0, barCount: 18, hasRaceDot: true})).toEqual([]);
  });
});
