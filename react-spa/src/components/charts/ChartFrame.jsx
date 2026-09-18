import React, { useState } from 'react';
import styles from './ChartFrame.module.css';

/**
 * Shared panel chrome for the seven HR/cadence charts (T-6.3, audit W-32):
 * the dark `.gpx-elevation-block` panel, the title row with a hover "?"
 * tooltip, and the "not enough data" fallback text. Every pre-dedup
 * component repeated this exact markup/inline-style block; this is the one
 * copy. Visuals are unchanged (same panel class, same colors/spacing).
 */
export default function ChartFrame({ title, help, hasData, emptyText, children }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="gpx-elevation-block" style={{ marginTop: 32, marginBottom: 32, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: '#f6f8ff', marginBottom: 16 }}>{title}</h2>
        {help && (
          <div style={{ position: 'relative', marginLeft: 8 }}>
            <span
              className={styles.helpBtn}
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
            >
              ?
            </span>
            {showTip && <div className={styles.helpTooltip}>{help}</div>}
          </div>
        )}
      </div>
      {hasData ? children : <div style={{ color: '#b0b8c9', marginTop: '2em' }}>{emptyText}</div>}
    </div>
  );
}
