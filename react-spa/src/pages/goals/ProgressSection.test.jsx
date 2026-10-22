import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProgressSection from './ProgressSection';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderSection(subGoals) {
  return render(
    <MemoryRouter initialEntries={['/goals/3']}>
      <Routes>
        <Route path="/goals/3" element={<ProgressSection metaGoal={{ id: 3, title: 'Ride 1000 km' }} relevantSubGoals={subGoals} />} />
        <Route path="/coach" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProgressSection', () => {
  it('averages the server-computed percents and labels the stage', () => {
    renderSection([
      { id: 1, percent: 80 },
      { id: 2, percent: 40 },
    ]);
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('Making Progress')).toBeInTheDocument();
  });

  it('reports "Behind Schedule" when any sub-goal pace says so, regardless of the average', () => {
    renderSection([
      { id: 1, percent: 95, pace: { onTrack: false, percentDelta: -20 } },
      { id: 2, percent: 90 },
    ]);
    expect(screen.getByText('93')).toBeInTheDocument();
    expect(screen.getByText('Behind Schedule')).toBeInTheDocument();
  });

  it('shows 0 % and the starting label with no sub-goals', () => {
    renderSection([]);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Just Getting Started')).toBeInTheDocument();
  });

  it('links to the coach with a prompt about this goal', () => {
    renderSection([{ id: 1, percent: 10 }]);
    fireEvent.click(screen.getByRole('button', { name: /Ask your AI coach/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/coach?${new URLSearchParams({ prompt: 'Can you give me some advice about my goal "Ride 1000 km"?' })}`,
    );
  });
});
