import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import AiUsageTab from './AiUsageTab';
import { apiFetch } from '../../utils/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

// AiUsageTab reads its data via useAdminAiUsage(days) (T-6.3/T-4.4) —
// mock apiFetch at the hook boundary, same pattern as GoalsManager/UsersTab.
vi.mock('../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

function renderAiUsageTab() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AiUsageTab />
    </QueryClientProvider>,
  );
}

describe('AiUsageTab', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders per-user totals from the mocked useAdminAiUsage(7) hook', async () => {
    apiFetch.mockResolvedValueOnce({
      days: 7,
      users: [
        { user_id: 42, requests: '5', prompt_tokens: '1000', completion_tokens: '500', total_tokens: '1500' },
      ],
    });

    renderAiUsageTab();

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-usage?days=7');
  });

  it('refetches with days=30 when the 30-day toggle is clicked', async () => {
    apiFetch.mockResolvedValueOnce({ days: 7, users: [] });

    renderAiUsageTab();
    await screen.findByText('No AI usage recorded in this window.');

    apiFetch.mockResolvedValueOnce({ days: 30, users: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/admin/ai-usage?days=30'));
  });
});
