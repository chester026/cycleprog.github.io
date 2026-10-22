import React, { useEffect, useState } from 'react';
import styles from './ChatLayout.module.css';

// Mobile browsers keep `100dvh` at the full layout height while the
// on-screen keyboard is up, so the composer ends up hidden behind it. The
// visualViewport API reports the actually visible height; the layout
// follows it only when it differs from the layout viewport (keyboard open).
function useVisualViewportHeight() {
  const [height, setHeight] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const keyboardOpen = window.innerHeight - vv.height > 100;
      setHeight(keyboardOpen ? vv.height : null);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return height;
}

/**
 * Full-height column for the chat view: header on top, transcript filling
 * the middle, composer pinned to the bottom. The sidebar stays (it's part
 * of the protected layout); on phones the drawer is closed anyway.
 */
export default function ChatLayout({ children }) {
  const viewportHeight = useVisualViewportHeight();
  return (
    <div className={styles.layout} style={viewportHeight ? { height: viewportHeight } : undefined} data-testid="coach-chat">
      <div className={styles.backdrop} aria-hidden="true" />
      {children}
    </div>
  );
}
