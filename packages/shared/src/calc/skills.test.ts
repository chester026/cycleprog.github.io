import { describe, expect, it } from 'vitest';
import { calculateAllSkills, determineRiderProfile, SkillsSchema, RiderProfileSchema } from './skills.js';
import type { StravaActivity } from '../types/activity.js';

const NOW = new Date('2026-06-15T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

let nextId = 1;

function ride(daysAgo: number, overrides: Partial<StravaActivity> = {}): StravaActivity {
  const start = new Date(NOW.getTime() - daysAgo * DAY_MS);
  return {
    id: nextId++,
    name: 'Ride',
    type: 'Ride',
    start_date: start.toISOString(),
    distance: 40000, // 40km
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 50,
    average_speed: 8, // ~28.8 km/h
    max_speed: 12,
    average_heartrate: 140,
    ...overrides,
  } as StravaActivity;
}

// Builds a climber-heavy (but not "no data"/all-rounder/consistency-only)
// fixture: mostly steep mountain rides plus a few flat/tempo rides for
// variety, with two skipped weeks (out of 8) so consistency stays moderate
// rather than saturating and masking the climbing dominance.
function climberFixture(): StravaActivity[] {
  const rides: StravaActivity[] = [];
  const ridesPerWeek = [4, 0, 4, 4, 0, 4, 4, 4];
  ridesPerWeek.forEach((count, w) => {
    for (let c = 0; c < count; c++) {
      const daysAgo = w * 7 + c * 1.5;
      if (c < 3) {
        // Steep mountain ride.
        rides.push(
          ride(daysAgo, {
            distance: 70000,
            moving_time: 5.5 * 3600,
            total_elevation_gain: 2800,
            average_speed: 12000 / 3600,
            max_speed: 9,
            average_heartrate: 165,
          }),
        );
      } else {
        // Flat/tempo ride, for variety (keeps this from being a degenerate
        // single-scale fixture while climbing still dominates).
        rides.push(
          ride(daysAgo, {
            distance: 50000,
            total_elevation_gain: 100,
            average_speed: 26 / 3.6,
            max_speed: 35 / 3.6,
            average_heartrate: 145,
          }),
        );
      }
    }
  });
  return rides;
}

describe('calculateAllSkills', () => {
  it('returns all-zero scales and a "no data" profile for 0 activities', () => {
    const skills = calculateAllSkills([], { asOf: NOW });
    expect(skills).toEqual({ climbing: 0, sprint: 0, endurance: 0, tempo: 0, power: 0, consistency: 0 });
    expect(() => SkillsSchema.parse(skills)).not.toThrow();

    const profile = determineRiderProfile(skills);
    expect(profile.profile).toBe('Developing Rider');
    expect(() => RiderProfileSchema.parse(profile)).not.toThrow();
  });

  it('applies confidence < 1 for a sparse (5-ride) sample', () => {
    const acts = Array.from({ length: 5 }, (_, i) => ride(i * 10));
    const skills = calculateAllSkills(acts, { asOf: NOW });
    const full = calculateAllSkills(Array.from({ length: 40 }, (_, i) => ride(i * 2)), { asOf: NOW });

    // Same raw shape (flat rides, moderate speed) but fewer of them ->
    // confidence-corrected scales must be <= the 40-ride (full-confidence)
    // equivalent for every corrected scale.
    expect(skills.climbing).toBeLessThanOrEqual(full.climbing);
    expect(skills.sprint).toBeLessThanOrEqual(full.sprint);
    expect(skills.tempo).toBeLessThanOrEqual(full.tempo);
  });

  it('reaches full confidence (factor 1) at 20+ rides in the window', () => {
    // sqrt(20/20) = 1, sqrt(40/20) clamped to 1 too — 20 and 40 rides must
    // therefore produce identical scales for a homogeneous sample.
    const acts20 = Array.from({ length: 20 }, (_, i) => ride(i * 3, { average_speed: 8, distance: 40000 }));
    const acts40 = Array.from({ length: 40 }, (_, i) => ride(i * 1.5, { average_speed: 8, distance: 40000 }));
    const skills20 = calculateAllSkills(acts20, { asOf: NOW });
    const skills40 = calculateAllSkills(acts40, { asOf: NOW });
    expect(skills20.climbing).toBe(skills40.climbing);
    expect(skills20.tempo).toBe(skills40.tempo);
  });

  it('only counts activities within [asOf-90d, asOf] for the windowed scales', () => {
    const inWindow = ride(30, { distance: 40000, average_speed: 8 });
    const outOfWindow = ride(200, { distance: 400000, average_speed: 20, total_elevation_gain: 5000 });

    const withOutOfWindow = calculateAllSkills([inWindow, outOfWindow], { asOf: NOW });
    const withoutOutOfWindow = calculateAllSkills([inWindow], { asOf: NOW });

    // The out-of-window activity is a huge outlier (would dominate every
    // scale if counted) — its presence must not change the result at all.
    expect(withOutOfWindow).toEqual(withoutOutOfWindow);
  });

  it('computes exact, deterministic values for a fixed 40-ride sample (regression snapshot)', () => {
    const acts = Array.from({ length: 40 }, (_, i) =>
      ride(i * 2, {
        distance: 45000,
        total_elevation_gain: 300,
        moving_time: 5400,
        average_speed: 8.5,
        max_speed: 13,
        average_heartrate: 145,
      }),
    );
    const skills = calculateAllSkills(acts, { asOf: NOW, summary: { vo2max: 55, lthr: 165 } });

    // Computed once by running the ported function and pinned here —
    // any future change to the formula must consciously update this.
    expect(skills).toEqual({ climbing: 47, sprint: 59, endurance: 60, tempo: 80, power: 0, consistency: 83 });

    for (const v of Object.values(skills)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('is monotonic in confidence: more of the same ride never lowers a corrected scale', () => {
    const base = { distance: 45000, total_elevation_gain: 300, average_speed: 8.5, max_speed: 13, average_heartrate: 145 };
    const few = calculateAllSkills(Array.from({ length: 4 }, (_, i) => ride(i * 5, base)), { asOf: NOW });
    const more = calculateAllSkills(Array.from({ length: 12 }, (_, i) => ride(i * 3, base)), { asOf: NOW });
    const most = calculateAllSkills(Array.from({ length: 25 }, (_, i) => ride(i * 2, base)), { asOf: NOW });

    expect(few.climbing).toBeLessThanOrEqual(more.climbing);
    expect(more.climbing).toBeLessThanOrEqual(most.climbing);
    expect(few.tempo).toBeLessThanOrEqual(more.tempo);
    expect(more.tempo).toBeLessThanOrEqual(most.tempo);
  });

  it('uses an optional powerStats override instead of the raw-activity fallback', () => {
    const acts = Array.from({ length: 25 }, (_, i) => ride(i * 3, { weighted_average_watts: 90 }));
    const withOverride = calculateAllSkills(acts, { asOf: NOW, powerStats: { avgPower: 300 } });
    const withFallback = calculateAllSkills(acts, { asOf: NOW });
    expect(withOverride.power).toBeGreaterThan(withFallback.power);
  });

  it('determines "Climber" for a climbing-heavy fixture', () => {
    const acts = climberFixture();
    const skills = calculateAllSkills(acts, { asOf: NOW });
    const profile = determineRiderProfile(skills);
    expect(skills.climbing).toBeGreaterThan(skills.sprint);
    expect(skills.climbing).toBeGreaterThan(skills.tempo);
    expect(profile.profile).toBe('Climber');
    expect(profile.emoji).toBe('🏔️');
  });
});

describe('calculateAllSkills — integer output', () => {
  it('rounds every scale, including consistency (skills_history columns are INTEGER)', () => {
    // 3 rides in one week, 4 in the next, none in others → fractional
    // week-frequency stddev → non-integer raw consistency.
    const rides: StravaActivity[] = [];
    [3, 4, 0, 2, 0, 5, 1, 0].forEach((n, w) => {
      for (let c = 0; c < n; c++) rides.push(ride(w * 7 + c));
    });
    const skills = calculateAllSkills(rides, { asOf: NOW });
    for (const [key, value] of Object.entries(skills)) {
      expect(Number.isInteger(value), `${key}=${value}`).toBe(true);
    }
  });
});

describe('determineRiderProfile', () => {
  it('returns "Unknown" for null/undefined input', () => {
    expect(determineRiderProfile(null).profile).toBe('Unknown');
    expect(determineRiderProfile(undefined).profile).toBe('Unknown');
  });

  it('returns "All-Rounder" for balanced high scores', () => {
    const skills = { climbing: 60, sprint: 62, endurance: 58, tempo: 61, power: 59, consistency: 60 };
    expect(determineRiderProfile(skills).profile).toBe('All-Rounder');
  });
});
