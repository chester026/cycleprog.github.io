import React from 'react';
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react-native';
import {Alert} from 'react-native';
import {CoachMemoryScreen} from '../CoachMemoryScreen';
import {
  useCoachNotes,
  useCreateCoachNote,
  useUpdateCoachNote,
  useDeleteCoachNote,
} from '../../data/hooks/useCoachNotes';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${Object.values(opts).join(',')}` : key,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));

jest.mock('../../data/hooks/useCoachNotes', () => ({
  useCoachNotes: jest.fn(),
  useCreateCoachNote: jest.fn(),
  useUpdateCoachNote: jest.fn(),
  useDeleteCoachNote: jest.fn(),
}));

const mockedUseCoachNotes = useCoachNotes as jest.Mock;
const mockedUseCreateCoachNote = useCreateCoachNote as jest.Mock;
const mockedUseUpdateCoachNote = useUpdateCoachNote as jest.Mock;
const mockedUseDeleteCoachNote = useDeleteCoachNote as jest.Mock;

const navigation = {goBack: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true)} as any;

const notes = [
  {id: 1, note: 'Prefers morning rides', category: 'preference', source: 'coach', created_at: '', updated_at: ''},
  {id: 2, note: 'Knee hurts on long climbs', category: 'health', source: 'user', created_at: '', updated_at: ''},
];

describe('CoachMemoryScreen', () => {
  const createMutate = jest.fn();
  const updateMutate = jest.fn();
  const deleteMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseCreateCoachNote.mockReturnValue({mutateAsync: createMutate, isPending: false});
    mockedUseUpdateCoachNote.mockReturnValue({mutateAsync: updateMutate, isPending: false});
    mockedUseDeleteCoachNote.mockReturnValue({mutate: deleteMutate});
  });

  it('shows the empty state when there are no notes', () => {
    mockedUseCoachNotes.mockReturnValue({data: [], isLoading: false});
    render(<CoachMemoryScreen navigation={navigation} />);
    expect(screen.getByText('coachMemory.empty')).toBeTruthy();
  });

  it('lists each note with its category pill and a "count/max" cap indicator', () => {
    mockedUseCoachNotes.mockReturnValue({data: notes, isLoading: false});
    render(<CoachMemoryScreen navigation={navigation} />);

    expect(screen.getByText('Prefers morning rides')).toBeTruthy();
    expect(screen.getByText('Knee hurts on long climbs')).toBeTruthy();
    // Scoped to each row — the (off-screen but still mounted) edit sheet
    // reuses the same category labels for its chip row, so an unscoped
    // query would match twice.
    expect(within(screen.getByTestId('coach-note-1')).getByText('coachMemory.categoryPreference')).toBeTruthy();
    expect(within(screen.getByTestId('coach-note-2')).getByText('coachMemory.categoryHealth')).toBeTruthy();
    expect(screen.getByText('coachMemory.cap:2,30')).toBeTruthy();
  });

  it('opens the add-note sheet and creates a note', async () => {
    createMutate.mockResolvedValue(undefined);
    mockedUseCoachNotes.mockReturnValue({data: notes, isLoading: false});
    render(<CoachMemoryScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('coachMemory.addNote'));
    expect(screen.getByText('coachMemory.addNoteTitle')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('coachMemory.notePlaceholder'), 'Likes hill repeats');
    fireEvent.press(screen.getAllByText('coachMemory.addNote')[1]);

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith({note: 'Likes hill repeats', category: 'other'}),
    );
  });

  it('opens a note for editing on tap and updates it', async () => {
    updateMutate.mockResolvedValue(undefined);
    mockedUseCoachNotes.mockReturnValue({data: notes, isLoading: false});
    render(<CoachMemoryScreen navigation={navigation} />);

    fireEvent.press(screen.getByTestId('coach-note-1'));
    expect(screen.getByText('coachMemory.editNoteTitle')).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('Prefers morning rides'), 'Prefers evening rides');
    fireEvent.press(screen.getByText('common.save'));

    await waitFor(() =>
      expect(updateMutate).toHaveBeenCalledWith({id: 1, body: {note: 'Prefers evening rides', category: 'preference'}}),
    );
  });

  it('deletes a note from its row after confirming', () => {
    mockedUseCoachNotes.mockReturnValue({data: notes, isLoading: false});
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.[1]?.onPress?.();
    });
    render(<CoachMemoryScreen navigation={navigation} />);

    fireEvent.press(screen.getByTestId('coach-note-delete-1'));

    expect(alertSpy).toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledWith(1);
    alertSpy.mockRestore();
  });

  it('goes back when the header back arrow is pressed', () => {
    mockedUseCoachNotes.mockReturnValue({data: [], isLoading: false});
    render(<CoachMemoryScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('‹'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  // Opened from the chat's CoachMemoryCard the screen can be the only route
  // in ProfileStack — the back arrow must land on Profile, not leave the tab.
  it('falls back to Profile when there is nothing to go back to', () => {
    mockedUseCoachNotes.mockReturnValue({data: [], isLoading: false});
    navigation.canGoBack.mockReturnValueOnce(false);
    render(<CoachMemoryScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('‹'));
    expect(navigation.navigate).toHaveBeenCalledWith('Profile');
  });
});
