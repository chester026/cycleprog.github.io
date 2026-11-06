import { describe, expect, it } from 'vitest';
import { pacingKind, recentDuration, rideIntensity, ridePowerInsights } from './ridePowerInsights.js';

const ride = (activityId: number, date: string, efforts: Record<number, number>) => ({ activityId, date, efforts });

describe('rideIntensity', () => {
  it('bands the intensity factor', () => {
    expect(rideIntensity(null)).toBeNull();
    expect(rideIntensity(0)).toBeNull();
    expect(rideIntensity(Number.NaN)).toBeNull();
    expect(rideIntensity(0.5)).toBe('recovery');
    expect(rideIntensity(0.7)).toBe('endurance');
    expect(rideIntensity(0.85)).toBe('tempo');
    expect(rideIntensity(0.95)).toBe('threshold');
    expect(rideIntensity(1.1)).toBe('race');
  });
});

describe('pacingKind', () => {
  it('classifies pacing', () => {
    expect(pacingKind(1.02, -12)).toBe('faded');
    expect(pacingKind(1.3, -12)).toBe('faded');
    expect(pacingKind(1.02, 6)).toBe('negative');
    expect(pacingKind(1.2, 0)).toBe('surgy');
    expect(pacingKind(1.05, -3)).toBe('even');
  });
});

describe('recentDuration', () => {
  const all = { 5: 1, 60: 1, 300: 1, 1200: 1, 3600: 1 };
  it('takes the highlight when the ride has it, else the intensity band\'s duration, else null', () => {
    expect(recentDuration(all, { seconds: 300 }, 'endurance')).toBe(300);
    expect(recentDuration({ 1200: 1 }, { seconds: 300 }, 'endurance')).toBe(1200);
    expect(recentDuration(all, null, 'race')).toBe(300);
    expect(recentDuration({ 1200: 1 }, null, 'race')).toBe(1200);
    expect(recentDuration(all, null, 'recovery')).toBe(3600);
    expect(recentDuration({ 300: 1, 1200: 1 }, null, 'endurance')).toBe(1200);
    expect(recentDuration(all, null, 'tempo')).toBe(1200);
    expect(recentDuration(all, null, 'threshold')).toBe(1200);
    expect(recentDuration({ 3600: 1 }, null, null)).toBe(3600);
    expect(recentDuration({ 300: 1 }, null, null)).toBe(300);
    expect(recentDuration({ 5: 1, 60: 1 }, null, 'tempo')).toBeNull();
  });
});

describe('ridePowerInsights', () => {
  const history = [
    ride(1, '2026-08-10', { 5: 800, 60: 450, 300: 300, 1200: 240, 3600: 210 }),
    ride(2, '2026-08-24', { 5: 820, 60: 440, 300: 310, 1200: 250 }),
    ride(3, '2026-09-14', { 5: 790, 60: 460, 300: 305, 1200: 255, 3600: 220 }),
    ride(4, '2026-10-05', { 5: 850, 60: 470, 300: 320, 1200: 258 }),
  ];

  it('ranks this ride per duration, finds the window best and the gap to it', () => {
    const r = ridePowerInsights({
      activityId: 5,
      rideDate: '2026-11-01T08:00:00Z',
      efforts: { 5: 830, 60: 480, 300: 318, 1200: 262 }, // no 3600: ride too short
      history,
      intensityFactor: 0.93,
      vi: 1.04,
      fadePct: -2,
    });
    expect(r.intensity).toBe('threshold');
    const by = Object.fromEntries(r.efforts.map((e) => [e.seconds, e]));
    expect(by[5]).toMatchObject({ watts: 830, best_watts: 850, best_activity_id: 4, rank: 2, total: 5, pct_of_best: 98, gap_w: 20, is_pr: false });
    expect(by[60]).toMatchObject({ watts: 480, best_watts: 480, best_activity_id: 5, best_date: '2026-11-01', rank: 1, gap_w: 0, is_pr: true });
    expect(by[300]).toMatchObject({ rank: 2, gap_w: 2 });
    expect(by[1200]).toMatchObject({ rank: 1, is_pr: true, pct_of_best: 100 });
    expect(by[3600]).toMatchObject({ watts: null, best_watts: 220, best_activity_id: 3, rank: null, total: 2, pct_of_best: null, gap_w: null, is_pr: false });
    // strongest: two rank-1 rows → the longer one
    expect(r.highlight).toEqual({ seconds: 1200, rank: 1, total: 5 });
    expect(r.pacing).toEqual({ vi: 1.04, fade_pct: -2, kind: 'even' });
  });

  it('replaces the history entry for this ride instead of duplicating it, and ties share a rank', () => {
    const r = ridePowerInsights({
      activityId: 4,
      rideDate: '2026-10-05',
      efforts: { 5: 850, 60: 470, 300: 320, 1200: 258 },
      history: [...history, ride(6, '2026-10-20', { 5: 850, 300: 100 })],
    });
    const by = Object.fromEntries(r.efforts.map((e) => [e.seconds, e]));
    expect(by[5]).toMatchObject({ rank: 1, total: 5, is_pr: true });
    expect(by[300].total).toBe(5);
    expect(r.intensity).toBeNull();
    expect(r.pacing).toBeNull();
  });

  it('no highlight when the ride is nowhere near the top; empty rows with no history at all', () => {
    const weak = ridePowerInsights({ activityId: 9, rideDate: '2026-11-01', efforts: { 5: 100, 60: 100, 300: 100, 1200: 100 }, history, intensityFactor: 0.6 });
    expect(weak.highlight).toBeNull();
    expect(weak.intensity).toBe('recovery');
    expect(weak.efforts.find((e) => e.seconds === 5)).toMatchObject({ rank: 5, total: 5, pct_of_best: 12, gap_w: 750 });

    const alone = ridePowerInsights({ activityId: 1, rideDate: '2026-11-01', efforts: {}, history: [] });
    expect(alone.efforts.every((e) => e.watts === null && e.best_watts === null && e.total === 0)).toBe(true);
    expect(alone.highlight).toBeNull();
    expect(alone.recent).toBeNull();
  });

  it('compares this ride with the previous rides over its key duration, oldest first', () => {
    const r = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 300: 200, 1200: 245 }, history, intensityFactor: 0.95 });
    // 5 min rank 5, 20 min rank 4 → no top-3; threshold ride → 20 min
    expect(r.highlight).toBeNull();
    expect(r.recent?.default_seconds).toBe(1200);
    expect(r.recent?.options.map((o) => o.seconds)).toEqual([1200]);
    expect(r.recent?.options[0]).toEqual({
      seconds: 1200,
      reason: 'intensity',
      rides: [
        { activity_id: 1, date: '2026-08-10', watts: 240 },
        { activity_id: 2, date: '2026-08-24', watts: 250 },
        { activity_id: 3, date: '2026-09-14', watts: 255 },
        { activity_id: 4, date: '2026-10-05', watts: 258 },
      ],
      ride_w: 245,
      avg_prev_w: 251,
      vs_avg_pct: -2.3,
      rank: 4,
      total: 5,
    });
  });

  it('a top-3 duration becomes the story; fewer than 3 previous rides gives no average; the last 8 rides only', () => {
    const strong = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 300: 330, 1200: 200 }, history, intensityFactor: 0.7 });
    // top-3 at 5 min, but the toggle offers 20 min (/1 h) when the ride has them; 5 min only as a fallback
    expect(strong.recent?.default_seconds).toBe(1200);
    expect(strong.recent?.options.map((o) => o.seconds)).toEqual([1200]);
    const fiveOnly = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 300: 330 }, history, intensityFactor: 0.7 });
    expect(fiveOnly.recent?.default_seconds).toBe(300);
    expect(fiveOnly.recent?.options[0]).toMatchObject({ seconds: 300, reason: 'highlight', ride_w: 330, rank: 1, total: 5, vs_avg_pct: 6.9 });

    const both = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 1200: 262, 3600: 200 }, history, intensityFactor: 0.7 });
    expect(both.recent?.options.map((o) => o.seconds)).toEqual([1200, 3600]);
    expect(both.recent?.default_seconds).toBe(1200); // rank 1 at 20 min beats the endurance default of 1 h
    expect(both.recent?.options[0].reason).toBe('highlight');
    expect(both.recent?.options[1]).toMatchObject({ reason: 'intensity', total: 3, avg_prev_w: null });

    const sparse = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 1200: 200 }, history: history.slice(0, 2) });
    expect(sparse.recent?.options[0]).toMatchObject({ avg_prev_w: null, vs_avg_pct: null, rank: 3, total: 3 });

    const many = Array.from({ length: 12 }, (_, i) => ride(100 + i, `2026-0${1 + Math.floor(i / 4)}-${String(10 + i).padStart(2, '0')}`, { 1200: 200 + i }));
    const capped = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 1200: 205 }, history: many });
    expect(capped.recent?.options[0].rides).toHaveLength(8);
    expect(capped.recent?.options[0].rides[0].activity_id).toBe(104);
    expect(capped.recent?.options[0].total).toBe(9);

    const none = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 5: 700 }, history });
    expect(none.recent).toBeNull();
  });

  it('summarises FTP with W/kg and the change this ride made', () => {
    // window best 20 min without ride 5 is 258 (ride 4) → FTP 245; with ride 5's 262 → 249
    const moved = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 1200: 262 }, history, ftpWatts: 249, weightKg: 70 });
    expect(moved.ftp).toEqual({ watts: 249, w_per_kg: 3.56, delta_w: 4 });
    const same = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 1200: 200 }, history, ftpWatts: 245 });
    expect(same.ftp).toEqual({ watts: 245, w_per_kg: null, delta_w: 0 });
    // first FTP ever: nothing before it
    const first = ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: { 1200: 200 }, history: [], ftpWatts: 190 });
    expect(first.ftp).toEqual({ watts: 190, w_per_kg: null, delta_w: null });
    expect(ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: {}, history, ftpWatts: 0 }).ftp).toBeNull();
    expect(ridePowerInsights({ activityId: 5, rideDate: '2026-11-01', efforts: {}, history }).ftp).toBeNull();
  });

  it('accepts a custom duration list', () => {
    const r = ridePowerInsights({ activityId: 1, rideDate: '2026-11-01', efforts: { 10: 500 }, history: [] }, [10]);
    expect(r.efforts).toHaveLength(1);
    expect(r.efforts[0]).toMatchObject({ seconds: 10, watts: 500, rank: 1, total: 1, is_pr: true });
  });
});
