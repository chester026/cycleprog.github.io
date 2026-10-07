// Tiny registry of our own visible modals. The screenshot -> Share Studio
// listener consults it so a screenshot taken while a sheet is already open
// (including the studio itself) does not stack another modal on top.
// A modal opts in with `useTrackOpenModal(visible)`.
import {useEffect, useSyncExternalStore} from 'react';

let openCount = 0;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Marks the calling modal as open for as long as `visible` is true. */
export function useTrackOpenModal(visible: boolean): void {
  useEffect(() => {
    if (!visible) return undefined;
    openCount += 1;
    notify();
    return () => {
      openCount -= 1;
      notify();
    };
  }, [visible]);
}

export function useIsAnyModalOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openCount > 0);
}
