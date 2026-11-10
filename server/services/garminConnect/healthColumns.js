// garmin_health_days value columns and their SQL types, in table order
// (migration 1758000000020). The one list the transport mappers
// (personalHealth.js), the repository's upsert and its readers are all built
// from — add a column here and in a migration, nowhere else.
const HEALTH_COLUMN_TYPES = {
  sleep_seconds: 'int', deep_sleep_seconds: 'int', light_sleep_seconds: 'int', rem_sleep_seconds: 'int',
  awake_seconds: 'int', nap_seconds: 'int', sleep_score: 'int',
  sleep_avg_hr: 'real', sleep_avg_stress: 'real', sleep_respiration: 'real', spo2_avg: 'real',
  hrv_last_night_ms: 'real', hrv_weekly_avg_ms: 'real', hrv_status: 'text',
  resting_hr: 'int', min_hr: 'int', max_hr: 'int',
  stress_avg: 'int', stress_max: 'int', stress_qualifier: 'text',
  stress_rest_seconds: 'int', stress_low_seconds: 'int', stress_medium_seconds: 'int', stress_high_seconds: 'int',
  body_battery_high: 'int', body_battery_low: 'int', body_battery_charged: 'int', body_battery_drained: 'int',
  respiration_avg: 'real', steps: 'int',
};
const HEALTH_COLUMNS = Object.keys(HEALTH_COLUMN_TYPES);

module.exports = { HEALTH_COLUMN_TYPES, HEALTH_COLUMNS };
