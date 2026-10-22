// The board: one column per checklist section (uppercase eyebrow, done/total
// count, add-item and edit buttons, then a stack of ItemCards), plus a
// trailing "New section" column — the same auto-fit column grid
// MaintenancePage uses for its component groups.
import React from 'react';
import { sortSectionItems } from '@bikelab/shared/checklist';
import ItemCard from './ItemCard';
import { EditIcon, PlusIcon } from './icons';
import styles from '../ChecklistPage.module.css';

function SectionColumn({ section, onToggleItem, onOpenItem, onAddItem, onEditSection }) {
  const sorted = sortSectionItems(section.items);
  return (
    <section className={styles.column} aria-label={section.section}>
      <div className={styles.columnHeader}>
        <h3 className={styles.columnTitle}>{section.section}</h3>
        <span className={styles.columnCount} aria-label={`${section.done} of ${section.total} done`}>
          {section.done}/{section.total}
        </span>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => onAddItem(section.section)}
          aria-label={`Add item to ${section.section}`}
          title="Add item"
        >
          <PlusIcon size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => onEditSection(section)}
          aria-label={`Edit section ${section.section}`}
          title="Rename or delete section"
        >
          <EditIcon size={13} />
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className={styles.columnEmpty}>No items yet</div>
      ) : (
        <ul className={styles.columnCards}>
          {sorted.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onToggle={() => onToggleItem(item)}
              onOpen={() => onOpenItem(item)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SectionGrid({ sections, onToggleItem, onOpenItem, onAddItem, onEditSection, onNewSection }) {
  return (
    <div className={styles.board}>
      {sections.map((section) => (
        <SectionColumn
          key={section.section}
          section={section}
          onToggleItem={onToggleItem}
          onOpenItem={onOpenItem}
          onAddItem={onAddItem}
          onEditSection={onEditSection}
        />
      ))}
      <button type="button" className={styles.newColumn} onClick={onNewSection}>
        <PlusIcon size={14} />
        New section
      </button>
    </div>
  );
}
