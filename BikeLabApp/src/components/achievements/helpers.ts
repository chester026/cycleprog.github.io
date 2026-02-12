/**
 * Achievement helpers - formatting functions
 */

export function formatBadgeValue(threshold: number, metric: string): {value: string; unit: string} {
  if (metric === 'hr_intensity') {
    return {value: `${Math.round(threshold * 100)}`, unit: 'max HR'};
  }
  if (metric === 'hr_intensity_rides') {
    return {value: `${threshold}`, unit: 'rides'};
  }
  if (metric === 'weekly_streak') {
    return {value: `${threshold}`, unit: 'weeks'};
  }
  if (metric === 'total_distance' || metric === 'distance') {
    if (threshold >= 1000) return {value: `${(threshold / 1000).toFixed(0)}k`, unit: 'km'};
    return {value: `${threshold}`, unit: 'km'};
  }
  if (metric === 'total_elevation_gain' || metric === 'elevation_gain') {
    if (threshold >= 1000) return {value: `${(threshold / 1000).toFixed(0)}k`, unit: 'meters'};
    return {value: `${threshold}`, unit: 'meters'};
  }
  if (metric === 'average_speed' || metric === 'max_speed' || metric === 'focus_max_speed') {
    return {value: `${threshold}`, unit: 'km/h'};
  }
  if (metric === 'average_watts') {
    return {value: `${threshold}`, unit: 'watts'};
  }
  if (metric === 'average_cadence') {
    return {value: `${threshold}`, unit: 'rpm'};
  }
  return {value: `${threshold}`, unit: ''};
}

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
