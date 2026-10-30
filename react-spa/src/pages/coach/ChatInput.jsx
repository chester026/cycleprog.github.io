import React, { useState } from 'react';
import { IconButton, Textarea } from '../../ui';
import { t, WEB_COPY } from './copy';
import styles from './ChatInput.module.css';

// Matches the server's message cap (ChatRequestBodySchema stays open-ended,
// the route rejects longer bodies); the counter appears near the limit.
export const MAX_MESSAGE_CHARS = 4000;
const COUNTER_THRESHOLD_CHARS = 3500;

/**
 * Composer docked under the transcript: paperclip (attach rides), autosize
 * textarea (Enter sends, Shift+Enter newlines), attachment pills, and a
 * send button that becomes Stop while a reply streams.
 */
export default function ChatInput({
  onSend,
  onCancel,
  streaming,
  disabled = false,
  onAttachPress,
  attachedActivities = [],
  onRemoveAttachment,
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled && !streaming;

  const handleSend = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    handleSend();
  };

  return (
    <div className={styles.wrapper}>
      {attachedActivities.length > 0 ? (
        <ul className={styles.pills} aria-label="Attached activities">
          {attachedActivities.map((activity) => (
            <li key={activity.id} className={styles.pill}>
              <span className={styles.pillText}>{activity.name}</span>
              <button
                type="button"
                className={styles.pillRemove}
                onClick={() => onRemoveAttachment?.(activity.id)}
                aria-label={`Remove ${activity.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.row}>
        <IconButton
          size="lg"
          variant="outline"
          icon="attach_file"
          aria-label={t('coach.attachActivities')}
          onClick={onAttachPress}
          disabled={disabled}
          data-testid="coach-attach-button"
        />
        <div className={styles.field}>
          <Textarea
            aria-label={t('coach.inputPlaceholder')}
            placeholder={t('coach.inputPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_CHARS))}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            minRows={1}
            maxRows={6}
            maxLength={MAX_MESSAGE_CHARS}
            data-testid="coach-input"
          />
          {text.length >= COUNTER_THRESHOLD_CHARS ? (
            <span className={styles.counter} aria-live="polite">
              {text.length}/{MAX_MESSAGE_CHARS}
            </span>
          ) : null}
        </div>
        {streaming ? (
          <IconButton size="lg" variant="dark" aria-label={WEB_COPY.stopGenerating} onClick={onCancel} data-testid="coach-stop-button">
            <span className={styles.stopIcon} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            size="lg"
            variant="primary"
            aria-label={WEB_COPY.sendMessage}
            onClick={handleSend}
            disabled={!canSend}
            data-testid="coach-send-button"
          >
            <span className={styles.sendGlyph} aria-hidden="true">→</span>
          </IconButton>
        )}
      </div>
    </div>
  );
}
