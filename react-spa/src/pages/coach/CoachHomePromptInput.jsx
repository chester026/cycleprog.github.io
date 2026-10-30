import React, { useState } from 'react';
import { IconButton } from '../../ui';
import { t, WEB_COPY } from './copy';
import styles from './CoachHomePromptInput.module.css';

/**
 * The free-text prompt pill in the home hero. Submitting always starts a
 * brand-new conversation (see CoachPage.handleHomeSubmit), same as the
 * quick-start chips — distinct from ChatInput, which lives inside a chat.
 */
export default function CoachHomePromptInput({ onSubmit, disabled = false }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <form
      className={styles.wrapper}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className={styles.icon} aria-hidden="true">✦</span>
      <input
        type="text"
        className={styles.input}
        placeholder={t('coach.homeInputPlaceholder')}
        aria-label={t('coach.homeInputPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        data-testid="coach-home-input"
      />
      <IconButton
        type="submit"
        size="lg"
        variant="primary"
        className={styles.submit}
        aria-label={WEB_COPY.sendMessage}
        disabled={!canSend}
        data-testid="coach-home-send"
      >
        <span aria-hidden="true" className={styles.arrow}>→</span>
      </IconButton>
    </form>
  );
}
