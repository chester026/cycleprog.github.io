import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {ChecklistUpdatedCard} from './ChecklistUpdatedCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: {item?: string}) =>
      key === 'checklist.checkedOff' ? `Checked off: ${opts?.item}` : key,
  }),
}));

describe('ChecklistUpdatedCard', () => {
  it('lists added items with the section name', () => {
    render(
      <ChecklistUpdatedCard
        summary={{
          type: 'added',
          section: 'Clothes',
          items: [
            {id: 1, item: 'Bibs'},
            {id: 2, item: 'Jersey'},
          ],
        }}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Clothes')).toBeTruthy();
    expect(screen.getByText('• Bibs')).toBeTruthy();
    expect(screen.getByText('• Jersey')).toBeTruthy();
  });

  it('shows "Checked off: X" for a checked update', () => {
    render(<ChecklistUpdatedCard summary={{type: 'checked', item: 'Helmet'}} onPress={jest.fn()} />);
    expect(screen.getByText('Checked off: Helmet')).toBeTruthy();
  });

  it('shows a removed message for a deleted item', () => {
    render(<ChecklistUpdatedCard summary={{type: 'removed'}} onPress={jest.fn()} />);
    expect(screen.getByText('checklist.itemRemoved')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<ChecklistUpdatedCard summary={{type: 'checked', item: 'Helmet'}} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('checklist-updated-card'));
    expect(onPress).toHaveBeenCalled();
  });
});
