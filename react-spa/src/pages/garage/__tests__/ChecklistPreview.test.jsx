import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import ChecklistPreview from '../ChecklistPreview';
import { apiFetch } from '../../../utils/api';
import { queryClient, resetTestQueryClient } from '../../../data/hooks/__tests__/testUtils';

vi.mock('../../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

function renderPreview() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChecklistPreview />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ChecklistPreview', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows the empty-state card linking to /checklist when there are no items', async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderPreview();

    const link = await screen.findByRole('link', { name: /Plan your upgrades and purchases/i });
    expect(link).toHaveAttribute('href', '/checklist');
  });

  it('groups rows into one card per section with a done/total count and up to 3 items', async () => {
    apiFetch.mockResolvedValueOnce([
      { id: 1, section: 'Gear', item: 'Helmet', checked: true },
      { id: 2, section: 'Gear', item: 'Gloves', checked: false },
      { id: 3, section: 'Gear', item: 'Jersey', checked: false },
      { id: 4, section: 'Gear', item: 'Shorts', checked: false },
      { id: 5, section: 'Bike', item: 'Chain lube', checked: false },
    ]);

    renderPreview();

    expect(await screen.findByText('Gear')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByText('Helmet')).toBeInTheDocument();
    expect(screen.getByText('Gloves')).toBeInTheDocument();
    expect(screen.getByText('Jersey')).toBeInTheDocument();
    // 4th item ("Shorts") is beyond the 3-item preview cap.
    expect(screen.queryByText('Shorts')).not.toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();

    expect(screen.getByText('Bike')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();

    // Every card, including "New item", navigates to /checklist — no
    // inline editing on the Garage page.
    const links = screen.getAllByRole('link');
    expect(links.every((l) => l.getAttribute('href') === '/checklist')).toBe(true);
    expect(screen.getByText('New item')).toBeInTheDocument();
  });
});
