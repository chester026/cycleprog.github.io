// Checklist preview strip for GaragePage (owner decision 18.09) — a
// horizontally-scrolling row of section cards summarizing /api/checklist
// (same data ChecklistPage itself edits, via the shared useChecklist()
// cache), plus a "+ New item" card. No editing here — every card just
// navigates to /checklist, which owns the actual add/check/delete UI.
import React from 'react';
import { Link } from 'react-router-dom';
import { useChecklist } from '../../data/hooks';
import styles from './ChecklistPreview.module.css';

const MAX_ITEMS_SHOWN = 3;

// Groups the flat {id, section, item, checked} rows into per-section
// summaries, preserving each section's first-seen order (same rule
// ChecklistPage's own `sections` list uses).
function groupBySection(rows) {
  const order = [];
  const bySection = new Map();
  for (const row of rows) {
    if (!bySection.has(row.section)) {
      bySection.set(row.section, []);
      order.push(row.section);
    }
    bySection.get(row.section).push(row);
  }
  return order.map((section) => {
    const items = bySection.get(section);
    const done = items.filter((i) => i.checked).length;
    return { section, items, done, total: items.length };
  });
}

export default function ChecklistPreview() {
  const { data, isLoading } = useChecklist();
  const rows = data || [];

  // Avoid flashing the empty state before the first fetch resolves.
  if (isLoading) return null;

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
      {sections.map(({ section, items, done, total }) => {
        const percent = total ? Math.round((done / total) * 100) : 0;
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
