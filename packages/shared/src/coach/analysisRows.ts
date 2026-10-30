/**
 * get_activity_analysis detail angles → card rows. Copy comes from the
 * client's `t`; this only decides which rows exist and which direction of
 * change counts as better.
 */
import type { ActivityAnalysisResult, MetricRow, SkillChange } from '../types/coachUi.js';

/** `t('ns.key')` — the client's translation function. */
export type TranslateKey = (key: string) => string;

// vs_baseline keys → label/unit keys and which direction is "better" (a
// green highlight means the same thing it always has in the app).
export const BASELINE_METRIC_SPECS: Record<
  string,
  { labelKey: string; unitKey: string; better: 'higher' | 'lower' }
> = {
  speed_kmh: { labelKey: 'common.avgSpeed', unitKey: 'common.kmh', better: 'higher' },
  hr_bpm: { labelKey: 'common.heartRate', unitKey: 'common.bpm', better: 'lower' },
  power_watts: { labelKey: 'common.power', unitKey: 'common.watts', better: 'higher' },
  cadence_rpm: { labelKey: 'common.cadence', unitKey: 'common.rpm', better: 'higher' },
};

// skills_delta keys → skill label keys (`consistency` is shown as "discipline").
export const SKILL_LABEL_KEYS: Record<string, string> = {
  climbing: 'skills.climbing',
  sprint: 'skills.sprint',
  endurance: 'skills.endurance',
  tempo: 'skills.tempo',
  power: 'skills.power',
  consistency: 'skills.discipline',
};

/** Ride vs the rider's rolling baseline, one row per known metric; unknown keys are skipped. */
export function buildBaselineRows(analysis: ActivityAnalysisResult, t: TranslateKey): MetricRow[] {
  return Object.entries(analysis.vs_baseline ?? {}).flatMap(([key, val]): MetricRow[] => {
    const spec = BASELINE_METRIC_SPECS[key];
    if (!spec) return [];
    const unit = t(spec.unitKey);
    return [
      {
        label: t(spec.labelKey),
        oldValue: `${val.avg} ${unit}`,
        newValue: `${val.ride} ${unit}`,
        isPositive: spec.better === 'higher' ? val.diff > 0 : val.diff < 0,
      },
    ];
  });
}

/**
 * This ride vs the most similar earlier one: distance always, then
 * speed/HR/power/cadence only when both rides have the value. Speed and
 * power carry a "better" direction; HR and cadence are neutral.
 */
export function buildSimilarRideRows(analysis: ActivityAnalysisResult, t: TranslateKey): MetricRow[] {
  const similar = analysis.similar_ride;
  const current = analysis.activity;
  if (!similar) return [];
  const rows: MetricRow[] = [
    {
      label: t('common.distance'),
      oldValue: `${similar.distance_km} ${t('common.km')}`,
      newValue: `${current.distance_km} ${t('common.km')}`,
    },
  ];
  if (similar.avg_speed_kmh && current.avg_speed_kmh) {
    rows.push({
      label: t('common.avgSpeed'),
      oldValue: `${similar.avg_speed_kmh} ${t('common.kmh')}`,
      newValue: `${current.avg_speed_kmh} ${t('common.kmh')}`,
      isPositive: current.avg_speed_kmh > similar.avg_speed_kmh,
    });
  }
  if (similar.avg_hr_bpm && current.avg_hr_bpm) {
    rows.push({
      label: t('common.heartRate'),
      oldValue: `${similar.avg_hr_bpm} ${t('common.bpm')}`,
      newValue: `${current.avg_hr_bpm} ${t('common.bpm')}`,
    });
  }
  if (similar.avg_watts && current.avg_watts) {
    rows.push({
      label: t('common.power'),
      oldValue: `${similar.avg_watts} ${t('common.watts')}`,
      newValue: `${current.avg_watts} ${t('common.watts')}`,
      isPositive: current.avg_watts > similar.avg_watts,
    });
  }
  if (similar.avg_cadence_rpm && current.avg_cadence_rpm) {
    rows.push({
      label: t('common.cadence'),
      oldValue: `${similar.avg_cadence_rpm} ${t('common.rpm')}`,
      newValue: `${current.avg_cadence_rpm} ${t('common.rpm')}`,
    });
  }
  return rows;
}

/** skills_delta → one SkillChange per changed skill; an unknown skill key is shown as-is. */
export function buildSkillChanges(analysis: ActivityAnalysisResult, t: TranslateKey): SkillChange[] {
  return Object.entries(analysis.skills_delta ?? {}).map(([key, val]) => ({
    name: t(SKILL_LABEL_KEYS[key] ?? key),
    previous: val.previous,
    current: val.current,
    diff: val.diff,
  }));
}
