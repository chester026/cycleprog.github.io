import React from 'react';
import { getEffortLevel } from '@bikelab/shared/constants';
import { CoachCard, StatusPill } from './CoachCardChrome';
import ProgressRing from './ProgressRing';
import { EFFORT_RINGS, hexToRgba } from './palette';
import { t } from '../copy';
import styles from './scoreCards.module.css';

const LEVEL_KEYS = {
  recovery: 'rideAnalytics.scoreRecovery',
  easy: 'rideAnalytics.scoreEasy',
  moderate: 'rideAnalytics.scoreModerate',
  tempo: 'rideAnalytics.scoreTempo',
  hard: 'rideAnalytics.scoreHard',
  heavy: 'rideAnalytics.scoreHeavy',
  exhausted: 'rideAnalytics.scoreExhausted',
};

/**
 * Effort-score headline for the first ride analysis of a conversation: a
 * gradient ring and the bucket label. Thresholds are shared
 * (`getEffortLevel`); this only maps a level to copy and colours.
 */
export default function RideScoreCard({ score }) {
  const level = getEffortLevel(score);
  const ring = EFFORT_RINGS[level];
  const color = ring[1];
  return (
    <CoachCard glow={false} className={styles.card} testId="ride-score-card">
      <div className={styles.row}>
        <ProgressRing value={score} colors={ring} gradientId="effortRing">
          <span className={styles.scoreNumber}>{score}</span>
          <span className={styles.scoreOf}>/100</span>
        </ProgressRing>
        <div className={styles.info}>
          <span className={styles.eyebrow}>{t('rideAnalytics.effortScore')}</span>
          <span className={styles.pillWrap}>
            <StatusPill color={color} tint={hexToRgba(color, 0.12)} label={t(LEVEL_KEYS[level])} />
          </span>
        </div>
      </div>
    </CoachCard>
  );
}
