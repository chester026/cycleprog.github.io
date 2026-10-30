import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelab/shared/api';
import OnboardingModal from '../OnboardingModal';
import { call } from '../../data/api';
import { startStravaLink } from '../../utils/strava';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';
import { queryKeys } from '../../data/keys';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../../utils/strava', () => ({ startStravaLink: vi.fn() }));

const login = vi.fn();
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ login, isAuthenticated: true, isLoading: false }),
}));

function renderModal(profile, props = {}) {
  // Seed the profile cache so the wizard knows the auth type synchronously.
  queryClient.setQueryData(queryKeys.profile, profile);
  const onComplete = vi.fn();
  const onSkip = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <OnboardingModal isOpen onComplete={onComplete} onSkip={onSkip} {...props} />
    </QueryClientProvider>,
  );
  return { onComplete, onSkip };
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Next|Complete Setup/ }));

describe('OnboardingModal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
    login.mockReset().mockResolvedValue(undefined);
    startStravaLink.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders nothing when closed', () => {
    queryClient.setQueryData(queryKeys.profile, { id: 1, email: 'a@b.c', strava_id: 1 });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <OnboardingModal isOpen={false} onComplete={() => {}} onSkip={() => {}} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('walks a fully-set-up account through 3 steps, validating ranges along the way', async () => {
    call.mockResolvedValue({ id: 1, onboarding_completed: true });
    const { onComplete } = renderModal({ id: 1, email: 'a@b.c', strava_id: 1 });

    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personal Information' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Height (cm)'), { target: { value: '300' } });
    next();
    expect(screen.getByText('Height must be between 100 and 250 cm')).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Height (cm)'), { target: { value: '180' } });
    expect(screen.queryByText('Height must be between 100 and 250 cm')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '72' } });
    fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'male' } });
    next();

    expect(screen.getByRole('heading', { name: 'Heart Rate Zones' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Maximum Heart Rate (bpm)'), { target: { value: '190' } });
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(180);
    next();
    next();

    expect(screen.getByRole('heading', { name: 'Experience Level' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Advanced'));
    expect(screen.getByRole('button', { name: 'Complete Setup' })).toBeInTheDocument();
    next();

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/user-profile/onboarding' }),
        { body: { height: '180', weight: '72', gender: 'male', max_hr: '190', experience_level: 'advanced' } },
      ),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(login).not.toHaveBeenCalled();
  });

  it('adds an email step for Strava-only accounts and logs in with the fresh token', async () => {
    call.mockImplementation((def) => {
      if (def.path === '/api/user-profile/onboarding') return Promise.resolve({ id: 1 });
      if (def.path === '/api/user-profile/email') return Promise.resolve({ success: true, token: 'fresh' });
      return Promise.reject(new Error(`unexpected ${def.path}`));
    });
    const { onComplete } = renderModal({ id: 1, email: null, strava_id: 99 });
    expect(screen.getByText('of 4')).toBeInTheDocument();

    next();
    next();
    next();
    expect(screen.getByRole('heading', { name: 'Email Address' })).toBeInTheDocument();
    next();
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'rider@example.com' } });
    next();

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/user-profile/email' }),
        { body: { email: 'rider@example.com' } },
      ),
    );
    await waitFor(() => expect(login).toHaveBeenCalledWith({ token: 'fresh' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('explains a taken email instead of the generic failure', async () => {
    call.mockImplementation((def) => {
      if (def.path === '/api/user-profile/onboarding') return Promise.resolve({ id: 1 });
      return Promise.reject(new ApiError(409, 'conflict', 'EMAIL_TAKEN'));
    });
    const { onComplete } = renderModal({ id: 1, email: null, strava_id: 99 });
    next();
    next();
    next();
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'taken@example.com' } });
    next();
    expect(await screen.findByText('That email is already used by another account.')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('adds a Strava step for email-only accounts and reports a popup that could not open', async () => {
    startStravaLink.mockResolvedValue(null);
    renderModal({ id: 1, email: 'a@b.c', strava_id: null });
    expect(screen.getByText('of 4')).toBeInTheDocument();
    next();
    next();
    next();
    expect(screen.getByText('By connecting Strava, you will:')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Connect with Strava/ }));
    expect(await screen.findByText('Could not open the Strava connection window.')).toBeInTheDocument();
    expect(startStravaLink).toHaveBeenCalledWith({ popup: true });
  });

  it('skips by marking onboarding completed, and still closes if that request fails', async () => {
    call.mockRejectedValue(new Error('offline'));
    const { onSkip } = renderModal({ id: 1, email: 'a@b.c', strava_id: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/user-profile/onboarding' }),
      { body: { onboarding_completed: true } },
    );
  });

  it('shows the generic failure message when saving fails', async () => {
    call.mockRejectedValue(new Error('500'));
    renderModal({ id: 1, email: 'a@b.c', strava_id: 1 });
    next();
    next();
    next();
    expect(await screen.findByText('Failed to save your data. Please try again.')).toBeInTheDocument();
  });
});
