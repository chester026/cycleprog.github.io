import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Textarea from './Textarea';

function Controlled(props) {
  const [value, setValue] = useState('');
  return <Textarea aria-label="Message" value={value} onChange={(e) => setValue(e.target.value)} {...props} />;
}

describe('Textarea', () => {
  it('renders a labelled textarea that reflects typed text', () => {
    render(<Controlled />);
    const area = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(area, { target: { value: 'hello' } });
    expect(area).toHaveValue('hello');
    expect(area).toHaveAttribute('rows', '1');
  });

  it('forwards onKeyDown so a caller can bind Enter-to-send', () => {
    const onKeyDown = vi.fn();
    render(<Controlled onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('resizes between minRows and maxRows from the content height', () => {
    render(<Controlled minRows={2} maxRows={4} />);
    const area = screen.getByRole('textbox');
    // jsdom has no layout: fake the metrics the autosize reads.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '20px',
      paddingTop: '0px',
      paddingBottom: '0px',
      borderTopWidth: '0px',
      borderBottomWidth: '0px',
    });
    Object.defineProperty(area, 'scrollHeight', { configurable: true, get: () => 200 });
    fireEvent.change(area, { target: { value: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj' } });
    expect(area.style.height).toBe('80px');
    expect(area.style.overflowY).toBe('auto');

    Object.defineProperty(area, 'scrollHeight', { configurable: true, get: () => 10 });
    fireEvent.change(area, { target: { value: 'x' } });
    expect(area.style.height).toBe('40px');
    expect(area.style.overflowY).toBe('hidden');
    vi.restoreAllMocks();
  });
});
