// Detail sheet for one checklist item — rename, edit/open its link, move it
// to another section, delete. The page mounts it with `key={item.id}` so the
// drafts re-seed per item (and a cache refresh after saving never stomps on
// text the user is mid-typing).
import React, { useState } from 'react';
import { Sheet } from '../../ui';
import styles from './sheets.module.css';

export default function ItemDetailSheet({
  item,
  otherSections,
  saving,
  onClose,
  onRename,
  onMove,
  onSaveLink,
  onDelete,
}) {
  const [name, setName] = useState(item?.item ?? '');
  const [link, setLink] = useState(item?.link ?? '');

  const trimmedName = name.trim();
  const trimmedLink = link.trim();
  const nameChanged = !!item && !!trimmedName && trimmedName !== item.item;
  const linkChanged = !!item && trimmedLink !== (item.link ?? '');

  const submit = (e) => {
    e.preventDefault();
    if (!trimmedName || saving) return;
    if (nameChanged) onRename(trimmedName);
    if (linkChanged) onSaveLink(trimmedLink);
    if (!nameChanged && !linkChanged) onClose();
  };

  return (
    <Sheet
      open={item != null}
      onClose={onClose}
      variant="side"
      title={item?.item}
      footer={
        <button type="button" className={styles.destructive} onClick={onDelete}>
          Delete item
        </button>
      }
    >
      {item && (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="checklist-item-name">
              Item name
            </label>
            <input
              id="checklist-item-name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="checklist-item-link">
              Link
            </label>
            <input
              id="checklist-item-link"
              className={styles.input}
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              autoComplete="off"
            />
          </div>
          {!!item.link && (
            <a className={styles.openLink} href={item.link} target="_blank" rel="noreferrer">
              Open link
            </a>
          )}

          {otherSections.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label} id="checklist-move-label">
                Move to section
              </span>
              <div className={styles.chipRow} role="group" aria-labelledby="checklist-move-label">
                {otherSections.map((section) => (
                  <button key={section} type="button" className={styles.chip} onClick={() => onMove(section)}>
                    {section}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className={styles.primary} disabled={!trimmedName || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}
    </Sheet>
  );
}
