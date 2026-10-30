import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelab/shared/api';
import { useCoachChat, describeStreamError } from './useCoachChat';
import { stream, call } from '../utils/api';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/keys';

vi.mock('../utils/api', async () => {
  const actual = await vi.importActual('../utils/api');
  return { ...actual, stream: vi.fn(), call: vi.fn() };
});

// A controllable text/event-stream body: `push` writes one frame, `close`
// ends the response, and the hook reads it through the real readSseJson.
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
    pushRaw: (text) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

let lastLocation = null;
function LocationSpy() {
  lastLocation = useLocation();
  return null;
}

function wrapper({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/coach']}>
        <LocationSpy />
        <Routes>
          <Route path="*" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const flushTicks = () => act(() => new Promise((resolve) => setTimeout(resolve, 80)));

describe('useCoachChat', () => {
  beforeEach(() => {
    queryClient.clear();
    stream.mockReset();
    call.mockReset();
    lastLocation = null;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('adds the optimistic user message, buffers tokens and settles on done', async () => {
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    act(() => {
      result.current.sendMessage('How was my ride?');
    });

    await waitFor(() => expect(result.current.streaming).toBe(true));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'How was my ride?' });
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', content: '', streaming: true });
    expect(stream).toHaveBeenCalledWith(
      '/api/coach/chat',
      { message: 'How was my ride?', conversation_id: null, client: 'web' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(async () => {
      sse.push({ type: 'conversation', conversation_id: 'conv-1' });
      sse.push({ type: 'token', content: 'Strong ' });
      sse.push({ type: 'token', content: 'ride.' });
    });
    await waitFor(() => expect(result.current.conversationId).toBe('conv-1'));
    await flushTicks();
    expect(result.current.messages[1].content).toBe('Strong ride.');

    await act(async () => {
      sse.push({ type: 'suggestions', items: [{ label: 'Compare to average', detail: 'vs_baseline' }] });
      sse.push({ type: 'done', conversation_id: 'conv-1', message_id: 'm-9' });
      sse.close();
    });

    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages[1]).toMatchObject({ content: 'Strong ride.', streaming: false });
    expect(result.current.suggestions).toEqual([{ label: 'Compare to average', detail: 'vs_baseline' }]);
    expect(result.current.error).toBeNull();
    // A brand-new chat lands on its own URL once the server has an id for it.
    await waitFor(() => expect(lastLocation?.pathname).toBe('/coach/c/conv-1'));
  });

  it('pairs tool results with the most recent running call of that name and invalidates caches', async () => {
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    act(() => {
      result.current.sendMessage('Plan my goal');
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));

    await act(async () => {
      sse.push({ type: 'tool_call', name: 'get_user_profile', args: {} });
      sse.push({ type: 'tool_call', name: 'create_goal', args: { title: 'Climb' } });
    });
    await waitFor(() => expect(result.current.messages[1].toolCalls).toHaveLength(2));
    expect(result.current.messages[1].toolCalls.map((tc) => tc.status)).toEqual(['running', 'running']);

    await act(async () => {
      sse.push({ type: 'tool_result', name: 'create_goal', result: { metaGoal: { id: 5 } } });
    });
    await waitFor(() =>
      expect(result.current.messages[1].toolCalls[1]).toMatchObject({ status: 'done', result: { metaGoal: { id: 5 } } }),
    );
    expect(result.current.messages[1].toolCalls[0].status).toBe('running');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.metaGoals });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.goals });

    await act(async () => {
      sse.push({ type: 'tool_result', name: 'get_user_profile', result: {} });
      sse.push({ type: 'done', conversation_id: 'conv-2', message_id: 'm' });
      sse.close();
    });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages[1].toolCalls.every((tc) => tc.status === 'done')).toBe(true);
    invalidate.mockRestore();
  });

  it('shows the daily-limit reset time when the server answers AI_BUDGET_EXCEEDED', async () => {
    const resetAt = new Date(2026, 9, 16, 23, 0).toISOString();
    stream.mockRejectedValue(new ApiError(429, 'AI budget exceeded', 'AI_BUDGET_EXCEEDED', { resetAt }));
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBe("You've reached today's coach limit. It resets at 23:00.");
    expect(result.current.messages[1]).toMatchObject({ error: true, streaming: false });
  });

  it('opens the existing conversation on redirect and drops the optimistic messages', async () => {
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    act(() => {
      result.current.sendMessage('Analyze this ride', { hiddenContext: 'activity_id: 7' });
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));
    expect(stream.mock.calls[0][1]).toMatchObject({ hidden_context: 'activity_id: 7' });

    await act(async () => {
      sse.push({ type: 'redirect', conversation_id: 'older-conv' });
      sse.close();
    });

    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
    await waitFor(() => expect(lastLocation?.pathname).toBe('/coach/c/older-conv'));
  });

  it('cancelStream aborts the request but keeps the partial text without an error', async () => {
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    act(() => {
      result.current.sendMessage('Long answer please');
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));
    await act(async () => {
      sse.push({ type: 'token', content: 'Partial' });
    });
    await flushTicks();

    act(() => {
      result.current.cancelStream();
    });
    expect(stream.mock.calls[0][2].signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages[1]).toMatchObject({ content: 'Partial', streaming: false });
    expect(result.current.messages[1].error).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('keeps the id from the early conversation event when the turn is aborted before done', async () => {
    const sse = fakeSse();
    stream.mockResolvedValue(sse.response);
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    act(() => {
      result.current.sendMessage('hi');
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));
    await act(async () => {
      sse.push({ type: 'conversation', conversation_id: 'conv-early' });
      sse.pushRaw(': ping\n\n');
    });
    await waitFor(() => expect(result.current.conversationId).toBe('conv-early'));

    act(() => {
      result.current.cancelStream();
    });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.conversationId).toBe('conv-early');

    // The next turn continues that conversation rather than starting another.
    const next = fakeSse();
    stream.mockResolvedValue(next.response);
    act(() => {
      result.current.sendMessage('again');
    });
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(stream.mock.calls[1][1]).toMatchObject({ conversation_id: 'conv-early' });
  });

  it('openConversation restores persisted tool calls as done and the last suggestions', async () => {
    call.mockResolvedValue({
      conversation: { id: 'conv-3', title: 'Hills', created_at: 'x', updated_at: 'x' },
      messages: [
        { id: 'u1', role: 'user', content: 'Hi', tool_calls: null, suggestions: null, created_at: '2026-10-10T08:00:00Z' },
        {
          id: 'a1',
          role: 'assistant',
          content: 'Hello',
          tool_calls: [{ name: 'get_user_profile', args: {}, result: {} }],
          suggestions: [{ label: 'Plan my week' }],
          created_at: '2026-10-10T08:00:01Z',
        },
      ],
    });
    const { result } = renderHook(() => useCoachChat(), { wrapper });

    await act(async () => {
      await result.current.openConversation('conv-3');
    });

    expect(result.current.conversationId).toBe('conv-3');
    expect(result.current.messages[1].toolCalls).toEqual([{ name: 'get_user_profile', args: {}, result: {}, status: 'done' }]);
    expect(result.current.suggestions).toEqual([{ label: 'Plan my week' }]);
    expect(result.current.loadingConversation).toBe(false);
  });

  it('startNewConversation clears the transcript and the active id', async () => {
    call.mockResolvedValue({
      conversation: { id: 'conv-4', created_at: 'x', updated_at: 'x' },
      messages: [{ id: 'u1', role: 'user', content: 'Hi', created_at: '2026-10-10T08:00:00Z' }],
    });
    const { result } = renderHook(() => useCoachChat(), { wrapper });
    await act(async () => {
      await result.current.openConversation('conv-4');
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.startNewConversation();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
  });
});

describe('describeStreamError', () => {
  it('maps the known envelopes to rider-facing copy', () => {
    expect(describeStreamError(new ApiError(429, 'Too many requests', 'RATE_LIMITED'))).toMatch(/too quickly/);
    expect(describeStreamError(new ApiError(400, 'Message too long', 'VALIDATION_ERROR'))).toBe('Message too long');
    expect(describeStreamError(new ApiError(502, '<html>Bad gateway</html>', null))).toBe(
      'Connection error — check your internet connection.',
    );
    expect(describeStreamError(new TypeError('Failed to fetch'))).toBe(
      'Connection error — check your internet connection.',
    );
  });
});
