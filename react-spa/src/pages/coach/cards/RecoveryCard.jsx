import React from 'react';
import { getRecoveryLevel } from '@bikelab/shared/constants';
import { CoachCard, Divider, StatusPill } from './CoachCardChrome';
import ProgressRing from './ProgressRing';
import { NEUTRAL_RING, RECOVERY_RINGS, hexToRgba } from './palette';
import { t } from '../copy';
import styles from './scoreCards.module.css';

const LEVEL_KEYS = {
  peak: 'coach.recoveryPeak',
  good: 'coach.recoveryGood',
  moderate: 'coach.recoveryModerate',
  low: 'coach.recoveryLow',
  veryLow: 'coach.recoveryVeryLow',
};

function buildRows(context) {
  const rows = [];
  if (context.sleep_hours != null) {
    const deep = context.sleep_deep_pct != null ? ` · ${Math.round(context.sleep_deep_pct)}% ${t('coach.recoveryDeep')}` : '';
    rows.push({ label: t('coach.recoverySleep'), value: `${context.sleep_hours.toFixed(1)}${t('common.h')}${deep}` });
  }
  if (context.resting_hr_bpm != null) {
    const baseline =
      context.resting_hr_baseline_bpm != null ? ` (${t('coach.recoveryBaseline')} ${Math.round(context.resting_hr_baseline_bpm)})` : '';
    rows.push({ label: t('coach.recoveryRestingHR'), value: `${context.resting_hr_bpm} ${t('common.bpm')}${baseline}` });
  }
  if (context.hrv_ms != null) {
    const baseline = context.hrv_baseline_ms != null ? ` (${t('coach.recoveryBaseline')} ${Math.round(context.hrv_baseline_ms)})` : '';
    rows.push({ label: t('coach.recoveryHRV'), value: `${Math.round(context.hrv_ms)} ${t('common.ms')}${baseline}` });
  }
  return rows;
}

/**
 * Recovery snapshot (shared `HealthContext` shape). On web the only source
 * is Oura, via `pickRecoveryContext` — the card itself is source-agnostic
 * and renders whichever numbers it was handed; a null score shows a
 * neutral ring and "Not enough data yet".
 */
export default function RecoveryCard({ context }) {
  const score = context.recovery_score;
  const level = score != null ? getRecoveryLevel(score) : null;
  const ring = level ? RECOVERY_RINGS[level] : NEUTRAL_RING;
  const color = ring[1];
  const rows = buildRows(context);

  return (
    <CoachCard glow={false} className={styles.cardWide} testId="recovery-card">
      <div className={styles.row}>
        <ProgressRing value={score ?? 0} colors={ring} gradientId="recoveryRing">
          {score != null ? (
            <>
              <span className={styles.scoreNumber}>{score}</span>
              <span className={styles.scoreOf}>/100</span>
            </>
          ) : (
            <span className={styles.noScoreDash}>—</span>
          )}
        </ProgressRing>
        <div className={styles.info}>
          <span className={styles.eyebrow}>{t('coach.recoveryScoreLabel')}</span>
          <span className={styles.pillWrap}>
            {level ? (
              <StatusPill color={color} tint={hexToRgba(color, 0.12)} label={t(LEVEL_KEYS[level])} />
            ) : (
              <span className={styles.noScore}>{t('coach.recoveryNoScore')}</span>
            )}
          </span>
        </div>
      </div>
      {rows.length > 0 ? (
        <>
          <Divider />
          <dl className={styles.rows}>
            {rows.map((row) => (
              <div key={row.label} className={styles.statRow}>
                <dt className={styles.rowLabel}>{row.label}</dt>
                <dd className={styles.rowValue}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </CoachCard>
  );
}
