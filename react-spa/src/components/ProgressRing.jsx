/**
 * ProgressRing — small SVG progress ring with a gradient stroke and a
 * transparent center for arbitrary children (percent label, icon, etc).
 * Web counterpart of the app's <ProgressRing> (src/components/coach/ProgressRing.tsx),
 * used the same way: <ProgressRing size={52} strokeWidth={4.5} value={72} colors={[...]}>...</ProgressRing>
 */
import React from 'react';

export default function ProgressRing({
  size = 52,
  strokeWidth = 4.5,
  value = 0,
  colors = ['#274dd3', '#5B7FE8'],
  trackColor = 'rgba(39, 77, 211, 0.12)',
  gradientId = 'progressRingGradient',
  children,
}) {
  const clamped = Math.max(0, Math.min(100, value || 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="progress-ring"
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1] || colors[0]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
