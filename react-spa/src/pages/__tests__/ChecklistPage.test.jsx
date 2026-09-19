import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import ChecklistPage from '../ChecklistPage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

// T-6.3: delete confirmations moved from window.confirm to useConfirm (a
// rendered dialog).
function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ChecklistPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function mockApi({ items = [], heroImages = {} } = {}) {
  call.mockImplementation((def) => {
    if (def.path === '/api/checklist') return Promise.resolve(items);
    if (def.path === '/api/hero/images') return Promise.resolve(heroImages);
    return Promise.resolve({});
  });
}

describe('ChecklistPage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('groups items by section and toggles a checkbox via useUpdateChecklistItem', async () => {
    mockApi({
      items: [
        { id: 1, section: 'Gear', item: 'Helmet', checked: false, link: '' },
        { id: 2, section: 'Gear', item: 'Gloves', checked: true, link: '' },
      ],
    });

    renderPage();

    expect(await screen.findByText('Helmet')).toBeInTheDocument();
    const checkbox = screen.getByLabelText((_, el) => el.tagName === 'INPUT' && el.type === 'checkbox' && el.closest('li')?.textContent.includes('Helmet'));
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/checklist/:id' }),
        { params: { id: 1 }, body: { checked: true } },
      );
    });
  });

  it('adds a new item to a section', async () => {
    mockApi({ items: [{ id: 1, section: 'Gear', item: 'Helmet', checked: false, link: '' }] });
    renderPage();

    const input = await screen.findByPlaceholderText('Add new item...');
    fireEvent.change(input, { target: { value: 'Pump' } });
    fireEvent.click(screen.getByTitle('Add'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/checklist' }),
        { body: { section: 'Gear', item: 'Pump' } },
      );
    });
  });

  it('deletes an item after confirming via the useConfirm dialog', async () => {
    mockApi({ items: [{ id: 1, section: 'Gear', item: 'Helmet', checked: false, link: '' }] });
    renderPage();

    expect(await screen.findByText('Helmet')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Delete'));

    const dialog = await screen.findByRole('dialog', { name: 'Delete item' });
    fireEvent.click(within(dialog).getByText('Delete'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/checklist/:id' }),
        { params: { id: 1 } },
      );
    });
  });
});
