import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ToastContext from './ToastContext';
import styles from './Toast.module.css';

const DEFAULT_DURATION = { success: 3500, info: 3500, error: 5000 };

let idCounter = 0;

/**
 * Mounted once, near the app root (see main.jsx snippet in the T-6.3
 * report). Everything under it can call `useToast()` to show a toast
 * instead of `window.alert` (W-21/W-23).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (type, message, opts = {}) => {
      const id = ++idCounter;
      const duration = opts.duration ?? DEFAULT_DURATION[type] ?? 3500;
      setToasts((list) => [...list, { id, type, message }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (message, opts) => show('success', message, opts),
      error: (message, opts) => show('error', message, opts),
      info: (message, opts) => show('info', message, opts),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.container} aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={[styles.toast, styles[t.type] || styles.info].join(' ')}
            >
              <span className={styles.message}>{t.message}</span>
              <button
                type="button"
                className={styles.close}
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export default ToastProvider;
