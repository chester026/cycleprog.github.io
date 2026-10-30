import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import HeroImagesTab from './HeroImagesTab';
import { call } from '../../data/api';
import { ToastProvider } from '../../ui';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function renderTab() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HeroImagesTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// Legacy filename entries and ImageKit objects both occur; `trainings` and
// `plan` share one file so the delete prompt has to mention the other.
const IMAGES = {
  garage: 'garage.webp',
  plan: { url: 'https://ik.example/plan.webp?tr=orig', name: 'plan.webp', file_id: 'f1' },
  trainings: { url: 'https://ik.example/plan.webp?tr=orig', name: 'plan.webp', file_id: 'f1' },
  checklist: null,
};

function mockApi({ images = IMAGES, pending = false } = {}) {
  call.mockImplementation((def) => {
    if (def.path === '/api/hero/images') {
      if (pending) return new Promise(() => {});
      return Promise.resolve(images);
    }
    if (def.path === '/api/hero/positions/:position') return Promise.resolve({ message: 'Deleted' });
    if (def.path === '/api/hero/upload') return Promise.resolve({ success: true });
    if (def.path === '/api/hero/assign-all') return Promise.resolve({ deletedFiles: 3 });
    return Promise.reject(new Error(`unexpected ${def.path}`));
  });
}

describe('HeroImagesTab', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows a loader, then one tile per position with empty slots and a shared-file marker', async () => {
    mockApi();
    renderTab();
    expect(screen.getByRole('status', { name: 'Loading hero images...' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Hero Background Images' })).toBeInTheDocument();
    expect(screen.getByText('garage')).toBeInTheDocument();
    expect(screen.getByText('checklist')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    // Both ImageKit positions point at the same file_id.
    expect(screen.getAllByTitle(/Also used in:/)).toHaveLength(2);
    const imgs = screen.getAllByAltText('hero-img');
    expect(imgs.map((img) => img.getAttribute('src'))).toEqual([
      '/img/hero/garage.webp',
      'https://ik.example/plan.webp?tr=q-100,f-webp',
      'https://ik.example/plan.webp?tr=q-100,f-webp',
    ]);
  });

  it('says "No images" for an empty catalogue', async () => {
    mockApi({ images: {} });
    renderTab();
    expect(await screen.findByText('No images')).toBeInTheDocument();
  });

  it('deletes one position after confirming, warning when the file lives elsewhere too', async () => {
    mockApi();
    renderTab();
    await screen.findByText('garage');

    fireEvent.click(screen.getByTitle('Delete from plan (file remains in others)'));
    const dialog = screen.getByRole('dialog', { name: 'Delete hero image' });
    expect(dialog).toHaveTextContent('Delete image from "plan"? File will remain in: trainings');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/hero/positions/:position' }),
        { params: { position: 'plan' } },
      ),
    );
    expect(await screen.findByText('Deleted')).toBeInTheDocument();
  });

  it('clears every filled position in one go', async () => {
    mockApi();
    renderTab();
    await screen.findByText('garage');

    fireEvent.click(screen.getByRole('button', { name: 'Clear all hero images' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete all hero images' })).getByRole('button', { name: 'Delete all' }));

    expect(await screen.findByText('All hero images deleted (3/3 positions)')).toBeInTheDocument();
    const deleted = call.mock.calls.filter(([def]) => def.method === 'DELETE').map(([, input]) => input.params.position);
    expect(deleted.sort()).toEqual(['garage', 'plan', 'trainings']);
  });

  it('refuses to upload without a file, then uploads to the chosen position', async () => {
    mockApi();
    renderTab();
    await screen.findByText('garage');

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Select a file')).toBeInTheDocument();
    expect(call.mock.calls.some(([def]) => def.path === '/api/hero/upload')).toBe(false);

    const file = new File(['img'], 'hero.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Choose hero image'), { target: { files: [file] } });
    expect(await screen.findByText('Preview:')).toBeInTheDocument();
    expect(screen.getByText('File:').parentElement).toHaveTextContent('File: hero.webp');
    fireEvent.change(screen.getByLabelText('Hero block position'), { target: { value: 'checklist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(call.mock.calls.some(([def]) => def.path === '/api/hero/upload')).toBe(true));
    const [, input] = call.mock.calls.find(([def]) => def.path === '/api/hero/upload');
    expect(input.body).toBeInstanceOf(FormData);
    expect(input.body.get('pos')).toBe('checklist');
    expect(input.body.get('image')).toBe(file);
    expect(await screen.findByText('Hero image uploaded successfully!')).toBeInTheDocument();
  });

  it('switches to assign-all when the checkbox is ticked', async () => {
    mockApi();
    renderTab();
    await screen.findByText('garage');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Upload to all hero blocks' }));
    expect(screen.queryByLabelText('Hero block position')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose hero image'), {
      target: { files: [new File(['img'], 'all.webp', { type: 'image/webp' })] },
    });
    expect(await screen.findByText('Preview:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload to all' }));

    expect(await screen.findByText(/assigned to all hero blocks! Deleted old files: 3/)).toBeInTheDocument();
    expect(call.mock.calls.some(([def]) => def.path === '/api/hero/assign-all')).toBe(true);
  });
});
