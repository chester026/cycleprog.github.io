import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import styles from './Textarea.module.css';

/**
 * Autosizing textarea: grows with its content between `minRows` and
 * `maxRows`, then scrolls. Controlled (`value`/`onChange`) like a native
 * textarea; every other prop (placeholder, aria-label, onKeyDown…) passes
 * through. Always give it a label (`aria-label` or `<label htmlFor>`).
 */
const Textarea = React.forwardRef(function Textarea(
  { value, onChange, minRows = 1, maxRows = 6, className, ...rest },
  forwardedRef,
) {
  const innerRef = useRef(null);
  useImperativeHandle(forwardedRef, () => innerRef.current);

  const resize = useCallback(() => {
    const node = innerRef.current;
    if (!node) return;
    const computed = window.getComputedStyle(node);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const padding = parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
    const border = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
    const minHeight = minRows * lineHeight + padding + border;
    const maxHeight = maxRows * lineHeight + padding + border;
    // Collapse first so scrollHeight reflects the current content, not the
    // previous (taller) box.
    node.style.height = 'auto';
    const next = Math.min(Math.max(node.scrollHeight + border, minHeight), maxHeight);
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight + border > maxHeight ? 'auto' : 'hidden';
  }, [minRows, maxRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={innerRef}
      value={value}
      onChange={onChange}
      rows={minRows}
      className={[styles.textarea, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
});

export default Textarea;
