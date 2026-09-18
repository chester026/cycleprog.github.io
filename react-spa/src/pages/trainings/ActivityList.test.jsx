import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityList } from './ActivityList';

function makeGroup(year, count) {
  return {
    year: String(year),
    activities: Array.from({ length: count }, (_, i) => ({
      id: `${year}-${i}`,
      name: `Ride ${year}-${i}`,
      start_date: `${year}-01-01`,
    })),
  };
}

describe('ActivityList', () => {
  it('shows "No trainings" when there are no activities', () => {
    render(<ActivityList groupedYears={[]} onAiAnalysis={() => {}} onShowDetails={() => {}} />);
    expect(screen.getByText('No trainings')).toBeInTheDocument();
  });

  it('renders year headers and rows, calling back on row actions', () => {
    const onShowDetails = vi.fn();
    render(
      <ActivityList
        groupedYears={[makeGroup(2024, 2)]}
        onAiAnalysis={() => {}}
        onShowDetails={onShowDetails}
      />
    );
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('Ride 2024-0')).toBeInTheDocument();
    const detailButtons = screen.getAllByTitle('View Details');
    fireEvent.click(detailButtons[0]);
    expect(onShowDetails).toHaveBeenCalled();
  });

  it('paginates with a "Show more" button when there are over 100 rows', () => {
    render(
      <ActivityList
        groupedYears={[makeGroup(2024, 150)]}
        onAiAnalysis={() => {}}
        onShowDetails={() => {}}
      />
    );
    expect(screen.getByText('Ride 2024-0')).toBeInTheDocument();
    expect(screen.queryByText('Ride 2024-149')).not.toBeInTheDocument();
    const showMore = screen.getByText(/Show more/);
    fireEvent.click(showMore);
    expect(screen.getByText('Ride 2024-149')).toBeInTheDocument();
  });
});
