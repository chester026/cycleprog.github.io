import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DayGrid } from './DayGrid';

const weeklyPlan = {
  plan: {
    monday: { type: 'endurance' },
    tuesday: { type: 'rest' },
    wednesday: { type: 'rest' },
    thursday: { type: 'rest' },
    friday: { type: 'rest' },
    saturday: { type: 'rest' },
    sunday: { type: 'rest' },
  },
  customPlan: {
    monday: { type: 'tempo', details: { intensity: '90% FTP', duration: '60 min', cadence: '90 rpm' } },
  },
};

describe('DayGrid (manual view)', () => {
  it('shows a custom day with its details and the custom indicator', () => {
    render(<DayGrid weeklyPlan={weeklyPlan} customPlan={{}} trainingTypes={[]} onDayClick={vi.fn()} />);

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('✏️')).toBeInTheDocument();
    expect(screen.getByText(/90% FTP/)).toBeInTheDocument();
  });

  it('shows "Add training" for a day with no custom entry and the plan not shown (manual view)', () => {
    render(<DayGrid weeklyPlan={weeklyPlan} customPlan={{}} trainingTypes={[]} onDayClick={vi.fn()} />);

    // Tuesday has no custom entry — manual view never shows the generated
    // plan, so it renders as empty even though weeklyPlan.plan.tuesday exists.
    const tuesdayCard = screen.getByText('Tue').closest('.calendar-day');
    expect(tuesdayCard).toHaveTextContent('Add training');
  });

  it('calls onDayClick with the day key and its current training', () => {
    const onDayClick = vi.fn();
    render(<DayGrid weeklyPlan={weeklyPlan} customPlan={{}} trainingTypes={[]} onDayClick={onDayClick} />);

    fireEvent.click(screen.getByText('Mon').closest('.calendar-day'));
    expect(onDayClick).toHaveBeenCalledWith('monday', weeklyPlan.customPlan.monday);

    fireEvent.click(screen.getByText('Tue').closest('.calendar-day'));
    expect(onDayClick).toHaveBeenCalledWith('tuesday', null);
  });
});
