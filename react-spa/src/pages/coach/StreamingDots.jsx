import React from 'react';
import styles from './StreamingDots.module.css';

/** Three pulsing dots shown while the coach's reply is still empty. */
export default function StreamingDots() {
  return (
    <span className={styles.row} role="status" aria-label="Coach is thinking">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}
