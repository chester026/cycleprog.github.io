import { useContext } from 'react';
import ToastContext from './ToastContext';

/**
 * `const toast = useToast(); toast.success('Saved'); toast.error('Failed to save');`
 * Must be called under a mounted `<ToastProvider>` (see main.jsx snippet in
 * the T-6.3 report) — throws instead of silently no-oping so a missing
 * provider is caught in dev rather than shipping toast-less error handling.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be used within a <ToastProvider>');
  }
  return ctx;
}

export default useToast;
