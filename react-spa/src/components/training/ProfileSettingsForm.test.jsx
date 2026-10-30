import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import { ProfileSettingsForm } from './ProfileSettingsForm';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';
import { queryKeys } from '../../data/keys';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

const PROFILE = { id: 1, experience_level: 'intermediate', time_available: 5, workouts_per_week: 3, preferred_days: ['monday', 'wednesday'] };

function renderForm(props = {}) {
  queryClient.setQueryData(queryKeys.profile, PROFILE);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ProfileSettingsForm open onSaved={onSaved} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onSaved };
}

describe('ProfileSettingsForm', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders nothing while closed', () => {
    queryClient.setQueryData(queryKeys.profile, PROFILE);
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ProfileSettingsForm open={false} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills from the profile and caps preferred days at the workouts-per-week count', async () => {
    renderForm();
    expect(screen.getByLabelText('Experience Level:')).toHaveValue('intermediate');
    expect(screen.getByLabelText('Training Time (hours per week):')).toHaveValue(5);
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByText('Selected: 2 / 3 days')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Friday' }));
    expect(screen.getByText('Selected: 3 / 3 days')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    expect(await screen.findByText('You can only select up to 3 training days per week.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sunday' })).not.toBeChecked();
    expect(screen.getByText('Selected: 3 / 3 days')).toBeInTheDocument();
  });

  it('trims preferred days when the workouts-per-week count is lowered', () => {
    renderForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Friday' }));
    fireEvent.change(screen.getByLabelText('Number of Workouts per Week:'), { target: { value: '3' } });
    // Lowering below the current selection keeps only the first N days.
    fireEvent.change(screen.getByLabelText('Number of Workouts per Week:'), { target: { value: '4' } });
    expect(screen.getByText('Selected: 3 / 4 days')).toBeInTheDocument();
  });

  it('saves through PUT /api/user-profile, invalidates the training plan and reports back', async () => {
    call.mockResolvedValue({ ...PROFILE, experience_level: 'advanced' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { onSaved } = renderForm();

    fireEvent.change(screen.getByLabelText('Experience Level:'), { target: { value: 'advanced' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/user-profile' }),
        { body: { ...PROFILE, experience_level: 'advanced' } },
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.trainingPlan });
  });

  it('toasts when saving fails', async () => {
    call.mockRejectedValue(new Error('500'));
    const { onSaved } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(await screen.findByText('Failed to save settings')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
