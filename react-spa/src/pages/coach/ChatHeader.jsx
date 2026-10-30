import React from 'react';
import { IconButton } from '../../ui';
import { t } from './copy';
import styles from './ChatHeader.module.css';

/**
 * The chat view's header: Back / "AI Coach" / delete-current + new-chat.
 * Icon buttons are disabled while a reply streams — switching conversations
 * mid-turn would orphan the partial reply.
 */
export default function ChatHeader({ onBack, onNewChat, onDeleteCurrent, streaming, hasConversation }) {
  return (
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack}>
        {t('coach.back')}
      </button>
      <h1 className={styles.title}>{t('coach.headerTitle')}</h1>
      <div className={styles.actions}>
        {hasConversation ? (
          <IconButton
            size="sm"
            aria-label={t('coach.deleteChat')}
            onClick={onDeleteCurrent}
            disabled={streaming}
            data-testid="coach-delete-chat-button"
          >
            <span aria-hidden="true" className={styles.deleteGlyph}>×</span>
          </IconButton>
        ) : null}
        <IconButton
          size="sm"
          icon="edit_square"
          aria-label={t('coach.newChat')}
          onClick={onNewChat}
          disabled={streaming}
          data-testid="coach-new-chat-button"
        />
      </div>
    </header>
  );
}
