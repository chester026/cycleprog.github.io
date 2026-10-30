import { describe, expect, it } from 'vitest';
import {
  EFFORT_SCORE_BUCKETS,
  OVERTRAINING_RISK_BUCKETS,
  RECOVERY_SCORE_BUCKETS,
  getEffortLevel,
  getRecoveryLevel,
} from './coachBuckets.js';

describe('getEffortLevel', () => {
  it('uses inclusive upper bounds, higher score = more intense', () => {
    expect(getEffortLevel(0)).toBe('recovery');
    expect(getEffortLevel(20)).toBe('recovery');
    expect(getEffortLevel(21)).toBe('easy');
    expect(getEffortLevel(40)).toBe('easy');
    expect(getEffortLevel(55)).toBe('moderate');
    expect(getEffortLevel(70)).toBe('tempo');
    expect(getEffortLevel(82)).toBe('hard');
    expect(getEffortLevel(90)).toBe('heavy');
    expect(getEffortLevel(100)).toBe('exhausted');
  });

  it('treats anything past the table (or NaN) as exhausted', () => {
    expect(getEffortLevel(140)).toBe('exhausted');
    expect(getEffortLevel(Number.NaN)).toBe('exhausted');
  });
});

describe('getRecoveryLevel', () => {
  it('uses inclusive lower bounds, higher score = better recovered', () => {
    expect(getRecoveryLevel(100)).toBe('peak');
    expect(getRecoveryLevel(85)).toBe('peak');
    expect(getRecoveryLevel(84)).toBe('good');
    expect(getRecoveryLevel(70)).toBe('good');
    expect(getRecoveryLevel(55)).toBe('moderate');
    expect(getRecoveryLevel(30)).toBe('low');
    expect(getRecoveryLevel(0)).toBe('veryLow');
  });

  it('treats a score below the table (or NaN) as very low', () => {
    expect(getRecoveryLevel(-1)).toBe('veryLow');
    expect(getRecoveryLevel(Number.NaN)).toBe('veryLow');
  });
});

describe('bucket tables', () => {
  it('are ordered so the first match wins (effort ascending, recovery/risk descending)', () => {
    const maxes = EFFORT_SCORE_BUCKETS.map((b) => b.max);
    expect(maxes).toEqual([...maxes].sort((a, b) => a - b));
    const recoveryMins = RECOVERY_SCORE_BUCKETS.map((b) => b.min);
    expect(recoveryMins).toEqual([...recoveryMins].sort((a, b) => b - a));
    const riskMins = OVERTRAINING_RISK_BUCKETS.map((b) => b.min);
    expect(riskMins).toEqual([...riskMins].sort((a, b) => b - a));
  });
});
