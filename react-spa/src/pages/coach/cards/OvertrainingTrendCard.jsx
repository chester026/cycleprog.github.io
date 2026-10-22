import React, { useMemo } from 'react';
import {
  buildTrendChartPaths,
  computeOvertrainingRate,
  getOvertrainingRiskLevel,
  selectTrendSeries,
} from '@bikelab/shared/calc';
import { CHART_COLORS } from '../../../components/charts/chartTheme';
import { CoachCard, StatusPill } from './CoachCardChrome';
import { OVERTRAINING_RISK_COLORS, hexToRgba } from './palette';
import { t } from '../copy';
import styles from './OvertrainingTrendCard.module.css';

const CHART_W = 400;
const CHART_H = 96;
const CHART_BOX = { width: CHART_W, top: 6, bottom: 86 };

const RISK_KEYS = {
  high: 'coach.overtrainingHigh',
  elevated: 'coach.overtrainingElevated',
  moderate: 'coach.overtrainingModerate',
  low: 'coach.overtrainingLow',
};

/**
 * HR-vs-speed fatigue trend over the rider's recent rides — the numbers
 * (ride selection, divergence risk, shared-scale path geometry) all come
 * from `@bikelab/shared/calc` so this draws the same chart as the app; the
 * series colours are the web's chart theme (HR orange, speed blue). Renders
 * nothing with fewer than two rides that have both HR and speed.
 */
export default function OvertrainingTrendCard({ activities }) {
  const { paths, risk } = useMemo(() => {
    const series = selectTrendSeries(activities);
    return { paths: buildTrendChartPaths(series, CHART_BOX), risk: computeOvertrainingRate(series.hr, series.speedKmh) };
  }, [activities]);

  if (!paths) return null;

  const riskLevel = risk ? getOvertrainingRiskLevel(risk.rate) : null;
  const riskColor = riskLevel ? OVERTRAINING_RISK_COLORS[riskLevel] : null;

  return (
    <CoachCard glow={false} fullWidth testId="overtraining-trend-card">
      <div className={styles.headerRow}>
        <span className={styles.title}>{t('coach.trendTitle')}</span>
      </div>
      {risk ? (
        <span className={styles.riskWrap}>
          <StatusPill
            color={riskColor}
            tint={hexToRgba(riskColor, 0.12)}
            label={`${t('coach.overtrainingRiskLabel')} ${risk.rate}% · ${t(RISK_KEYS[riskLevel])}`}
          />
        </span>
      ) : null}
      {risk?.fatigueDetected ? <p className={styles.fatigueNote}>{t('coach.trendFatigueBadge')}</p> : null}

      <svg className={styles.chart} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="trendHrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.heartRate} stopOpacity={0.18} />
            <stop offset="100%" stopColor={CHART_COLORS.heartRate} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={paths.hrArea} fill="url(#trendHrFill)" stroke="none" />
        <path
          d={paths.speedLine}
          fill="none"
          stroke={CHART_COLORS.speed}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          data-testid="trend-speed-line"
        />
        <path
          d={paths.hrLine}
          fill="none"
          stroke={CHART_COLORS.heartRate}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          data-testid="trend-hr-line"
        />
      </svg>
      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: CHART_COLORS.heartRate }} aria-hidden="true" />
          {t('heartAnalysis.avgHRLabel')}
        </li>
        <li className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: CHART_COLORS.speed }} aria-hidden="true" />
          {t('heartAnalysis.avgSpeedLabel')}
        </li>
      </ul>
    </CoachCard>
  );
}
