import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { groupBySection } from '@bikelab/shared/checklist';
import SectionGrid from '../SectionGrid';

const rows = [
  { id: 1, section: 'What to buy', item: 'Bicycle', checked: true },
  { id: 2, section: 'What to buy', item: 'Helmet', checked: false, link: 'https://www.rei.com/x' },
];

function renderGrid(overrides = {}) {
  const props = {
    sections: groupBySection(rows),
    onToggleItem: vi.fn(),
    onOpenItem: vi.fn(),
    onAddItem: vi.fn(),
    onEditSection: vi.fn(),
    onNewSection: vi.fn(),
    ...overrides,
  };
  render(<SectionGrid {...props} />);
  return props;
}

describe('SectionGrid', () => {
  it('renders one column per section with its count and a card per item, unchecked first', () => {
    renderGrid();

    const column = screen.getByRole('region', { name: 'What to buy' });
    expect(within(column).getByRole('heading', { name: 'What to buy' })).toBeInTheDocument();
    expect(within(column).getByText('1/2')).toBeInTheDocument();

    const checks = within(column).getAllByRole('checkbox');
    expect(checks.map((c) => c.getAttribute('aria-label'))).toEqual(['Helmet', 'Bicycle']);
    expect(checks[0]).toHaveAttribute('aria-checked', 'false');
    expect(checks[1]).toHaveAttribute('aria-checked', 'true');

    const link = within(column).getByRole('link', { name: /rei\.com/ });
    expect(link).toHaveAttribute('href', 'https://www.rei.com/x');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('toggles an item from its check and opens the detail sheet from its name', () => {
    const { onToggleItem, onOpenItem } = renderGrid();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Helmet' }));
    expect(onToggleItem).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Helmet' }));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('asks to add an item to the column, edit the section, or start a new section', () => {
    const { onAddItem, onEditSection, onNewSection } = renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Add item to What to buy' }));
    expect(onAddItem).toHaveBeenCalledWith('What to buy');

    fireEvent.click(screen.getByRole('button', { name: 'Edit section What to buy' }));
    expect(onEditSection).toHaveBeenCalledWith(expect.objectContaining({ section: 'What to buy', done: 1, total: 2 }));

    fireEvent.click(screen.getByRole('button', { name: 'New section' }));
    expect(onNewSection).toHaveBeenCalledTimes(1);
  });

  it('renders only the "New section" column when there are no sections', () => {
    renderGrid({ sections: [] });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New section' })).toBeInTheDocument();
  });
});
