import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import WeeklyTrainingCalendar from '../WeeklyTrainingCalendar';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

const TYPES = [
  { key: 'tempo', name: 'Tempo', intensity: '90% FTP', duration: '60 min', cadence: '90 rpm', hr_zones: 'Z4', structure: { main: '2 x 20' } },
  { key: 'endurance', name: 'Endurance', intensity: '70% FTP', duration: '120 min' },
];

const PLAN = {
  priorities: ['tempo', 'endurance'],
  plan: {
    monday: { type: 'tempo', trainingType: 'tempo', name: 'Tuesday tempo', recommendation: 'Hold it', details: { intensity: '90% FTP', duration: '60' } },
    tuesday: { type: 'rest' },
    wednesday: { type: 'endurance', trainingType: 'endurance', name: 'Long one', recommendation: 'Go long', details: {} },
    thursday: { type: 'rest' },
    friday: { type: 'rest' },
    saturday: { type: 'rest' },
    sunday: { type: 'rest' },
  },
  customPlan: {},
  analysis: [{ goalType: 'distance', progress: 42.345, currentValue: 120, targetValue: 300, unit: 'km', priority: 7.25 }],
};

function mockApi({ plan = PLAN, failPlan = false, pending = false } = {}) {
  call.mockImplementation((def) => {
    switch (def.path) {
      case '/api/training-plan':
        if (pending) return new Promise(() => {});
        if (failPlan) return Promise.reject(new Error('no plan'));
        return Promise.resolve(plan);
      case '/api/training-types':
        return Promise.resolve(TYPES);
      case '/api/user-profile':
        return Promise.resolve({ id: 1 });
      default:
        return Promise.resolve({});
    }
  });
}

function renderCalendar(props = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <WeeklyTrainingCalendar {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('WeeklyTrainingCalendar', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows a loader while the plan loads', () => {
    mockApi({ pending: true });
    renderCalendar();
    expect(screen.getByRole('status', { name: 'Loading training plan...' })).toBeInTheDocument();
  });

  it('shows the error state and retries on "Try Again"', async () => {
    mockApi({ failPlan: true });
    renderCalendar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load training plan');

    mockApi();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('Most Recommended')).toBeInTheDocument();
  });

  it('renders the AI-generated view with the priority cards and the goal analysis', async () => {
    mockApi();
    renderCalendar();
    expect(await screen.findByText('Most Recommended')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tuesday tempo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Long one' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Goal Priority Analysis' })).toBeInTheDocument();
    expect(screen.getByText('Progress: 42.3% (120 / 300 km)')).toBeInTheDocument();
    expect(screen.getByText('7.3')).toBeInTheDocument();
  });

  it('opens the details modal for a priority workout', async () => {
    mockApi();
    renderCalendar();
    const tempo = (await screen.findByRole('heading', { name: 'Tuesday tempo' })).closest('.training-card');
    fireEvent.click(within(tempo).getByRole('button', { name: /How to train/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Tempo Training' })).toBeInTheDocument();
    expect(within(dialog).getByText('Intensity:').parentElement).toHaveTextContent('90% FTP');
  });

  it('switches to the manual day grid and opens the day editor for a day', async () => {
    mockApi();
    renderCalendar();
    await screen.findByText('Most Recommended');

    fireEvent.click(screen.getByRole('button', { name: 'Manual Plan' }));
    expect(screen.queryByText('Most Recommended')).not.toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Wed').closest('.calendar-day'));
    expect(await screen.findByRole('heading', { name: 'Training Setup for Wednesday' })).toBeInTheDocument();
  });

  it('opens the library from "More Trainings" and turns a picked type into the details modal', async () => {
    mockApi();
    renderCalendar();
    await screen.findByText('Most Recommended');

    fireEvent.click(screen.getByRole('button', { name: /More Trainings/ }));
    const library = screen.getByRole('dialog');
    expect(within(library).getByRole('heading', { name: 'Training Library' })).toBeInTheDocument();
    fireEvent.click(await within(library).findByRole('button', { name: /Tempo/ }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Training Library' })).not.toBeInTheDocument());
    const details = screen.getByRole('dialog');
    expect(within(details).getByRole('heading', { name: 'Tempo Training' })).toBeInTheDocument();
    expect(within(details).getByText('Main Part:').parentElement).toHaveTextContent('2 x 20');
  });

  it('builds the AI-generated view from the meta-goal training types when asked', async () => {
    mockApi();
    renderCalendar({
      mode: 'ai-generated',
      metaGoal: {
        trainingTypes: [
          { type: 'endurance', title: 'Base miles', description: 'Ride easy, ride far', priority: 1 },
          { type: 'tempo', title: 'Threshold work', description: 'Hurt a bit', priority: 2 },
        ],
      },
    });
    const most = (await screen.findByText('Most Recommended')).closest('.training-card');
    expect(most).toHaveTextContent('Base miles');
    expect(most).toHaveTextContent('Ride easy, ride far');
    expect(screen.getByRole('heading', { name: 'Threshold work' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tuesday tempo' })).not.toBeInTheDocument();
  });

  it('toggles the personal settings form from the header', async () => {
    mockApi();
    renderCalendar();
    await screen.findByText('Most Recommended');
    expect(screen.queryByRole('button', { name: 'Save Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Personal settings' }));
    expect(await screen.findByRole('button', { name: 'Save Settings' })).toBeInTheDocument();
  });
});
