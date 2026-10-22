import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import TrainingDayModal from '../TrainingDayModal';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const TYPES = [
  { key: 'endurance', name: 'Endurance', intensity: '65-75% FTP' },
  { key: 'sprint', name: 'Sprint', intensity: '150% FTP', cadence: '110 rpm', hr_zones: 'Z5' },
];

function mockApi() {
  call.mockImplementation((def) => {
    if (def.path === '/api/training-types') return Promise.resolve(TYPES);
    if (def.path === '/api/training-plan') return Promise.resolve({ plan: {} });
    return Promise.resolve({ success: true });
  });
}

function savedBodies() {
  return call.mock.calls.filter(([def]) => def.path === '/api/training-plan/custom').map(([, input]) => input.body);
}

function renderModal(props = {}) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <TrainingDayModal isOpen onClose={onClose} dayKey="tuesday" dayName="Tuesday" currentTraining={null} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('TrainingDayModal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
    mockApi();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('builds a composite training from the selected types and saves it for the day', async () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Training Setup for Tuesday' })).toBeInTheDocument();
    expect(await screen.findByText('Endurance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Selected/ })).not.toBeInTheDocument();

    const sprintCard = screen.getByRole('button', { name: /Sprint/ });
    expect(sprintCard).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sprintCard);
    expect(sprintCard).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(screen.getByRole('button', { name: /Endurance/ }), { key: ' ' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add Selected (2)' }));

    await waitFor(() => expect(savedBodies()).toHaveLength(1));
    expect(savedBodies()[0]).toEqual({
      dayKey: 'tuesday',
      training: {
        type: 'composite',
        name: '2 parts',
        details: TYPES[0],
        parts: [
          { type: 'sprint', duration: 20, intensity: '150% FTP' },
          { type: 'endurance', duration: 120, intensity: '65-75% FTP' },
        ],
      },
    });
    expect(screen.getByText('Added Trainings')).toBeInTheDocument();
    expect(screen.getByText('20 min • 150% FTP')).toBeInTheDocument();
    expect(sprintCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('removing the last part deletes the custom day instead of saving an empty one', async () => {
    renderModal({ currentTraining: { type: 'composite', parts: [{ type: 'sprint', duration: 20, intensity: '150% FTP' }] } });
    await screen.findByText('Sprint', { selector: '.added-training-name' });

    fireEvent.click(screen.getByTitle('Remove training'));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/training-plan/custom/:dayKey' }),
        { params: { dayKey: 'tuesday' } },
      ),
    );
    expect(savedBodies()).toHaveLength(0);
    expect(screen.queryByText('Added Trainings')).not.toBeInTheDocument();
  });

  it('renames a composite to the single remaining type when one part is removed', async () => {
    renderModal({
      currentTraining: {
        type: 'composite',
        parts: [
          { type: 'sprint', duration: 20, intensity: '150% FTP' },
          { type: 'endurance', duration: 120, intensity: '65-75% FTP' },
        ],
      },
    });
    // Wait for the catalogue: the composite name comes from the library names.
    await screen.findByRole('button', { name: /Endurance/ });
    fireEvent.click(screen.getAllByTitle('Remove training')[0]);
    await waitFor(() => expect(savedBodies()).toHaveLength(1));
    expect(savedBodies()[0].training.name).toBe('Endurance');
    expect(savedBodies()[0].training.parts).toHaveLength(1);
  });

  it('toggles a rest day on (saves a rest entry) and off (deletes it)', async () => {
    renderModal();
    await screen.findByText('Endurance');
    const toggle = screen.getByRole('checkbox', { name: 'Rest Day' });

    fireEvent.click(toggle);
    expect(screen.getByText('Complete recovery and rest from training')).toBeInTheDocument();
    await waitFor(() => expect(savedBodies()).toEqual([{ dayKey: 'tuesday', training: { type: 'rest', name: 'Rest day' } }]));

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/training-plan/custom/:dayKey' }),
        { params: { dayKey: 'tuesday' } },
      ),
    );
    expect(screen.getByText('Select Training Types')).toBeInTheDocument();
  });

  it('starts in rest mode for a rest day and clears everything via Clear All', async () => {
    const { onClose } = renderModal({ currentTraining: { type: 'rest' } });
    expect(screen.getByRole('checkbox', { name: 'Rest Day' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Clear All deletes the day', async () => {
    renderModal({ currentTraining: { type: 'composite', parts: [{ type: 'sprint', duration: 20, intensity: 'x' }] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear All' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/training-plan/custom/:dayKey' }),
        { params: { dayKey: 'tuesday' } },
      ),
    );
  });
});
