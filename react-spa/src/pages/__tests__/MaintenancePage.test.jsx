import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import MaintenancePage from '../MaintenancePage';
import { apiFetch } from '../../utils/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

// T-6.3: `window.confirm`/`alert` on "Mark as Replaced" -> useConfirm/useToast.
function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MaintenancePage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const health = {
  overallHealth: 80,
  riderProfile: { profile: 'Climber' },
  ridingStyle: { climbing: 70, sprint: 20, power: 40 },
  nextService: { inKm: 0, component: 'chain' },
  groupLabels: {},
  componentLabels: {},
  components: [
    { id: 'chain', status: 'warning', healthPercent: 40, remainingKm: 500, kmSinceReset: 1200, effectiveKm: 1200, baseLifecycle: 2000, weightFactor: 1, styleFactor: 1 },
  ],
};

function mockApi() {
  apiFetch.mockImplementation((url) => {
    if (url === '/api/bikes') {
      return Promise.resolve([{ id: 1, name: 'Road bike', primary: true, distanceKm: 1000, activitiesCount: 20 }]);
    }
    if (url === '/api/bikes/1/health') return Promise.resolve(health);
    if (url === '/api/bikes/1/components/chain/reset') return Promise.resolve({ success: true });
    return Promise.resolve({});
  });
}

describe('MaintenancePage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders the selected bike and its component board', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('Road bike')).toBeInTheDocument();
    expect(await screen.findByText('80')).toBeInTheDocument(); // overall health gauge
  });

  it('resets a component after confirming via the useConfirm dialog', async () => {
    mockApi();
    renderPage();

    // COMPONENT_LABELS['chain'] renders as the card's visible name.
    fireEvent.click(await screen.findByText('Chain', { exact: false }));

    fireEvent.click(screen.getByText('Mark as Replaced'));

    const dialog = await screen.findByRole('dialog', { name: 'Mark as replaced' });
    fireEvent.click(within(dialog).getByText('Mark as replaced', { selector: 'button' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/bikes/1/components/chain/reset', { method: 'POST' });
    });
  });
});
