import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {ChecklistOverviewCard} from './OverviewCard';
import {computeOverview} from './lib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

describe('ChecklistOverviewCard', () => {
  it('shows the ring percent and the open/done/sections rows', () => {
    const overview = computeOverview([
      {id: 1, section: 'What to buy', item: 'Bicycle', checked: true},
      {id: 2, section: 'What to buy', item: 'Helmet', checked: false},
      {id: 3, section: 'What to do', item: 'Book hotel', checked: true},
    ] as any);

    render(<ChecklistOverviewCard overview={overview} onAskCoach={jest.fn()} />);

    expect(screen.getByText('67')).toBeTruthy();
    expect(screen.getByText('checklist.status.almostReady')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // openItems
    // doneItems and totalSections are both 2 in this fixture.
    expect(screen.getAllByText('2')).toHaveLength(2);
  });

  it('shows the "gettingStarted" status for an empty checklist', () => {
    render(<ChecklistOverviewCard overview={computeOverview([])} onAskCoach={jest.fn()} />);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('checklist.status.gettingStarted')).toBeTruthy();
  });

  it('carries the coach banner as its own footer', () => {
    const onAskCoach = jest.fn();
    render(<ChecklistOverviewCard overview={computeOverview([])} onAskCoach={onAskCoach} />);

    fireEvent.press(screen.getByText('checklist.askCoach').parent!);
    expect(onAskCoach).toHaveBeenCalled();
  });
});
