// One checklist item: round check toggle, the item name (opens the detail
// sheet) and, when the item has a link, a hostname chip that opens it.
import React from 'react';
import { linkHost } from '@bikelab/shared/checklist';
import { CheckIcon, LinkIcon } from './icons';
import styles from '../ChecklistPage.module.css';

export default function ItemCard({ item, onToggle, onOpen }) {
  const done = !!item.checked;
  const host = linkHost(item.link);

  return (
    <li className={styles.card} data-testid={`checklist-item-${item.id}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={item.item}
        className={[styles.check, done ? styles.checkDone : null].filter(Boolean).join(' ')}
        onClick={onToggle}
      >
        {done && <CheckIcon size={12} />}
      </button>
      <button
        type="button"
        className={[styles.cardBody, done ? styles.cardBodyDone : null].filter(Boolean).join(' ')}
        onClick={onOpen}
        aria-label={`Edit ${item.item}`}
      >
        {item.item}
      </button>
      {host && (
        <a
          className={styles.linkChip}
          href={item.link}
          target="_blank"
          rel="noreferrer"
          title={item.link}
          aria-label={`Open link for ${item.item}: ${host}`}
        >
          <LinkIcon size={11} />
          {host}
        </a>
      )}
    </li>
  );
}
