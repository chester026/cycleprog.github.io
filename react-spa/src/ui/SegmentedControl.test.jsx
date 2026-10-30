import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SegmentedControl from './SegmentedControl';

const options = [
  { value: 'coach', label: 'AI Coach' },
  { value: 'goals', label: 'Goals' },
];

describe('SegmentedControl', () => {
  it('renders a tablist with the active tab selected', () => {
    render(<SegmentedControl aria-label="Section" options={options} value="goals" onChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Section' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Goals' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'AI Coach' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange on click and on arrow keys', () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Section" options={options} value="coach" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Goals' }));
    expect(onChange).toHaveBeenLastCalledWith('goals');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'AI Coach' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('goals');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'AI Coach' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('goals');
  });
});
