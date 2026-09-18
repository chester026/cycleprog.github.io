/**
 * Achievement helpers - formatting functions
 */

// formatBadgeValue moved to @bikelab/shared/constants (T-2.4, reconciled
// with react-spa/src/utils/garageData.js's copy — same logic, switch vs
// if-chain) — re-exported so existing
// `from '../components/achievements/helpers'` import sites keep working.
export {formatBadgeValue} from '@bikelab/shared/constants';

export function formatProgressValue(value: number, metric: string): string {
  if (metric === 'hr_intensity') {
    return `${Math.round(value * 100)}%`;
  }
  if (metric === 'hr_intensity_rides' || metric === 'weekly_streak') {
    return `${Math.round(value)}`;
  }
  if (metric === 'total_distance' || metric === 'distance') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
  }
  if (metric === 'total_elevation_gain' || metric === 'elevation_gain') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
  }
  if (metric === 'average_speed' || metric === 'max_speed' || metric === 'focus_max_speed') {
    return `${value.toFixed(1)}`;
  }
  if (metric === 'average_watts' || metric === 'average_cadence') {
    return `${Math.round(value)}`;
  }
  return `${Math.round(value)}`;
}
