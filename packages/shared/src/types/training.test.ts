import { describe, expect, it } from 'vitest';
import { TrainingTypeSchema } from './training.js';

describe('TrainingTypeSchema', () => {
  it('parses a realistic training-types.json entry', () => {
    const parsed = TrainingTypeSchema.parse({
      key: 'endurance',
      name: 'Endurance',
      description: 'Long rides to improve base fitness and aerobic endurance',
      intensity: '60-75% FTP',
      duration: '2-4 hours',
      cadence: '80-90 rpm',
      hr_zones: 'Z2-Z3',
      goals: ['long_rides', 'elevation'],
      benefits: ['Improve base endurance'],
      structure: { warmup: '15-20 minutes warmup (60-70% FTP)' },
      technical_aspects: ['Maintain steady pace'],
    });
    expect(parsed.key).toBe('endurance');
  });

  it('rejects a missing name', () => {
    const result = TrainingTypeSchema.safeParse({ key: 'x' });
    expect(result.success).toBe(false);
  });
});
