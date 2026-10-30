import React from 'react';
import { ErrorMessage, Skeleton } from '../../ui';
import ConversationListItem from './ConversationListItem';
import { t, WEB_COPY } from './copy';
import styles from './ConversationList.module.css';

const SKELETON_ROWS = 3;

/** "Recent chats" — the list under the home hero, with loading/error/empty states. */
export default function ConversationList({ conversations, isLoading, isError, onOpen, onDelete, onRename, onNewChat }) {
  return (
    <section className={styles.section} aria-labelledby="coach-recent-chats">
      <div className={styles.header}>
        <h2 id="coach-recent-chats" className={styles.heading}>
          {t('coach.recentChats')}
        </h2>
        <button type="button" className={styles.newChat} onClick={onNewChat}>
          + {t('coach.newChat')}
        </button>
      </div>

      {isLoading ? (
        <ul className={styles.list} aria-busy="true">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <li key={i} className={styles.item}>
              <Skeleton height="40px" radius="8px" label={i === 0 ? 'Loading recent chats' : undefined} />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <ErrorMessage>{WEB_COPY.conversationsLoadFailed}</ErrorMessage>
      ) : conversations.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{WEB_COPY.noChatsTitle}</p>
          <p className={styles.emptyHint}>{WEB_COPY.noChatsHint}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              onOpen={() => onOpen(conversation)}
              onDelete={() => onDelete(conversation)}
              onRename={(title) => onRename(conversation, title)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
