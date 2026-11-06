-- Activity-source goals written by the AI without `metric.transform` were
-- computing progress in Strava's raw units (m/s, metres, seconds) while the
-- goal's unit said km/h / km / h — a 16.9 km/h climbing-speed goal showed as
-- 4.7 (11/2026). computeGoalProgress now derives the transform from
-- (field, unit) on read (shared/calc impliedTransform) and aiGoals.js stores
-- it on write; this backfills the rows already in the table with the exact
-- same mapping so stored metrics are self-describing. Idempotent: only rows
-- with no `transform` key are touched.
UPDATE goals
SET metric = metric || jsonb_build_object('transform', t.factor)
FROM (VALUES
  ('average_speed',        'km/h', 3.6),
  ('max_speed',            'km/h', 3.6),
  ('average_speed',        'mph',  2.23694),
  ('max_speed',            'mph',  2.23694),
  ('distance',             'km',   0.001),
  ('total_elevation_gain', 'km',   0.001),
  ('distance',             'mi',   0.000621371),
  ('moving_time',          'h',    1.0 / 3600),
  ('moving_time',          'hours',1.0 / 3600),
  ('moving_time',          'min',  1.0 / 60)
) AS t(field, unit, factor)
WHERE metric IS NOT NULL
  AND metric->>'source' = 'activity'
  AND NOT (metric ? 'transform')
  AND metric->>'field' = t.field
  AND lower(trim(goals.unit)) = t.unit;
