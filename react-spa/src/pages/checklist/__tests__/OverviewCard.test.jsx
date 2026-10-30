import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeOverview } from '@bikelab/shared/checklist';
import OverviewCard from '../OverviewCard';

const rows = [
  { id: 1, section: 'What to buy', item: 'Bicycle', checked: true },
  { id: 2, section: 'What to buy', item: 'Helmet', checked: false },
  { id: 3, section: 'What to do', item: 'Book hotel', checked: true },
];

describe('OverviewCard', () => {
  it('shows the ring percent, the status and the Open/Done/Sections rows', () => {
    render(<OverviewCard overview={computeOverview(rows)} onAskCoach={vi.fn()} />);

    expect(screen.getByText('67')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Almost ready' })).toBeInTheDocument();
    expect(screen.getByText('Open').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Done', { selector: 'dt' }).nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Sections').nextSibling).toHaveTextContent('2');
  });

  it('shows "Getting started" for an empty checklist', () => {
    render(<OverviewCard overview={computeOverview([])} onAskCoach={vi.fn()} />);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('carries the coach banner as its footer', () => {
    const onAskCoach = vi.fn();
    render(<OverviewCard overview={computeOverview([])} onAskCoach={onAskCoach} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask coach about your checklist/ }));
    expect(onAskCoach).toHaveBeenCalledTimes(1);
  });
});
