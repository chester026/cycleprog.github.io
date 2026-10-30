import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import TrainingLibraryModal from '../TrainingLibraryModal';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const TYPES = [
  { key: 'endurance', name: 'Endurance', intensity: '65-75% FTP', cadence: '85 rpm', hr_zones: 'Z2', benefits: ['Base', 'Fat burn', 'Third'] },
  { key: 'custom_thing', name: 'Custom', intensity: '?', benefits: [] },
];

function renderModal(props = {}) {
  const onTrainingClick = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <TrainingLibraryModal isOpen onClose={onClose} onTrainingClick={onTrainingClick} {...props} />
    </QueryClientProvider>,
  );
  return { onTrainingClick, onClose };
}

describe('TrainingLibraryModal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('does not fetch the catalogue while closed', () => {
    renderModal({ isOpen: false });
    expect(call).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the catalogue with the per-type blurb, default duration and the first two benefits', async () => {
    call.mockResolvedValue(TYPES);
    const { onTrainingClick } = renderModal();

    expect(await screen.findByText('Endurance')).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/api/training-types' }));
    const enduranceCard = screen.getByRole('button', { name: /Endurance/ });
    expect(enduranceCard).toHaveTextContent('Long steady rides to build aerobic base');
    expect(enduranceCard).toHaveTextContent('120 min');
    expect(enduranceCard).toHaveTextContent('Base');
    expect(enduranceCard).toHaveTextContent('Fat burn');
    expect(enduranceCard).not.toHaveTextContent('Third');

    // Unknown keys fall back to 60 min, no blurb, no benefits block.
    const customCard = screen.getByRole('button', { name: /Custom/ });
    expect(customCard).toHaveTextContent('60 min');
    expect(customCard).not.toHaveTextContent('Benefits:');

    fireEvent.click(enduranceCard);
    expect(onTrainingClick).toHaveBeenCalledWith(TYPES[0]);
    fireEvent.keyDown(customCard, { key: 'Enter' });
    expect(onTrainingClick).toHaveBeenCalledWith(TYPES[1]);
  });

  it('closes from the header button', async () => {
    call.mockResolvedValue([]);
    const { onClose } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
