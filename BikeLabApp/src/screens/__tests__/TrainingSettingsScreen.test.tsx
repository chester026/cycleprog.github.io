import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import {TrainingSettingsScreen} from '../TrainingSettingsScreen';
import {useProfile} from '../../data/hooks/useProfile';
import {useUpdateProfile} from '../../data/hooks/useUpdateProfile';
import {ApiError} from '../../utils/api';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
// utils/api pulls in react-native-config (ESM, not transformed): only the error class matters here.
jest.mock('../../utils/api', () => ({ApiError: jest.requireActual('@bikelab/shared/api').ApiError}));
jest.mock('../../data/hooks/useProfile', () => ({useProfile: jest.fn()}));
jest.mock('../../data/hooks/useUpdateProfile', () => ({useUpdateProfile: jest.fn()}));

const navigation = {goBack: jest.fn()} as any;

function renderScreen(mutateAsync = jest.fn().mockResolvedValue({})) {
  (useProfile as jest.Mock).mockReturnValue({
    isLoading: false,
    isError: false,
    data: {experience_level: 'intermediate', time_available: 8, workouts_per_week: 4},
  });
  (useUpdateProfile as jest.Mock).mockReturnValue({mutateAsync, isPending: false});
  render(<TrainingSettingsScreen navigation={navigation} />);
  return mutateAsync;
}

describe('TrainingSettingsScreen weekly load limits', () => {
  beforeEach(() => navigation.goBack.mockReset());

  it('shows the typical-hours hint and lets a valid value through', async () => {
    const mutateAsync = renderScreen();
    expect(screen.getByText('settings.hoursHint')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('training-hours-input'), '12');
    fireEvent.press(screen.getByText('common.save'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({time_available: 12, workouts_per_week: 4})));
  });

  it('flags hours outside 1-40 inline and does not submit', () => {
    const mutateAsync = renderScreen();

    fireEvent.changeText(screen.getByTestId('training-hours-input'), '41');
    fireEvent.press(screen.getByText('common.save'));

    expect(screen.getByTestId('training-hours-error')).toBeTruthy();
    expect(screen.queryByText('settings.hoursHint')).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('flags workouts outside 1-14 inline', () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('training-workouts-input'), '15');
    expect(screen.getByTestId('training-workouts-error')).toBeTruthy();
  });

  it("shows the server's 400 message inline instead of an alert", async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new ApiError(400, 'time_available must be at most 40', 'VALIDATION_ERROR'));
    renderScreen(mutateAsync);

    fireEvent.press(screen.getByText('common.save'));

    expect(await screen.findByText('time_available must be at most 40')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
