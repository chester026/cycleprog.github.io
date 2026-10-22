import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityFilters } from './ActivityFilters';
import { DEFAULT_FILTERS } from './lib';

function renderFilters(props = {}) {
  const onFiltersChange = vi.fn();
  const onToggleFilters = vi.fn();
  const onReset = vi.fn();
  render(
    <ActivityFilters
      filters={DEFAULT_FILTERS}
      onFiltersChange={onFiltersChange}
      types={['Ride', 'VirtualRide']}
      showFilters
      onToggleFilters={onToggleFilters}
      onReset={onReset}
      {...props}
    />,
  );
  return { onFiltersChange, onToggleFilters, onReset };
}

describe('ActivityFilters', () => {
  it('reports a single changed field merged into the current filters', () => {
    const { onFiltersChange } = renderFilters({ filters: { ...DEFAULT_FILTERS, name: 'loop' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'VirtualRide' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, name: 'loop', type: 'VirtualRide' });

    fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: 'hill' } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, name: 'hill' });
  });

  it('lists the available ride types plus "All"', () => {
    renderFilters();
    const options = Array.from(screen.getByLabelText('Type').querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['All', 'Ride', 'VirtualRide']);
  });

  it('hides the fields when collapsed and toggles through the arrow button', () => {
    const { onToggleFilters } = renderFilters({ showFilters: false });
    expect(screen.getByLabelText('Search by name')).not.toBeVisible();
    const toggle = screen.getByRole('button', { name: '▲' });
    fireEvent.click(toggle);
    expect(onToggleFilters).toHaveBeenCalledTimes(1);
  });

  it('calls onReset from the reset button', () => {
    const { onReset } = renderFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
