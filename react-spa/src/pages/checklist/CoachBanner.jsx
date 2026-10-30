// "Ask coach about your checklist" banner — the bottom edge of OverviewCard,
// same sparkle + chevron language as MaintenancePage's coach card.
import React from 'react';
import { SparkleIcon } from './icons';
import styles from '../ChecklistPage.module.css';

export default function CoachBanner({ onClick }) {
  return (
    <button type="button" className={styles.coachBanner} onClick={onClick}>
      <span className={styles.coachIcon}>
        <SparkleIcon size={32} />
      </span>
      <span className={styles.coachText}>
        <span className={styles.coachTitle}>Ask coach about your checklist</span>
        <span className={styles.coachSubtitle}>Shopping and packing advice</span>
      </span>
      <span className={styles.coachChevron} aria-hidden="true">›</span>
    </button>
  );
}
