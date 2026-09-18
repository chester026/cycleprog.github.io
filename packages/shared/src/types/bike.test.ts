import { describe, expect, it } from 'vitest';
import { BikeSchema } from './bike.js';

describe('BikeSchema', () => {
  it('parses a realistic GET /api/bikes item', () => {
    const bike = {
      id: 'b1234567',
      name: 'Canyon Ultimate CF SLX',
      distance: 12000000,
      distanceKm: 12000,
      primary: true,
      resource_state: 3,
      brand_name: 'Canyon',
      model_name: 'Ultimate CF SLX',
      activitiesCount: 87,
    };
    const parsed = BikeSchema.parse(bike);
    expect(parsed.name).toBe('Canyon Ultimate CF SLX');
    expect(parsed.primary).toBe(true);
  });

  it('rejects a missing required field (name)', () => {
    const result = BikeSchema.safeParse({ id: 'b1', primary: true, distanceKm: 0, activitiesCount: 0 });
    expect(result.success).toBe(false);
  });
});
