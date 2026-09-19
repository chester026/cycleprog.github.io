import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {ChecklistPreview} from './ChecklistPreview';
import {useChecklist} from '../../data/hooks';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockNavigate = jest.fn();
jest.mock('../../navigation/hooks', () => ({
  useAppNavigation: () => ({navigate: mockNavigate}),
}));
jest.mock('../../data/hooks', () => ({useChecklist: jest.fn()}));

const mockedUseChecklist = useChecklist as jest.Mock;

const rows = [
  {id: 1, section: 'What to buy', item: 'Bicycle', checked: true},
  {id: 2, section: 'What to buy', item: 'Helmet', checked: false},
  {id: 3, section: 'What to do', item: 'Book hotel', checked: false},
];

describe('ChecklistPreview', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders nothing while loading', () => {
    mockedUseChecklist.mockReturnValue({data: undefined, isLoading: true});
    const {toJSON} = render(<ChecklistPreview />);
    expect(toJSON()).toBeNull();
  });

  it('shows the empty state when there are no sections', () => {
    mockedUseChecklist.mockReturnValue({data: [], isLoading: false});
    render(<ChecklistPreview />);
    expect(screen.getByText('checklist.previewTitle')).toBeTruthy();
    expect(screen.getByText('checklist.planUpgrades')).toBeTruthy();
  });

  it('renders a card per section with its progress and open items, plus a trailing new-item card', () => {
    mockedUseChecklist.mockReturnValue({data: rows, isLoading: false});
    render(<ChecklistPreview />);

    expect(screen.getByText('What to buy')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('Helmet')).toBeTruthy();
    expect(screen.getByText('What to do')).toBeTruthy();
    expect(screen.getByText('0/1')).toBeTruthy();
    expect(screen.getByText('checklist.newItem')).toBeTruthy();
  });

  it('navigates to the Checklist screen when a section card is pressed', () => {
    mockedUseChecklist.mockReturnValue({data: rows, isLoading: false});
    render(<ChecklistPreview />);

    fireEvent.press(screen.getByText('What to buy').parent!);
    expect(mockNavigate).toHaveBeenCalledWith('Checklist');
  });

  it('navigates to the Checklist screen focused on adding when the new-item card is pressed', () => {
    mockedUseChecklist.mockReturnValue({data: rows, isLoading: false});
    render(<ChecklistPreview />);

    fireEvent.press(screen.getByText('checklist.newItem').parent!);
    expect(mockNavigate).toHaveBeenCalledWith('Checklist', {focusAddItem: true});
  });
});
