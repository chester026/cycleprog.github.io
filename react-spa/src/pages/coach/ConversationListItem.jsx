import React, { useEffect, useRef, useState } from 'react';
import { IconButton } from '../../ui';
import { formatRelativeTime } from './lib';
import { t, WEB_COPY } from './copy';
import styles from './ConversationList.module.css';

const TITLE_MAX_CHARS = 80;

/**
 * One row of "Recent chats": title (or "Untitled chat"), relative time,
 * message count, rename (inline input) and delete. The whole row is a link
 * to the conversation; the two icon buttons sit outside it so nested
 * interactive elements never happen.
 */
export default function ConversationListItem({ conversation, onOpen, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  // Focus follows the rider's own "Rename" click into the field.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  const title = conversation.title || t('coach.untitledChat');
  const count = Number(conversation.message_count ?? 0);

  const startRename = () => {
    setDraft(conversation.title || '');
    setEditing(true);
  };

  const commitRename = () => {
    const next = draft.trim().slice(0, TITLE_MAX_CHARS);
    setEditing(false);
    if (next && next !== (conversation.title || '')) onRename(next);
  };

  return (
    <li className={styles.item}>
      {editing ? (
        <form
          className={styles.renameForm}
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
        >
          <input
            ref={inputRef}
            className={styles.renameInput}
            aria-label={WEB_COPY.renameChat}
            value={draft}
            maxLength={TITLE_MAX_CHARS}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        </form>
      ) : (
        <button type="button" className={styles.open} onClick={onOpen}>
          <span className={styles.title}>{title}</span>
          <span className={styles.meta}>
            {formatRelativeTime(conversation.updated_at)} · {count} {t('coach.messagesShort')}
          </span>
        </button>
      )}
      <div className={styles.actions}>
        <IconButton size="sm" icon="edit" aria-label={`${WEB_COPY.renameChat}: ${title}`} onClick={startRename} />
        <IconButton size="sm" aria-label={`${t('coach.deleteChat')}: ${title}`} onClick={onDelete}>
          <span aria-hidden="true" className={styles.deleteGlyph}>×</span>
        </IconButton>
      </div>
    </li>
  );
}
