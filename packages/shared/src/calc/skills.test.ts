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

// 20 identical activities spread over the last 20 days -> confidenceFactor
// = min(1, sqrt(20/20)) = 1, so every confidence-corrected scale reduces to
// Math.round(raw value) with no scaling — lets each band-boundary test
// below assert an exact, hand-derived integer.
function shapeSkills(overrides: Partial<StravaActivity>, opts: Parameters<typeof calculateAllSkills>[1] = { asOf: NOW }) {
  const acts = Array.from({ length: 20 }, (_, i) => ride(i, overrides));
  return calculateAllSkills(acts, opts);
}

describe('calculateClimbing — density-score bands (non-mountain: elevation 150 <= 350, so vamScore/vamHRScore fall back to densityScore)', () => {
  // elevation fixed at 150 (>100 so it counts, <=350 so it never qualifies
  // as a "mountain" ride regardless of distance) -> climbing == densityScore
  // exactly (weights 0.65+0.25+0.1 sum to 1, and vamScore/vamHRScore both
  // fall back to densityScore when there are no mountain rides at all).
  it.each([
    [100, 10], // <200: (100/200)*20 = 10
    [350, 30], // 200-500: 20 + (150/300)*20 = 30
    [750, 50], // 500-1000: 40 + (250/500)*20 = 50
    [1250, 68], // 1000-1500: 60 + (250/500)*15 = 67.5 -> round 68
    [1750, 83], // 1500-2000: 75 + (250/500)*15 = 82.5 -> round 83
    [2500, 95], // 2000-3000: 90 + (500/1000)*10 = 95
    [5000, 100], // >=3000: flat 100
  ])('avgElevationPer100km=%i -> climbing=%i', (target, expected) => {
    const distanceKm = (150 * 100) / target;
    const skills = shapeSkills({ total_elevation_gain: 150, distance: distanceKm * 1000, average_heartrate: undefined });
    expect(skills.climbing).toBe(expected);
  });
});

describe('calculateClimbing — VAM-curve bands (mountain rides: elevation 400 > 350, distance 10km -> elevationPerKm 40 > 15)', () => {
  // distance fixed at 10km -> avgElevationPer100km = 4000 -> densityScore =
  // 100 (the ">=3000" band) for every case here. With no HR data,
  // tempoHRMountainRides stays empty -> vamHRScore falls back to vamScore,
  // and weights are density 0.65 / vam 0.25 / vamHR 0.1 (the "<3" branch) ->
  // climbing = round(min(100, 65 + vamCurve(vam) * 0.35)).
  it.each([
    [100, 65], // vam<150: vamCurve=0 -> 65 + 0 = 65
    [175, 69], // 150-200: 10 -> 65+3.5=68.5 -> round 69
    [250, 76], // 200-300: 30 -> 65+10.5=75.5 -> round 76
    [375, 82], // 300-450: 47.5 -> 65+16.625=81.625 -> round 82
    [525, 86], // 450-600: 60 -> 65+21=86
    [700, 90], // 600-800: 72.5 -> 65+25.375=90.375 -> round 90
    [1000, 97], // 800-1200: 90 -> 65+31.5=96.5 -> round 97
    [1500, 100], // >=1200: 100 -> 65+35=100
  ])('vam=%i -> climbing=%i', (vamTarget, expected) => {
    const movingTime = (400 * 3600) / vamTarget;
    const skills = shapeSkills({ total_elevation_gain: 400, distance: 10000, moving_time: movingTime, average_heartrate: undefined });
    expect(skills.climbing).toBe(expected);
  });

  it('uses HR-filtered mountain rides (vamHRScore) and the ">=3" weight tier once 3+ tempo-HR mountain rides exist', () => {
    // Same mountain shape (elevation 400, distance 10km, densityScore 100),
    // vam=500 (450-600 band -> vamScore = 55 + (50/150)*10 = 58.333...).
    // average_heartrate 150 sits inside the default LTHR(165)-based tempo
    // band [round(165*.85)=140, round(165*.95)=157] -> every ride is also a
    // tempoHRMountainRide -> weights become density 0.65 / vam 0.15 / vamHR 0.2
    // (the ">=3" branch), and vamHRScore == vamScore (identical activities).
    const movingTime = (400 * 3600) / 500;
    const skills = shapeSkills({ total_elevation_gain: 400, distance: 10000, moving_time: movingTime, average_heartrate: 150 });
    const vamScore = 55 + ((500 - 450) / 150) * 10;
    const expected = Math.round(Math.min(100, 100 * 0.65 + vamScore * 0.15 + vamScore * 0.2));
    expect(skills.climbing).toBe(expected);
  });
});

describe('calculateSprint — max-speed and variability bands', () => {
  // Flat-ride qualifier: elevationRate<10, distance>10km, avgSpeedKmh>=22.
  // distance=20km, elevation=50 (rate 2.5<10), average_speed=8m/s(28.8km/h>=22).
  it.each([
    [25, 0], // <30: 0
    [35, 10], // 30-40: ((35-30)/10)*20 = 10
    [42, 26], // 40-45: 20+((42-40)/5)*15 = 26
    [47, 45], // 45-50: 35+((47-45)/5)*25 = 45
    [52, 68], // 50-55: 60+((52-50)/5)*20 = 68
    [60, 90], // 55-65: 80+((60-55)/10)*20 = 90
    [70, 100], // >=65: 100
  ])('medianMaxSpeed=%i km/h -> maxSpeedScore drives the blended sprint score', (maxSpeedKmh, maxSpeedScore) => {
    // No max_speed/average_speed pairing variability data beyond these ->
    // variabilityScore uses the (maxKmh-avgKmh)/avgKmh of the SAME ride, so
    // compute it directly rather than re-deriving a second target band.
    const avgSpeedMs = 8;
    const maxSpeedMs = maxSpeedKmh / 3.6;
    const skills = shapeSkills({
      distance: 20000,
      total_elevation_gain: 50,
      average_speed: avgSpeedMs,
      max_speed: maxSpeedMs,
      average_heartrate: undefined,
    });
    const avgKmh = avgSpeedMs * 3.6;
    const variability = (maxSpeedKmh - avgKmh) / avgKmh;
    let variabilityScore: number;
    if (variability < 0.1) variabilityScore = 0;
    else if (variability < 0.2) variabilityScore = ((variability - 0.1) / 0.1) * 20;
    else if (variability < 0.3) variabilityScore = 20 + ((variability - 0.2) / 0.1) * 20;
    else if (variability < 0.45) variabilityScore = 40 + ((variability - 0.3) / 0.15) * 30;
    else if (variability < 0.6) variabilityScore = 70 + ((variability - 0.45) / 0.15) * 20;
    else if (variability < 0.8) variabilityScore = 90 + ((variability - 0.6) / 0.2) * 10;
    else variabilityScore = 100;
    const expected = Math.round(Math.min(100, maxSpeedScore * 0.6 + variabilityScore * 0.4));
    expect(skills.sprint).toBe(expected);
  });

  it('returns exactly 30 when there are no qualifying flat rides', () => {
    const skills = shapeSkills({ distance: 1000, total_elevation_gain: 50, average_speed: 8 }); // too short (<=10km)
    expect(skills.sprint).toBe(30);
  });

  it('falls back medianVariability to 0 when no flat ride has both max_speed and average_speed', () => {
    const skills = shapeSkills({
      distance: 20000,
      total_elevation_gain: 50,
      average_speed: 8,
      max_speed: undefined, // excluded from the variability sample entirely
      average_heartrate: undefined,
    });
    // variability=0 -> variabilityScore=0; maxSpeedsFlat uses (max_speed||0) -> medianMaxSpeed 0 -> maxSpeedScore 0.
    expect(skills.sprint).toBe(0);
  });
});

describe('calculateEndurance — volume and VO2max bands', () => {
  // avgWeeklyKm = totalDistance(km) / 12. 20 rides of `distanceKm` each.
  it.each([
    [10, 0], // <20: 0
    [35, 10], // 20-50: 5+((35-20)/30)*10 = 10
    [65, 20], // 50-80
    [100, 32.5], // 80-120
    [185, 47.5], // 120-250
    [300, 60], // 250-350
    [425, 67.5], // 350-500
    [600, 70], // >=500
  ])('avgWeeklyKm=%i -> volumeScore=%i (no VO2max data)', (avgWeeklyKm, expectedVolumeScore) => {
    const totalDistanceKm = avgWeeklyKm * 12;
    const distancePerRideKm = totalDistanceKm / 20;
    const skills = shapeSkills({ distance: distancePerRideKm * 1000, average_heartrate: undefined });
    expect(skills.endurance).toBe(Math.round(Math.min(100, expectedVolumeScore)));
  });

  it.each([
    [10, 0], // <20: 0
    [25, 2.5], // 20-30: ((25-20)/10)*5
    [35, 7.5], // 30-40: 5+((35-30)/10)*5
    [45, 12.5], // 40-50: 10+((45-40)/10)*5
    [60, 19], // 50-75: 15+((60-50)/25)*10
    [80, 27.5], // 75-85: 25+((80-75)/10)*5
    [90, 30], // >=85: 30
  ])('vo2max=%i adds vo2maxScore=%i on top of a zero-volume baseline', (vo2max, vo2maxScore) => {
    // avgWeeklyKm well under 20 -> volumeScore 0 -> endurance == round(vo2maxScore).
    const skills = shapeSkills({ distance: 1000, average_heartrate: undefined }, { asOf: NOW, summary: { vo2max } });
    expect(skills.endurance).toBe(Math.round(Math.min(100, vo2maxScore)));
  });
});

describe('calculateTempo — speed and efficiency bands', () => {
  // Flat-ride qualifier here: elevationRate<10, distance>20km (stricter than sprint's >10km).
  it.each([
    [10, 0], // <12: 0
    [13.5, 10], // 12-15: 5+((13.5-12)/3)*10
    [16.5, 20], // 15-18: 15+((16.5-15)/3)*10
    [20, 32.5], // 18-22: 25+((20-18)/4)*15
    [23.5, 47.5], // 22-25: 40+((23.5-22)/3)*15
    [26.5, 62.5], // 25-28: 55+((26.5-25)/3)*15
    [30, 77.5], // 28-32: 70+((30-28)/4)*15
    [34, 90], // 32-36: 85+((34-32)/4)*10
    [38, 97.5], // 36-40: 95+((38-36)/4)*5
    [45, 100], // >=40: 100
  ])('medianSpeed=%i km/h -> speedScore=%i (no HR data -> efficiencyScore falls back to speedScore)', (speedKmh, speedScore) => {
    const skills = shapeSkills({
      distance: 25000,
      total_elevation_gain: 50,
      average_speed: speedKmh / 3.6,
      average_heartrate: undefined,
    });
    // efficiencyScore falls back to speedScore -> tempo = round(speedScore*0.5+speedScore*0.5) = round(speedScore).
    expect(skills.tempo).toBe(Math.round(Math.min(100, speedScore)));
  });

  it('returns exactly 0 when there are no qualifying flat rides', () => {
    const skills = shapeSkills({ distance: 1000, total_elevation_gain: 50 }); // too short (<=20km)
    expect(skills.tempo).toBe(0);
  });

  // Efficiency = speed(km/h) / hr, and both speedScore and efficiencyScore
  // depend on the SAME ride's speed, so a fixed HR (145, comfortably inside
  // the [130,160] tempoHRRide band) plus a chosen speed pins both bands at
  // once. Expected values are derived by transcribing the two documented
  // band formulas (module source, `calculateTempo`) rather than by calling
  // the function under test.
  function speedScoreOf(speedKmh: number): number {
    if (speedKmh < 12) return 0;
    if (speedKmh < 15) return 5 + ((speedKmh - 12) / 3) * 10;
    if (speedKmh < 18) return 15 + ((speedKmh - 15) / 3) * 10;
    if (speedKmh < 22) return 25 + ((speedKmh - 18) / 4) * 15;
    if (speedKmh < 25) return 40 + ((speedKmh - 22) / 3) * 15;
    if (speedKmh < 28) return 55 + ((speedKmh - 25) / 3) * 15;
    if (speedKmh < 32) return 70 + ((speedKmh - 28) / 4) * 15;
    if (speedKmh < 36) return 85 + ((speedKmh - 32) / 4) * 10;
    if (speedKmh < 40) return 95 + ((speedKmh - 36) / 4) * 5;
    return 100;
  }
  function efficiencyScoreOf(efficiency: number): number {
    if (efficiency < 0.1) return 0;
    if (efficiency < 0.13) return ((efficiency - 0.1) / 0.03) * 20;
    if (efficiency < 0.15) return 20 + ((efficiency - 0.13) / 0.02) * 20;
    if (efficiency < 0.18) return 40 + ((efficiency - 0.15) / 0.03) * 20;
    if (efficiency < 0.21) return 60 + ((efficiency - 0.18) / 0.03) * 20;
    if (efficiency < 0.25) return 80 + ((efficiency - 0.21) / 0.04) * 15;
    return 95 + Math.min(((efficiency - 0.25) / 0.05) * 5, 5);
  }

  it.each([11.6, 16.675, 20.3, 23.925, 28.275, 33.35, 43.5])(
    'medianSpeed=%f km/h at a fixed 145bpm HR exercises a distinct speedScore/efficiencyScore band pair',
    (speedKmh) => {
      const hr = 145;
      const efficiency = speedKmh / hr;
      const skills = shapeSkills({
        distance: 25000,
        total_elevation_gain: 50,
        average_speed: speedKmh / 3.6,
        average_heartrate: hr,
      });
      const expected = Math.round(Math.min(100, speedScoreOf(speedKmh) * 0.5 + Math.min(100, efficiencyScoreOf(efficiency)) * 0.5));
      expect(skills.tempo).toBe(expected);
    },
  );
});

describe('calculatePower — power bands (via opts.powerStats override)', () => {
  it.each([
    [50, 0], // <60: 0
    [70, 7.5], // 60-80: ((70-60)/20)*15
    [90, 22.5], // 80-100: 15+((90-80)/20)*15
    [110, 35], // 100-120: 30+((110-100)/20)*10
    [160, 50], // 120-200: 40+((160-120)/80)*20
    [240, 70], // 200-280: 60+((240-200)/80)*20
    [310, 87.5], // 280-340: 80+((310-280)/60)*15
    [400, 97.5], // 340-450: 95+((400-340)/110)*5
    [500, 100], // >=450: 100
  ])('avgPower=%i -> power=%i', (avgPower, expected) => {
    const skills = shapeSkills({ average_heartrate: undefined }, { asOf: NOW, powerStats: { avgPower } });
    expect(skills.power).toBe(Math.round(Math.min(100, expected)));
  });

  it('returns exactly 0 when powerStats.avgPower is 0 (falsy)', () => {
    const skills = shapeSkills({}, { asOf: NOW, powerStats: { avgPower: 0 } });
    expect(skills.power).toBe(0);
  });

  it('falls back to a raw-activity estimate (weighted_average_watts, then average_watts) when powerStats is omitted', () => {
    const skills = shapeSkills({ weighted_average_watts: 250, average_watts: 999 });
    expect(skills.power).toBeGreaterThan(0);
  });
});

describe('determineRiderProfile — remaining profile branches', () => {
  it('"Consistent Trainer": consistency > 75 and far above the average skill', () => {
    const skills = { climbing: 30, sprint: 30, endurance: 30, tempo: 30, power: 30, consistency: 90 };
    expect(determineRiderProfile(skills).profile).toBe('Consistent Trainer');
  });

  it('"Time Trialist": tempo and power both >= 60 and their average well above the overall average', () => {
    const skills = { climbing: 40, sprint: 40, endurance: 40, tempo: 70, power: 70, consistency: 40 };
    expect(determineRiderProfile(skills).profile).toBe('Time Trialist');
  });

  it.each([
    [{ climbing: 40, sprint: 90, endurance: 40, tempo: 40, power: 40, consistency: 40 }, 'Sprinter'],
    [{ climbing: 40, sprint: 40, endurance: 90, tempo: 40, power: 40, consistency: 40 }, 'Endurance Rider'],
    [{ climbing: 40, sprint: 40, endurance: 40, tempo: 90, power: 40, consistency: 40 }, 'Tempo Specialist'],
    [{ climbing: 40, sprint: 40, endurance: 40, tempo: 40, power: 90, consistency: 40 }, 'Power House'],
  ])('dominant single skill %o -> %s', (skills, expectedProfile) => {
    expect(determineRiderProfile(skills).profile).toBe(expectedProfile);
  });

  it('falls to "Versatile Rider" (Adapting) via the switch default when the dominant skill is consistency', () => {
    const skills = { climbing: 40, sprint: 40, endurance: 40, tempo: 40, power: 40, consistency: 59 };
    const profile = determineRiderProfile(skills);
    expect(profile.profile).toBe('Versatile Rider');
    expect(profile.description).toBe('Adapting to any challenge');
  });

  it('"Mountain Endurance": climbing on top, endurance second, without a >10 dominance gap', () => {
    const skills = { climbing: 50, sprint: 40, endurance: 48, tempo: 40, power: 40, consistency: 40 };
    expect(determineRiderProfile(skills).profile).toBe('Mountain Endurance');
  });

  it('"Explosive Sprinter": sprint on top, power second, without a >10 dominance gap', () => {
    const skills = { climbing: 40, sprint: 50, endurance: 40, tempo: 40, power: 48, consistency: 40 };
    expect(determineRiderProfile(skills).profile).toBe('Explosive Sprinter');
  });

  it('falls to the final "Versatile Rider" (Growing) when no other rule matches', () => {
    const skills = { climbing: 50, sprint: 40, endurance: 40, tempo: 48, power: 40, consistency: 40 };
    const profile = determineRiderProfile(skills);
    expect(profile.profile).toBe('Versatile Rider');
    expect(profile.description).toBe('Growing in all areas');
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

describe('calculateAllSkills — top-level fallbacks', () => {
  it('treats a null activities list as empty (matches undefined/[])', () => {
    const skills = calculateAllSkills(null, { asOf: NOW });
    expect(skills).toEqual({ climbing: 0, sprint: 0, endurance: 0, tempo: 0, power: 0, consistency: 0 });
  });

  it('defaults asOf to the current clock when omitted', () => {
    const skills = calculateAllSkills([ride(1)], {});
    for (const v of Object.values(skills)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('per-scale robustness against activities with missing distance/elevation/time/speed fields', () => {
  // Each entry below targets one specific `|| 0`/ternary fallback that only
  // fires when that ride qualifies for its scale's filter/subset despite a
  // missing field — every well-formed ride around it keeps every other
  // scale non-degenerate so this stays a realistic mixed batch, not a
  // contrived all-empty list.
  function wellFormed(i: number): StravaActivity {
    return ride(i, { distance: 30000, total_elevation_gain: 150, average_speed: 8, max_speed: 12, average_heartrate: 145 });
  }

  it('climbing: a qualifying ride (elevation>100) with distance missing, and a mountain ride with moving_time missing, do not throw or NaN', () => {
    const acts = [
      ...Array.from({ length: 18 }, (_, i) => wellFormed(i)),
      ride(18, { total_elevation_gain: undefined, distance: 30000 }), // excluded from ridesWithElevation (elevation fallback)
      ride(19, { total_elevation_gain: 150, distance: undefined }), // included, distance fallback (per100km ternary -> 0)
    ];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.climbing)).toBe(true);
    expect(skills.climbing).toBeGreaterThanOrEqual(0);
    expect(skills.climbing).toBeLessThanOrEqual(100);
  });

  it('climbing: a mountain ride (elevation>350, steep) with moving_time missing does not throw or NaN (vamOf timeHours fallback)', () => {
    const acts = [
      ...Array.from({ length: 19 }, (_, i) => wellFormed(i)),
      ride(19, { total_elevation_gain: 400, distance: 5000, moving_time: undefined }), // mountain, vam undefined -> 0
    ];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.climbing)).toBe(true);
  });

  it('sprint: a ride with distance/elevation/average_speed all missing runs through the flat-ride filter without throwing', () => {
    const acts = [
      ...Array.from({ length: 19 }, (_, i) => wellFormed(i)),
      ride(19, { distance: undefined, total_elevation_gain: undefined, average_speed: undefined }),
    ];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.sprint)).toBe(true);
  });

  it('endurance: a ride with distance missing contributes 0 to totalDistance without throwing', () => {
    const acts = [...Array.from({ length: 19 }, (_, i) => wellFormed(i)), ride(19, { distance: undefined })];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.endurance)).toBe(true);
  });

  it('tempo: a ride with distance/elevation missing runs through the flat-ride filter, and a qualifying flat ride with average_speed missing runs through the speed map, without throwing', () => {
    const acts = [
      ...Array.from({ length: 18 }, (_, i) => wellFormed(i)),
      ride(18, { distance: undefined, total_elevation_gain: undefined }),
      ride(19, { distance: 30000, total_elevation_gain: 50, average_speed: undefined }),
    ];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.tempo)).toBe(true);
  });

  it('tempo: a tempo-HR-range ride with average_speed missing runs through the efficiency map without throwing', () => {
    const acts = [
      ...Array.from({ length: 19 }, (_, i) => wellFormed(i)),
      ride(19, { distance: 30000, total_elevation_gain: 50, average_heartrate: 145, average_speed: undefined }),
    ];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.tempo)).toBe(true);
  });

  it('tempo: falls efficiencyScore back to 0 when every tempo-HR ride has a non-positive speed (efficiencies all filtered out)', () => {
    // Every flat, tempo-HR-range ride here has average_speed 0 -> speed/hr
    // is 0 for all of them -> `.filter(e => e > 0)` empties `efficiencies`
    // even though `tempoHRRides.length > 0` -> efficiencyScore stays at its
    // initial 0 (distinct from the "no tempoHRRides at all" fallback-to-
    // speedScore path, which is already covered elsewhere).
    const acts = Array.from({ length: 20 }, (_, i) =>
      ride(i, { distance: 30000, total_elevation_gain: 50, average_speed: 0, average_heartrate: 145 }),
    );
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.tempo)).toBe(true);
    expect(skills.tempo).toBe(0); // speedScore 0 (medianSpeed 0) blended with efficiencyScore 0
  });

  it('consistency: a ride within the last 8 weeks with distance missing contributes 0 to that week\'s totalDistance without throwing', () => {
    const acts = [...Array.from({ length: 19 }, (_, i) => wellFormed(i)), ride(5, { distance: undefined })];
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(Number.isFinite(skills.consistency)).toBe(true);
  });

  it('consistency: returns 0 when every activity falls outside the last-8-weeks window (even though it is within the 90-day skills window)', () => {
    // 70 days ago: inside calculateAllSkills' 90-day window (so climbing/etc
    // are computed normally) but outside calculateConsistency's own 8-week
    // (56-day) window, which reads from `all`, not `recentActivities`.
    const acts = Array.from({ length: 20 }, (_, i) => wellFormed(70 + i));
    const skills = calculateAllSkills(acts, { asOf: NOW });
    expect(skills.consistency).toBe(0);
    expect(skills.climbing).toBeGreaterThan(0); // sanity: the 90-day scales still saw these rides
  });
});
