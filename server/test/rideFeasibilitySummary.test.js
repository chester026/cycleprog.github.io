const { buildFeasibilitySummary } = require('../lib/rideFeasibilitySummary');

const base = {
  target: { distanceKm: 160, elevationM: 3000, date: '2026-10-09' },
  comparableRides: [{ distanceKm: 150, elevationM: 2800, movingTimeH: 6, daysAgo: 30 }],
  personalBests: {
    longestRide: { distanceKm: 142.3, daysAgo: 42 },
    biggestClimb: { elevationM: 2410, daysAgo: 100 },
  },
  capability: { level: 'near', ratioDistance: 1.12, ratioElevation: 1.24 },
  load: {
    last7d: { hours: 4.2, km: 120 },
    chronicWeeklyAvg: { hours: 5.1 },
    acuteChronicRatio: 0.82,
    daysSinceLastRide: 2,
    daysSinceLastLongRide: 23,
  },
  freshness: 'normal',
};

describe('buildFeasibilitySummary', () => {
  it('writes the one-line digest the coach reads first', () => {
    expect(buildFeasibilitySummary(base)).toBe(
      'Target 160 km / 3000 m on 2026-10-09. Longest ride 142.3 km (6 weeks ago), biggest climb 2410 m (3 months ago). ' +
        'Closest comparable ride: 150 km / 2800 m, 6 h, 4 weeks ago. Capability: near (distance 112%, climbing 124% of PBs). ' +
        'Load: 7d 4.2 h (120 km) vs chronic 5.1 h/week (ACR 0.82), last ride 2 days ago, last 100+ km ride 3 weeks ago. Freshness: normal.'
    );
  });

  it('handles done capability, missing baselines and recent days', () => {
    const text = buildFeasibilitySummary({
      ...base,
      comparableRides: [],
      capability: { level: 'done', ratioDistance: 1, ratioElevation: null },
      load: { ...base.load, acuteChronicRatio: null, daysSinceLastRide: 0, daysSinceLastLongRide: null },
    });
    expect(text).toContain('Capability: done');
    expect(text).toContain('no chronic baseline, last ride today, no 100+ km ride yet');
    expect(text).not.toContain('Closest comparable');
  });

  it('prints n/a when climbing cannot be compared and yesterday / no-ride wording', () => {
    const text = buildFeasibilitySummary({
      ...base,
      capability: { level: 'beyond', ratioDistance: 2, ratioElevation: null },
      load: { ...base.load, daysSinceLastRide: null, daysSinceLastLongRide: 1 },
    });
    expect(text).toContain('Capability: beyond (distance 200%, climbing n/a of PBs).');
    expect(text).toContain('no ride in the load window, last 100+ km ride yesterday');
  });

  it('says so when there are no rides', () => {
    expect(buildFeasibilitySummary({ ...base, personalBests: null })).toBe(
      'Target 160 km / 3000 m on 2026-10-09. No synced rides to compare with, so capability and freshness cannot be judged.'
    );
  });
});
