import React from 'react';
import { CoachCard } from './CoachCardChrome';
import styles from './comparisonCards.module.css';

/**
 * "vs Your Average" / "vs <similar ride>" rows from get_activity_analysis
 * (shared `buildBaselineRows` / `buildSimilarRideRows`): old → new, the
 * new value highlighted green when the change is in the better direction.
 */
export default function MetricComparisonCard({ title, subtitle, rows, testId = 'metric-comparison-card' }) {
  if (rows.length === 0) return null;
  return (
    <CoachCard glow={false} testId={testId}>
      <span className={styles.title}>{title}</span>
      {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.values}>
              <span className={styles.oldValue}>{row.oldValue}</span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
              <span className={[styles.pill, row.isPositive ? styles.pillPositive : null].filter(Boolean).join(' ')}>{row.newValue}</span>
            </span>
          </li>
        ))}
      </ul>
    </CoachCard>
  );
}
