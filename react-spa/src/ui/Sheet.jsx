import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Sheet.module.css';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Light-surface dialog for edit/detail flows on the app-style pages
 * (Maintenance, Checklist): a bottom sheet on phones, a centered panel
 * (`variant="center"`, default) or a right-hand side panel
 * (`variant="side"`) on wider viewports. Portal to `body`, `role="dialog"` +
 * `aria-modal`, labelled by `title`, focus trap, Esc / backdrop close and
 * focus restore — the same contract as `Modal`, which keeps the dark
 * `--ui-*` theme for the legacy pages.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  variant = 'center',
  className,
}) {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  // Focus trap + restore. The container itself takes focus (not the first
  // control) so assistive tech announces the title — WAI-ARIA dialog pattern.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    const node = dialogRef.current;
    node?.focus();

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab' || !node) return;
      const list = Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR));
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const toRestore = previouslyFocusedRef.current;
      if (toRestore && typeof toRestore.focus === 'function') toRestore.focus();
    };
  }, [open]);

  // Same `body.modal-open` scroll lock Modal uses (App.css).
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  if (!open) return null;

  const variantClass = variant === 'side' ? styles.side : styles.center;

  return createPortal(
    <div
      className={[styles.overlay, variantClass].join(' ')}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={[styles.sheet, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <div className={styles.heading}>
            {title != null && (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            )}
            {subtitle != null && (
              <p id={subtitleId} className={styles.subtitle}>
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={() => onClose?.()} aria-label="Close">
            &times;
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer != null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
