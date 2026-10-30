import React from 'react';
import { CoachCard } from './CoachCardChrome';
import { t } from '../copy';
import styles from './comparisonCards.module.css';

/** 2-column grid of skill changes (shared `buildSkillChanges`), one soft tile per skill. */
export default function SkillsDeltaCard({ changes }) {
  if (changes.length === 0) return null;
  return (
    <CoachCard glow={false} testId="skills-delta-card">
      <span className={styles.title}>{t('coach.skillsChanged')}</span>
      <ul className={styles.grid}>
        {changes.map((c) => (
          <li key={c.name} className={styles.item}>
            <span className={styles.name}>{c.name}</span>
            <span className={styles.valueRow}>
              <span className={styles.value}>
                {c.previous} → {c.current}
              </span>
              <span className={[styles.badge, c.diff < 0 ? styles.badgeNegative : null].filter(Boolean).join(' ')}>
                {c.diff > 0 ? '+' : ''}
                {c.diff}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </CoachCard>
  );
}
