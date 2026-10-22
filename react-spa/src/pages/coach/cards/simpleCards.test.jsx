import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoalCreatedCard from './GoalCreatedCard';
import GoalCompletedCard from './GoalCompletedCard';
import ChecklistUpdatedCard from './ChecklistUpdatedCard';
import CoachMemoryCard from './CoachMemoryCard';
import ProfileUpdatedCard from './ProfileUpdatedCard';
import CalendarEventCreatedCard from './CalendarEventCreatedCard';
import CalendarPlanCreatedCard from './CalendarPlanCreatedCard';

// Fixtures mirror BikeLabApp/src/components/coach/*.test.tsx.

describe('GoalCreatedCard', () => {
  it('shows eyebrow, title, description and opens the goal on click', () => {
    const onPress = vi.fn();
    render(<GoalCreatedCard goal={{ id: 9, title: 'Gran Fondo', description: '160 km in May', tier: 'epic' }} onPress={onPress} />);
    const card = screen.getByRole('button');
    expect(card).toHaveTextContent('Goal created');
    expect(card).toHaveTextContent('Gran Fondo');
    expect(card).toHaveTextContent('160 km in May');
    expect(card).toHaveTextContent('View Details →');
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('GoalCompletedCard', () => {
  it('shows eyebrow, title and ride count, and opens the goal on click', () => {
    const onPress = vi.fn();
    render(<GoalCompletedCard goal={{ goalId: 4, title: 'Gran Fondo', ridesCount: 2 }} onPress={onPress} />);
    expect(screen.getByText('Goal completed')).toBeInTheDocument();
    expect(screen.getByText('Gran Fondo')).toBeInTheDocument();
    expect(screen.getByText('2 rides attached')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('goal-completed-card'));
    expect(onPress).toHaveBeenCalled();
  });

  it('uses the singular for one ride and omits the line when none were attached', () => {
    const { rerender } = render(<GoalCompletedCard goal={{ goalId: 4, title: 'Base', ridesCount: 1 }} onPress={vi.fn()} />);
    expect(screen.getByText('1 ride attached')).toBeInTheDocument();
    rerender(<GoalCompletedCard goal={{ goalId: 4, title: 'Base', ridesCount: 0 }} onPress={vi.fn()} />);
    expect(screen.queryByText(/attached/)).toBeNull();
  });
});

describe('ChecklistUpdatedCard', () => {
  it('lists added items with the section name', () => {
    render(
      <ChecklistUpdatedCard
        summary={{ type: 'added', section: 'Clothes', items: [{ id: 1, item: 'Bibs' }, { id: 2, item: 'Jersey' }] }}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText('Clothes')).toBeInTheDocument();
    expect(screen.getByText('• Bibs')).toBeInTheDocument();
    expect(screen.getByText('• Jersey')).toBeInTheDocument();
  });

  it('shows "Checked off: X" for a checked update and a removed message for a delete', () => {
    const { rerender } = render(<ChecklistUpdatedCard summary={{ type: 'checked', item: 'Helmet' }} onPress={vi.fn()} />);
    expect(screen.getByText('Checked off: Helmet')).toBeInTheDocument();
    rerender(<ChecklistUpdatedCard summary={{ type: 'removed' }} onPress={vi.fn()} />);
    expect(screen.getByText('Item removed')).toBeInTheDocument();
  });

  it('calls onPress when clicked', () => {
    const onPress = vi.fn();
    render(<ChecklistUpdatedCard summary={{ type: 'checked', item: 'Helmet' }} onPress={onPress} />);
    fireEvent.click(screen.getByTestId('checklist-updated-card'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('CoachMemoryCard', () => {
  it('shows "Remembered: X" / "Forgot: X" and calls onPress when clicked', () => {
    const onPress = vi.fn();
    const { rerender } = render(<CoachMemoryCard update={{ type: 'remembered', note: 'Prefers morning rides' }} onPress={onPress} />);
    expect(screen.getByText('Remembered: Prefers morning rides')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('coach-memory-card'));
    expect(onPress).toHaveBeenCalled();
    rerender(<CoachMemoryCard update={{ type: 'forgotten', note: 'Knee hurts on climbs' }} onPress={vi.fn()} />);
    expect(screen.getByText('Forgot: Knee hurts on climbs')).toBeInTheDocument();
  });
});

describe('ProfileUpdatedCard', () => {
  it('renders only the fields present in `updated`, joined with a middle dot', () => {
    render(<ProfileUpdatedCard updated={{ weight: 78, max_hr: 186 }} />);
    expect(screen.getByText('Weight 78 kg · Max HR 186 bpm')).toBeInTheDocument();
  });

  it('omits null fields and includes height (missing from the app)', () => {
    render(<ProfileUpdatedCard updated={{ weight: 78, height: 182, age: null }} />);
    expect(screen.getByText('Weight 78 kg · Height 182 cm')).toBeInTheDocument();
  });

  it('renders nothing for an unrecognised/empty update', () => {
    const { container } = render(<ProfileUpdatedCard updated={{ unknown_field: 'x' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CalendarEventCreatedCard', () => {
  const event = {
    id: 1,
    type: 'planned_ride',
    title: 'Tempo ride',
    description: '2 x 20 min',
    start_date: '2026-10-20',
    location: 'Troodos',
    goal_id: 5,
    goal_title: 'Ride 1000 km',
  };

  it('shows type, local day, location, description and the goal chip', () => {
    const onPress = vi.fn();
    render(<CalendarEventCreatedCard event={event} onPress={onPress} />);
    const card = screen.getByTestId('calendar-event-created-card');
    expect(card).toHaveTextContent('Added to Calendar');
    expect(card).toHaveTextContent('Tempo ride');
    expect(card).toHaveTextContent(/Planned Ride · .*Oct 20 · Troodos/);
    expect(card).toHaveTextContent('2 x 20 min');
    expect(card).toHaveTextContent('Goal: Ride 1000 km');
    expect(card).toHaveTextContent('View in Calendar →');
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalled();
  });

  it('falls back to the raw type for an unknown one and skips absent fields', () => {
    render(<CalendarEventCreatedCard event={{ id: 2, type: 'training', title: 'X', start_date: '2026-10-21' }} onPress={vi.fn()} />);
    const card = screen.getByTestId('calendar-event-created-card');
    expect(card).toHaveTextContent(/training · .*Oct 21/);
    expect(card).not.toHaveTextContent('Goal:');
  });
});

describe('CalendarPlanCreatedCard', () => {
  const events = [
    { id: 1, type: 'planned_ride', title: 'A', start_date: '2026-10-22', goal_title: 'Ride 1000 km' },
    { id: 2, type: 'rest_day', title: 'B', start_date: '2026-10-20', goal_title: 'Ride 1000 km' },
    { id: 3, type: 'planned_ride', title: 'C', start_date: '2026-10-26', goal_title: 'Ride 1000 km' },
  ];

  it('summarises the count, the sorted date range and the shared goal', () => {
    render(<CalendarPlanCreatedCard events={events} onPress={vi.fn()} />);
    const card = screen.getByTestId('calendar-plan-created-card');
    expect(card).toHaveTextContent('Plan Created');
    expect(card).toHaveTextContent('3 events added to your calendar');
    expect(card).toHaveTextContent('Oct 20 – Oct 26');
    expect(card).toHaveTextContent('Goal: Ride 1000 km');
  });

  it('shows no goal chip for a mixed batch and a single day when all events share it', () => {
    render(
      <CalendarPlanCreatedCard
        events={[
          { id: 1, type: 'planned_ride', title: 'A', start_date: '2026-10-22', goal_title: 'X' },
          { id: 2, type: 'planned_ride', title: 'B', start_date: '2026-10-22', goal_title: null },
        ]}
        onPress={vi.fn()}
      />,
    );
    const card = screen.getByTestId('calendar-plan-created-card');
    expect(card).toHaveTextContent('Oct 22');
    expect(card).not.toHaveTextContent('Oct 22 –');
    expect(card).not.toHaveTextContent('Goal:');
  });
});
