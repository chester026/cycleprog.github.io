import React from 'react';
import styles from './Skeleton.module.css';

/**
 * Loading placeholder that reserves the space of the content it stands in
 * for (CODE_STYLE §7: no layout shift where a skeleton is cheap).
 *
 * One `Skeleton` per visual block; give the first one in a group a `label`
 * so screen readers hear a single "Loading …" status instead of silence —
 * unlabelled blocks are purely decorative and hidden from the a11y tree.
 */
export default function Skeleton({
  width = '100%',
  height = '1em',
  radius,
  circle = false,
  label,
  className,
  style,
}) {
  const a11y = label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': 'true' };
  return (
    <span
      {...a11y}
      className={[styles.skeleton, circle ? styles.circle : null, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
