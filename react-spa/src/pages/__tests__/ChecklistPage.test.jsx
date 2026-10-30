import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import ChecklistPage from '../ChecklistPage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/checklist']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/checklist" element={<ChecklistPage />} />
            <Route path="/coach" element={<LocationProbe />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const GEAR = [
  { id: 1, section: 'Gear', item: 'Helmet', checked: false, link: '' },
  { id: 2, section: 'Gear', item: 'Gloves', checked: true, link: 'https://www.rei.com/gloves' },
];

function mockApi({ items = [], fail = () => false } = {}) {
  call.mockImplementation((def) => {
    if (def.path === '/api/checklist' && def.method === 'GET') return Promise.resolve(items);
    if (fail(def)) return Promise.reject(new Error('boom'));
    return Promise.resolve({ success: true });
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

  it('shows the overview totals and one column per section with its items', async () => {
    mockApi({ items: [...GEAR, { id: 3, section: 'Trip', item: 'Book hotel', checked: false, link: '' }] });
    renderPage();

    const gear = await screen.findByRole('region', { name: 'Gear' });
    expect(within(gear).getByRole('checkbox', { name: 'Helmet' })).toHaveAttribute('aria-checked', 'false');
    expect(within(gear).getByRole('checkbox', { name: 'Gloves' })).toHaveAttribute('aria-checked', 'true');
    expect(within(gear).getByRole('link', { name: /rei\.com/ })).toHaveAttribute('href', 'https://www.rei.com/gloves');
    expect(screen.getByRole('region', { name: 'Trip' })).toBeInTheDocument();
    // 1 of 3 done -> 33 %
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('shows the empty state with only the "New section" affordances when there are no items', async () => {
    mockApi({ items: [] });
    renderPage();

    expect(await screen.findByText('Add your first checklist section')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New section' })).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Gear' })).not.toBeInTheDocument();
  });

  it('toggles an item via useUpdateChecklistItem', async () => {
    mockApi({ items: GEAR });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Helmet' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/checklist/:id' }),
        { params: { id: 1 }, body: { checked: true } },
      );
    });
  });

  it('adds an item to a section through the New item sheet', async () => {
    mockApi({ items: GEAR });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Add item to Gear' }));
    const sheet = screen.getByRole('dialog', { name: 'New item' });
    expect(sheet).toHaveAccessibleDescription('In Gear');
    fireEvent.change(within(sheet).getByPlaceholderText('Add new item...'), { target: { value: 'Pump' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/checklist' }),
        { body: { section: 'Gear', item: 'Pump' } },
      );
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New item' })).not.toBeInTheDocument());
  });

  it('creates a section with its first item through the Add section sheet', async () => {
    mockApi({ items: GEAR });
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'New section' }))[0]);
    const sheet = screen.getByRole('dialog', { name: 'Add section' });
    fireEvent.change(within(sheet).getByLabelText('Section name'), { target: { value: 'Trip' } });
    fireEvent.change(within(sheet).getByLabelText('First item'), { target: { value: 'Book hotel' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/checklist' }),
        { body: { section: 'Trip', item: 'Book hotel' } },
      );
    });
  });

  it('renames an item and saves its link from the detail sheet', async () => {
    mockApi({ items: GEAR });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Helmet' }));
    const sheet = screen.getByRole('dialog', { name: 'Helmet' });
    fireEvent.change(within(sheet).getByLabelText('Item name'), { target: { value: 'Aero helmet' } });
    fireEvent.change(within(sheet).getByLabelText('Link'), { target: { value: 'https://shop.example/h' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/checklist/:id' }),
        { params: { id: 1 }, body: { item: 'Aero helmet' } },
      );
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/checklist/:id' }),
        { params: { id: 1 }, body: { link: 'https://shop.example/h' } },
      );
    });
  });

  it('moves an item to another section from the detail sheet', async () => {
    mockApi({ items: [...GEAR, { id: 3, section: 'Trip', item: 'Book hotel', checked: false, link: '' }] });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Helmet' }));
    const sheet = screen.getByRole('dialog', { name: 'Helmet' });
    const chips = within(sheet).getByRole('group', { name: 'Move to section' });
    fireEvent.click(within(chips).getByRole('button', { name: 'Trip' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/checklist/:id' }),
        { params: { id: 1 }, body: { section: 'Trip' } },
      );
    });
  });

  it('deletes an item from the detail sheet after confirming', async () => {
    mockApi({ items: GEAR });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Helmet' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Helmet' })).getByRole('button', { name: 'Delete item' }));

    const confirmDialog = await screen.findByRole('dialog', { name: 'Delete item' });
    fireEvent.click(within(confirmDialog).getByText('Delete'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/checklist/:id' }),
        { params: { id: 1 } },
      );
    });
  });

  it('renames a section via useRenameChecklistSection (double-encoded param)', async () => {
    mockApi({ items: [{ id: 1, section: 'What to buy', item: 'Helmet', checked: false, link: '' }] });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit section What to buy' }));
    const sheet = screen.getByRole('dialog', { name: 'Rename section' });
    fireEvent.change(within(sheet).getByLabelText('Section name'), { target: { value: 'Gear' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/checklist/section/:section' }),
        { params: { section: encodeURIComponent('What to buy') }, body: { section: 'Gear' } },
      );
    });
  });

  it('deletes a section from its sheet after confirming, and toasts on failure', async () => {
    mockApi({ items: GEAR, fail: (def) => def.method === 'DELETE' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit section Gear' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Rename section' })).getByRole('button', { name: 'Delete section' }));

    const confirmDialog = await screen.findByRole('dialog', { name: 'Delete section "Gear"?' });
    expect(confirmDialog).toHaveTextContent('This will remove 2 items (1 completed).');
    fireEvent.click(within(confirmDialog).getByText('Delete'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/checklist/section/:section' }),
        { params: { section: 'Gear' } },
      );
    });
    expect(await screen.findByText('Failed to delete the section. Please try again.')).toBeInTheDocument();
  });

  it('sends the coach banner to /coach with the checklist prompt', async () => {
    mockApi({ items: GEAR });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Ask coach about your checklist/ }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/coach?prompt=${encodeURIComponent('Can you help me with shopping and packing advice for my checklist?')}`,
    );
  });
});
