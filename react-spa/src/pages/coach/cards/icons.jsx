import React from 'react';
import styles from './cards.module.css';

// 18 px line icons for the card icon tiles, drawn in `currentColor` so the
// tile's `--cc-icon` colours them. Paths are the app's react-native-svg ones.
const base = { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', className: styles.icon, 'aria-hidden': true };

export function TargetIcon() {
  return (
    <svg {...base}>
      <circle cx={10} cy={10} r={7.3} stroke="currentColor" strokeWidth={1.7} />
      <circle cx={10} cy={10} r={3.2} stroke="currentColor" strokeWidth={1.7} />
      <circle cx={10} cy={10} r={0.9} fill="currentColor" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 10.5l3.7 3.7L15.5 6.5" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg {...base}>
      <rect x={3} y={4.5} width={14} height={12.5} rx={2.6} stroke="currentColor" strokeWidth={1.7} />
      <path d="M3.5 8H16.5" stroke="currentColor" strokeWidth={1.7} />
      <path d="M6.8 2.8V6M13.2 2.8V6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}

export function NoteIcon() {
  return (
    <svg {...base}>
      <path
        d="M5 3.5h10a1 1 0 0 1 1 1v11l-3-2-2 2-2-2-2 2-2-2-1 1v-11a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg {...base}>
      <path
        d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 6c0-2.8 2.7-5 6-5s6 2.2 6 5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
