import React from 'react';
import styles from './CoachCardChrome.module.css';

/**
 * Shared visual language for every rich card the coach renders in chat
 * (port of the app's CoachCardChrome): soft gradient surface, a tinted glow
 * band fading from the top, a hairline border, a diffuse shadow, and the
 * small reusable pieces (icon tile, eyebrow, status pill, footer link,
 * divider) so goal/calendar/score/chart/comparison cards read as one family.
 *
 * An accent is a name, resolved to a CSS class that sets the `--cc-*`
 * variables the pieces read; the icon colour reaches SVG icons through
 * `currentColor` on the tile.
 */
export const ACCENT = Object.freeze({
  blue: 'blue',
  green: 'green',
  amber: 'amber',
  orange: 'orange',
  red: 'red',
  purple: 'purple',
  gray: 'gray',
});

const ACCENT_CLASS = {
  blue: styles.accentBlue,
  green: styles.accentGreen,
  amber: styles.accentAmber,
  orange: styles.accentOrange,
  red: styles.accentRed,
  purple: styles.accentPurple,
  gray: styles.accentGray,
};

const DEFAULT_GLOW_HEIGHT_PX = 64;

/**
 * Card shell. With `onPress` the whole card is a `<button>` (keyboard and
 * screen-reader reachable); without it a plain `<div>`. `fullWidth` is for
 * the chart card, which needs the row's whole width to draw in.
 */
export function CoachCard({
  accent = ACCENT.gray,
  glow = true,
  glowHeight = DEFAULT_GLOW_HEIGHT_PX,
  onPress,
  fullWidth = false,
  className,
  testId,
  children,
}) {
  const outerClass = [styles.outer, ACCENT_CLASS[accent] ?? styles.accentGray, fullWidth ? styles.fullWidth : null]
    .filter(Boolean)
    .join(' ');
  const inner = (
    <div className={[styles.card, className].filter(Boolean).join(' ')}>
      {glow ? <div className={styles.glow} style={{ height: glowHeight }} aria-hidden="true" /> : null}
      <div className={styles.content}>{children}</div>
    </div>
  );
  if (onPress) {
    return (
      <button type="button" className={outerClass} onClick={onPress} data-testid={testId}>
        {inner}
      </button>
    );
  }
  return (
    <div className={outerClass} data-testid={testId}>
      {inner}
    </div>
  );
}

export function IconTile({ children }) {
  return (
    <span className={styles.iconTile} aria-hidden="true">
      {children}
    </span>
  );
}

export function Eyebrow({ children }) {
  return <span className={styles.eyebrow}>{children}</span>;
}

/** Small uppercase status pill; `color` is the dot/text colour, `tint` its background. */
export function StatusPill({ color, tint, label }) {
  return (
    <span className={styles.pill} style={{ '--pill-color': color, '--pill-tint': tint }}>
      <span className={styles.pillDot} aria-hidden="true" />
      <span className={styles.pillText}>{label}</span>
    </span>
  );
}

/** "View Details →" row; the card itself is the pressable, this is the hint. */
export function FooterLink({ label }) {
  return (
    <span className={styles.footerRow}>
      <span className={styles.footerText}>{label} →</span>
    </span>
  );
}

export function Divider() {
  return <hr className={styles.divider} aria-hidden="true" />;
}
