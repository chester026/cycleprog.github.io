import { describe, expect, it } from 'vitest';
import {
  GOAL_TYPE_I18N_KEYS,
  GOAL_TYPE_LABELS,
  GOAL_TYPE_UNITS,
  LEGACY_GOAL_TYPES,
  TIER_CONFIG,
  getGoalTypeLabel,
  getGoalUnit,
} from './goalTypes.js';

describe('getGoalTypeLabel / getGoalUnit', () => {
  it('returns the English label/unit for every legacy goal type', () => {
    for (const type of LEGACY_GOAL_TYPES) {
      expect(getGoalTypeLabel(type)).toBe(GOAL_TYPE_LABELS[type]);
      expect(getGoalUnit(type)).toBe(GOAL_TYPE_UNITS[type]);
    }
  });

  it('falls back to the raw value / empty string for an unknown goal type', () => {
    expect(getGoalTypeLabel('something_new')).toBe('something_new');
    expect(getGoalUnit('something_new')).toBe('');
  });

  it('matches the known GoalDetailPage.jsx / GoalDetailsScreen.tsx values', () => {
    expect(getGoalTypeLabel('avg_power')).toBe('Average Power');
    expect(getGoalUnit('avg_power')).toBe('W');
    expect(getGoalTypeLabel('ftp_vo2max')).toBe('FTP/VO2max');
    expect(getGoalUnit('recovery')).toBe('rides');
  });
});

describe('GOAL_TYPE_I18N_KEYS', () => {
  it('has an entry for every legacy goal type', () => {
    for (const type of LEGACY_GOAL_TYPES) {
      expect(GOAL_TYPE_I18N_KEYS[type]).toBeDefined();
      expect(GOAL_TYPE_I18N_KEYS[type].labelKey).toMatch(/^goalDetails\./);
    }
  });
});

describe('TIER_CONFIG', () => {
  it('has all four meta-goal tiers', () => {
    expect(Object.keys(TIER_CONFIG).sort()).toEqual(['base', 'epic', 'grand', 'legendary'].sort());
  });

  it('uses the 2-of-3 majority color for the base tier', () => {
    expect(TIER_CONFIG.base.color).toBe('#ccc');
  });

  it('matches the colors all three copies agreed on', () => {
    expect(TIER_CONFIG.legendary.color).toBe('#FC5200');
    expect(TIER_CONFIG.epic.color).toBe('#8B5CF6');
    expect(TIER_CONFIG.grand.color).toBe('#274dd3');
  });
});
