import React from 'react';
import styles from './ProgressRing.module.css';

const DEFAULT_SIZE_PX = 82;
const DEFAULT_STROKE_PX = 6;
const TRACK_COLOR = '#edeff1';

/**
 * Gradient score ring shared by RideScoreCard (effort) and RecoveryCard
 * (recovery). `gradientId` must be unique among rings on the page — SVG
 * `<defs>` ids are document-global.
 */
export default function ProgressRing({
  size = DEFAULT_SIZE_PX,
  strokeWidth = DEFAULT_STROKE_PX,
  value,
  colors,
  gradientId,
  children,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <svg className={styles.svg} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={radius} stroke={TRACK_COLOR} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${center} ${center})`}
          data-testid="progress-ring-value"
        />
      </svg>
      <div className={styles.center}>{children}</div>
    </div>
  );
}
