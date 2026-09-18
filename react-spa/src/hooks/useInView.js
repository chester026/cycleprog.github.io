import { useEffect, useRef, useState } from 'react';

// T-6.3 (audit W-23): lazy-mount hook for heavy chart sections. A section
// wrapped with this hook only renders its (expensive, recharts-heavy)
// children once its placeholder div has actually scrolled into view,
// instead of mounting all ~12 charts on the Analysis page at once.
//
// Returns `[ref, inView]` — attach `ref` to the element to observe; once it
// has entered the viewport `inView` flips to `true` and (by default) stays
// true, so the section doesn't unmount/remount every time it scrolls past
// (that would re-run each chart's own animations/derived state for no
// reason). Pass `{ once: false }` to have it track visibility live instead.
//
// No IntersectionObserver in the runtime (very old browser, or a test
// environment that hasn't mocked it) → falls back to `inView: true` so the
// section still renders rather than staying hidden forever.
export function useInView({ rootMargin = '200px', threshold = 0, once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.unobserve(el);
          } else if (!once) {
            setInView(false);
          }
        });
      },
      { rootMargin, threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  return [ref, inView];
}
