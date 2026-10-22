// Checklist preview strip for GaragePage (owner decision 18.09) — a
// horizontally-scrolling row of section cards summarizing /api/checklist
// (same data ChecklistPage itself edits, via the shared useChecklist()
// cache), plus a "+ New item" card. No editing here — every card just
// navigates to /checklist, which owns the actual add/check/delete UI.
import React from 'react';
import { Link } from 'react-router-dom';
import { groupBySection } from '@bikelab/shared/checklist';
import { useChecklist } from '../../data/hooks';
import { ErrorMessage, Skeleton } from '../../ui';
import styles from './ChecklistPreview.module.css';

const MAX_ITEMS_SHOWN = 3;

export default function ChecklistPreview() {
  const { data, isLoading, isError, error } = useChecklist();
  const rows = data || [];

  // Reserve the card footprint so the strip doesn't jump when data lands,
  // and never show the empty state before the first fetch resolves.
  if (isLoading) {
    return (
      <div className="garage-strip">
        <Skeleton label="Loading checklist" className={styles.card} height={176} radius={16} />
        <Skeleton className={styles.card} height={176} radius={16} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="garage-strip">
        <ErrorMessage>Couldn&apos;t load checklist: {error?.message || 'unknown error'}</ErrorMessage>
      </div>
    );
  }

  const sections = groupBySection(rows);

  if (sections.length === 0) {
    return (
      <div className="garage-strip">
        <Link to="/checklist" className={styles.card}>
          <span className={styles.emptyTitle}>Plan your upgrades and purchases</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="garage-strip">
      {sections.map(({ section, items, done, total, percent }) => {
        const shown = items.slice(0, MAX_ITEMS_SHOWN);
        const extra = items.length - shown.length;
        return (
          <Link to="/checklist" key={section} className={styles.card}>
            <div className={styles.sectionName}>{section}</div>
            <div className={styles.count}>{done}/{total}</div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${percent}%` }} />
            </div>
            <ul className={styles.itemList}>
              {shown.map((item) => (
                <li
                  key={item.id}
                  className={item.checked ? styles.itemDone : styles.item}
                >
                  {item.checked && <span className={styles.check}>✓</span>}
                  <span className={styles.itemText}>{item.item}</span>
                </li>
              ))}
            </ul>
            {extra > 0 && <div className={styles.more}>+{extra} more</div>}
          </Link>
        );
      })}

      <Link to="/checklist" className={`${styles.card} ${styles.newCard}`}>
        <span className={styles.newPlus} aria-hidden="true">＋</span>
        <span>New item</span>
      </Link>
    </div>
  );
}
