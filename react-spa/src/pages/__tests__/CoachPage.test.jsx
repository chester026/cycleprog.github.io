import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import CoachPage from '../CoachPage';
import { ToastProvider } from '../../ui';
import { stream, call } from '../../utils/api';
import { queryClient } from '../../data/queryClient';

vi.mock('../../utils/api', async () => {
  const actual = await vi.importActual('../../utils/api');
  return { ...actual, stream: vi.fn(), call: vi.fn() };
});

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Dmitrii Krikunov' }, isAuthenticated: true, isLoading: false }),
}));

// The hero's WebGL orb and the partner-logo lookups are not what this test is about.
vi.mock('../../components/BlobOrb', () => ({ default: () => null }));
vi.mock('../../components/PartnersLogo', () => ({ default: () => null }));
vi.mock('../../components/Footer', () => ({ default: () => null }));

function fakeSse() {
  const encoder = new TextEncoder();
  let controller;
  const body = new ReadableStream({
    start(c) {
      controller = c;
    },
  });
  return {
    response: { ok: true, body },
    push: (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    close: () => controller.close(),
  };
}

let lastLocation;
function LocationSpy() {
  lastLocation = useLocation();
  return null;
}

function renderAt(url) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <LocationSpy />
          <Routes>
            <Route path="/coach" element={<CoachPage />}>
              <Route index element={null} />
              <Route path="c/:conversationId" element={null} />
            </Route>
            <Route path="/goals/:id" element={null} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// `call` is shared by every contract endpoint; route by path so the test
// reads like the network it stands in for.
function mockApi({ conversations = [], byActivity = null, activities = [], detail } = {}) {
  call.mockImplementation((def, input) => {
    switch (def.path) {
      case '/api/coach/conversations':
        return Promise.resolve(conversations);
      case '/api/coach/conversations/by-activity/:activityId':
        return Promise.resolve(byActivity);
      case '/api/activities':
        return Promise.resolve(activities);
      case '/api/coach/conversations/:id':
        return Promise.resolve(
          detail ?? {
            conversation: { id: input.params.id, title: 'Stored', created_at: 'x', updated_at: 'x' },
            messages: [
              { id: 'm1', role: 'user', content: 'Earlier question', created_at: '2026-10-10T08:00:00Z' },
              { id: 'm2', role: 'assistant', content: 'Earlier answer', created_at: '2026-10-10T08:00:01Z' },
            ],
          },
        );
      case '/api/meta-goals':
        return Promise.resolve([]);
      default:
        return Promise.reject(new Error(`unmocked ${def.path}`));
    }
  });
}

describe('CoachPage', () => {
  beforeEach(() => {
    queryClient.clear();
    stream.mockReset();
    call.mockReset();
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders the home with the greeting, quick starts and recent chats', async () => {
    mockApi({
      conversations: [{ id: 'c1', title: 'Sunday climb', updated_at: new Date().toISOString(), message_count: 3 }],
    });
    renderAt('/coach');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hey Dmitrii what should we work on today?');
    expect(screen.getByRole('button', { name: 'Analyze last ride' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Sunday climb')).toBeInTheDocument());
  });

  it('starts a new chat from the home prompt, streams the reply and lands on the chat URL', async () => {
    mockApi();
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    renderAt('/coach');

    fireEvent.change(screen.getByTestId('coach-home-input'), { target: { value: 'Plan my week' } });
    fireEvent.click(screen.getByTestId('coach-home-send'));

    await waitFor(() => expect(screen.getByTestId('coach-chat')).toBeInTheDocument());
    expect(screen.getByTestId('chat-bubble-user')).toHaveTextContent('Plan my week');
    expect(stream).toHaveBeenCalledWith(
      '/api/coach/chat',
      { message: 'Plan my week', conversation_id: null, client: 'web' },
      expect.anything(),
    );
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeInTheDocument();

    await act(async () => {
      sse.push({ type: 'conversation', conversation_id: 'new-1' });
      sse.push({ type: 'token', content: 'Monday: rest.' });
      sse.push({ type: 'done', conversation_id: 'new-1', message_id: 'm' });
      sse.close();
    });
    await waitFor(() => expect(screen.getByTestId('chat-bubble-assistant')).toHaveTextContent('Monday: rest.'));
    await waitFor(() => expect(lastLocation.pathname).toBe('/coach/c/new-1'));
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  });

  it('renders a GoalCreated card from a streamed create_goal result and the card opens /goals/:id', async () => {
    mockApi();
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    renderAt('/coach');
    fireEvent.change(screen.getByTestId('coach-home-input'), { target: { value: 'Set a goal' } });
    fireEvent.click(screen.getByTestId('coach-home-send'));
    await waitFor(() => expect(screen.getByTestId('coach-chat')).toBeInTheDocument());

    await act(async () => {
      sse.push({ type: 'conversation', conversation_id: 'new-2' });
      sse.push({ type: 'tool_call', name: 'create_goal', args: {} });
      sse.push({ type: 'tool_result', name: 'create_goal', result: { created: true, metaGoal: { id: 12, title: 'Ride 1000 km', tier: 'grand' } } });
      sse.push({ type: 'token', content: 'Done — your goal is set.' });
      sse.push({ type: 'done', conversation_id: 'new-2', message_id: 'm' });
      sse.close();
    });

    const card = await screen.findByTestId('goal-created-card');
    expect(card).toHaveTextContent('Goal created');
    expect(card).toHaveTextContent('Ride 1000 km');
    // The card follows the text, as in the app.
    expect(screen.getByTestId('chat-bubble-assistant').compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(card);
    await waitFor(() => expect(lastLocation.pathname).toBe('/goals/12'));
  });

  it('?prompt= sends once and strips the search params', async () => {
    mockApi();
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    renderAt('/coach?prompt=Check%20my%20bike');

    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0][1]).toEqual({ message: 'Check my bike', conversation_id: null, client: 'web' });
    await waitFor(() => expect(lastLocation.search).toBe(''));
    expect(screen.getByTestId('chat-bubble-user')).toHaveTextContent('Check my bike');
  });

  it('?prompt=&activity= opens the existing conversation about that ride', async () => {
    mockApi({ byActivity: { id: 'older', created_at: 'x', updated_at: 'x' } });
    renderAt('/coach?prompt=Discuss&activity=42');

    await waitFor(() => expect(lastLocation.pathname).toBe('/coach/c/older'));
    expect(stream).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Earlier answer')).toBeInTheDocument());
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/coach/conversations/by-activity/:activityId' }),
      { params: { activityId: 42 } },
    );
  });

  it('?prompt=&activity= with no prior chat sends the prompt with the ride as hidden context', async () => {
    mockApi({ byActivity: null });
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    renderAt('/coach?prompt=Discuss&activity=42');

    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0][1]).toMatchObject({ message: 'Discuss', hidden_context: 'activity_id: 42' });
  });

  it('?event= becomes calendar_event_id hidden context', async () => {
    mockApi();
    stream.mockResolvedValue(fakeSse().response);
    renderAt('/coach?prompt=Move%20it&event=9');
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0][1]).toMatchObject({ hidden_context: 'calendar_event_id: 9' });
  });

  it('?open= redirects to the conversation URL and loads it', async () => {
    mockApi();
    renderAt('/coach?open=abc');
    await waitFor(() => expect(lastLocation.pathname).toBe('/coach/c/abc'));
    await waitFor(() => expect(screen.getByText('Earlier question')).toBeInTheDocument());
  });

  it('/coach/c/:id restores the transcript and Back returns home', async () => {
    mockApi();
    renderAt('/coach/c/abc');
    await waitFor(() => expect(screen.getByText('Earlier answer')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI Coach');
    expect(screen.getByRole('button', { name: 'Delete chat' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    await waitFor(() => expect(lastLocation.pathname).toBe('/coach'));
    expect(screen.getByTestId('coach-home')).toBeInTheDocument();
  });
});
