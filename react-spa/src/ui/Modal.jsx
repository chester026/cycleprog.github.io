import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Generic modal primitive (W-21/W-23): portal, focus trap, Esc/overlay
 * close, `role="dialog"` + `aria-modal`, labelled by its title. Replaces
 * the various ad-hoc `.modal-overlay`/`.modal-content` markup duplicated
 * per-modal (RideAddModal, OnboardingModal, EventsManager, ...) — those
 * pages migrate to this on their own schedule; this component does not
 * delete their CSS.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  className,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Esc to close.
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, closeOnEsc, onClose]);

  // Focus trap + restore focus to the previously-focused element on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;

    const node = dialogRef.current;

    // Focus the dialog container itself (not the first focusable control,
    // which would otherwise always be the header's close button) so
    // assistive tech announces the title, per WAI-ARIA dialog pattern.
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

  // Lock background scroll while open (mirrors existing `body.modal-open`
  // convention in App.css).
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={[styles.dialog, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title != null && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => onClose?.()}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer != null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
