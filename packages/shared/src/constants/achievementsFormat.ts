/**
 * `formatBadgeValue` — reconciles `react-spa/src/utils/garageData.js:~263`
 * (switch statement) and `BikeLabApp/src/components/achievements/helpers.ts:5`
 * (if-chain) — identical logic, just different control flow (T-2.4,
 * docs/audit/layers/04-cross-layer.md §4.9, §6.1).
 *
 * The achievements API has no unit column — the unit is derived from
 * `metric`, so both surfaces label badges identically.
 */

export interface BadgeValue {
  value: string;
  unit: string;
}

export function formatBadgeValue(threshold: number, metric: string): BadgeValue {
  const t = Number(threshold) || 0;
  const asK = t >= 1000 ? `${Math.round(t / 1000)}k` : `${t}`;

  switch (metric) {
    case 'hr_intensity':
      return { value: `${Math.round(t * 100)}`, unit: 'max HR' };
    case 'hr_intensity_rides':
      return { value: `${t}`, unit: 'rides' };
    case 'weekly_streak':
      return { value: `${t}`, unit: 'weeks' };
    case 'total_distance':
    case 'distance':
      return { value: asK, unit: 'km' };
    case 'total_elevation_gain':
    case 'elevation_gain':
      return { value: asK, unit: 'meters' };
    case 'average_speed':
    case 'max_speed':
    case 'focus_max_speed':
      return { value: `${t}`, unit: 'km/h' };
    case 'average_watts':
      return { value: `${t}`, unit: 'watts' };
    case 'average_cadence':
      return { value: `${t}`, unit: 'rpm' };
    default:
      return { value: `${t}`, unit: '' };
  }
}
