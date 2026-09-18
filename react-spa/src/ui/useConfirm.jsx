import React, { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * Promise-based confirm, replacing `window.confirm` (W-21/W-23).
 *
 * Usage:
 *   const [confirm, confirmDialog] = useConfirm();
 *   ...
 *   const ok = await confirm({ title, message, confirmText, danger });
 *   if (ok) { ... }
 *   ...
 *   return <>{confirmDialog}{...therestofthecomponent}</>;
 *
 * `confirmDialog` (the second tuple item) is the dialog element itself and
 * MUST be rendered somewhere in the calling component's JSX tree (it is a
 * per-component hook, not a globally-mounted provider like `useToast`) —
 * without it the promise from `confirm()` never resolves because there is
 * nothing on screen for the user to click.
 */
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOptions(opts || {});
    });
  }, []);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={options != null}
      title={options?.title}
      message={options?.message}
      confirmText={options?.confirmText}
      cancelText={options?.cancelText}
      danger={options?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return [confirm, confirmDialog];
}

export default useConfirm;
