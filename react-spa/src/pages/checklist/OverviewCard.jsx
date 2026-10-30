// Overview card: progress ring + status + Open/Done/Sections rows, with the
// coach banner attached as its bottom edge (one solid card, as in the app).
// Ring geometry matches MaintenancePage's bike-health gauge.
import React from 'react';
import { checklistStatus } from '@bikelab/shared/checklist';
import CoachBanner from './CoachBanner';
import styles from '../ChecklistPage.module.css';

const GAUGE_SIZE = 132;
const GAUGE_STROKE = 7;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const STATUS_LABEL = {
  allSet: 'All set',
  almostReady: 'Almost ready',
  gettingStarted: 'Getting started',
};

export default function OverviewCard({ overview, onAskCoach }) {
  const rows = [
    { key: 'open', label: 'Open', value: overview.openItems },
    { key: 'done', label: 'Done', value: overview.doneItems },
    { key: 'sections', label: 'Sections', value: overview.totalSections },
  ];

  return (
    <section className={styles.overview} aria-label="Checklist overview">
      <div className={styles.overviewInner}>
        <div className={styles.gaugeWrap}>
          <svg width={GAUGE_SIZE} height={GAUGE_SIZE} aria-hidden="true">
            <circle
              className={styles.gaugeTrack}
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
              strokeWidth={GAUGE_STROKE}
              fill="none"
            />
            <circle
              className={styles.gaugeFill}
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
              strokeWidth={GAUGE_STROKE}
              fill="none"
              strokeDasharray={`${(overview.percent / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
            />
          </svg>
          <div className={styles.gaugeLabel}>
            <div className={styles.gaugeValRow}>
              <span className={styles.gaugeVal}>{overview.percent}</span>
              <span className={styles.gaugeSuffix}>%</span>
            </div>
            <div className={styles.gaugeCaption}>Done</div>
          </div>
        </div>

        <div className={styles.overviewInfo}>
          <h2 className={styles.overviewTitle}>{STATUS_LABEL[checklistStatus(overview.percent)]}</h2>
          <dl className={styles.overviewRows}>
            {rows.map((row) => (
              <div key={row.key} className={styles.overviewRow}>
                <dt className={styles.overviewRowLabel}>{row.label}</dt>
                <dd className={styles.overviewRowVal}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <CoachBanner onClick={onAskCoach} />
    </section>
  );
}
