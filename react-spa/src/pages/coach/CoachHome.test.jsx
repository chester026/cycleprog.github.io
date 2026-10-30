import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import CoachHome from './CoachHome';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const authState = { user: { name: 'Dmitrii Krikunov' }, isAuthenticated: true, isLoading: false };
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => authState }));

vi.mock('../../components/BlobOrb', () => ({ default: () => null }));
vi.mock('../../components/PartnersLogo', () => ({ default: () => null }));
vi.mock('../../components/Footer', () => ({ default: () => null }));

function renderHome(props = {}) {
  const handlers = {
    onHomeSubmit: vi.fn(),
    onQuickStart: vi.fn(),
    onOpenConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onRenameConversation: vi.fn(),
    onNewChat: vi.fn(),
  };
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CoachHome {...handlers} {...props} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return handlers;
}

function mockApi({ conversations = [], metaGoals = [] } = {}) {
  call.mockImplementation((def) => {
    switch (def.path) {
      case '/api/coach/conversations':
        return Promise.resolve(conversations);
      case '/api/meta-goals':
        return Promise.resolve(metaGoals);
      case '/api/activities':
        return Promise.resolve([]);
      default:
        return Promise.resolve([]);
    }
  });
}

describe('CoachHome', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
    authState.user = { name: 'Dmitrii Krikunov' };
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('greets by first name, submits the prompt and fires quick-start chips', async () => {
    mockApi();
    const { onHomeSubmit, onQuickStart } = renderHome();
    expect(await screen.findByText(/Hey/)).toHaveTextContent('Dmitrii');
    expect(screen.queryByText(/Krikunov/)).not.toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Ask your AI coach...' });
    fireEvent.change(input, { target: { value: '  How do I climb better?  ' } });
    fireEvent.submit(input.closest('form'));
    expect(onHomeSubmit).toHaveBeenCalledWith('How do I climb better?');
    expect(input).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Total stats' }));
    expect(onQuickStart).toHaveBeenCalledWith(expect.objectContaining({ label: 'Total stats', prompt: expect.stringMatching(/total stats/i) }));
  });

  it('falls back to "rider" without a profile name', async () => {
    mockApi();
    authState.user = null;
    renderHome();
    expect(await screen.findByText(/Hey/)).toHaveTextContent('rider');
  });

  it('lists recent chats and opens one; the Goals section loads meta-goals on demand', async () => {
    mockApi({
      conversations: [{ id: 'c1', title: 'Climbing plan', updated_at: new Date().toISOString(), message_count: 4 }],
      metaGoals: [{ id: 9, title: 'Gran Fondo', status: 'active', sub_goals: [{ id: 1, percent: 50 }] }],
    });
    const { onOpenConversation, onNewChat } = renderHome();

    const chat = await screen.findByText('Climbing plan');
    fireEvent.click(chat);
    expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    fireEvent.click(screen.getByRole('button', { name: /New chat/ }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Gran Fondo')).not.toBeInTheDocument();

    const sections = screen.getByRole('tablist', { name: 'Coach section' });
    fireEvent.click(within(sections).getByRole('tab', { name: 'Goals' }));
    expect(await screen.findByRole('heading', { name: 'Gran Fondo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personalized Goals' })).toBeInTheDocument();
    expect(screen.queryByText('Climbing plan')).not.toBeInTheDocument();
  });
});
