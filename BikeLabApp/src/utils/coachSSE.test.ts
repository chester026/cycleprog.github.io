// Unit tests for the AI Coach SSE client — T-4.4's new `/api/coach/chat`
// contract (`{message, conversation_id, hidden_context?, health_context?}`,
// no more `messages`/history array) plus the 401 -> refresh -> retry-once
// path added alongside it.
//
// `react-native-sse` is replaced by the manual mock at
// BikeLabApp/__mocks__/react-native-sse.js (auto-applied by Jest for any
// node_modules package with a matching root __mocks__ file) — it lets a
// test inspect exactly what `new EventSource(url, options)` was called with
// and manually fire `open`/`message`/`error` events.
import EventSource from 'react-native-sse';
import {streamChat, StreamCallbacks, buildStreamErrorMessage} from './coachSSE';
import {TokenStorage, refreshSession} from './api';

jest.mock('./api', () => ({
  API_BASE_URL: 'https://api.test.example',
  TokenStorage: {getToken: jest.fn()},
  refreshSession: jest.fn(),
}));

// coachSSE.ts imports the real i18n singleton (src/i18n/i18n.ts), which
// pulls in react-native-localize — a native module Jest can't resolve (see
// ProfileScreen.test.tsx for this repo's existing convention of mocking
// this same module instead of the real one). The mock's `t` echoes back
// the key and interpolation params rather than a real translated string,
// so these tests assert on WHAT was asked to be translated, not English
// copy — the actual copy lives in en.json/ru.json and is exercised there.
jest.mock('../i18n/i18n', () => ({
  t: (key: string, opts?: Record<string, unknown>) => `${key}${opts ? `:${JSON.stringify(opts)}` : ''}`,
}));

const MockEventSource = EventSource as unknown as {
  instances: Array<{
    url: string;
    options: {method?: string; headers?: Record<string, string>; body?: string};
    emit: (type: string, payload: any) => void;
    closed: boolean;
  }>;
  __reset: () => void;
};

function makeCallbacks(): StreamCallbacks {
  return {
    onToken: jest.fn(),
    onToolCall: jest.fn(),
    onToolResult: jest.fn(),
    onSuggestions: jest.fn(),
    onDone: jest.fn(),
    onError: jest.fn(),
    onRedirect: jest.fn(),
  };
}

// Lets `open()`'s fire-and-forget `async (event) => {...}` error listener
// finish (it `await`s `refreshSession()`) before assertions run.
async function flushMicrotasks() {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

describe('coachSSE.streamChat', () => {
  beforeEach(() => {
    MockEventSource.__reset();
    (TokenStorage.getToken as jest.Mock).mockReset().mockResolvedValue('tok-123');
    (refreshSession as jest.Mock).mockReset();
  });

  it('sends the new {message, conversation_id, hidden_context} body — no legacy messages array', async () => {
    await streamChat('Analyze my last ride', 'conv-1', makeCallbacks(), {
      hiddenContext: 'activity_id: 42',
    });

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe('https://api.test.example/api/coach/chat');
    expect(es.options.method).toBe('POST');

    const body = JSON.parse(es.options.body as string);
    expect(body).toEqual({
      message: 'Analyze my last ride',
      conversation_id: 'conv-1',
      hidden_context: 'activity_id: 42',
    });
    expect(body.messages).toBeUndefined();
    expect(body.history).toBeUndefined();
  });

  it('includes health_context only when provided, and carries the bearer token', async () => {
    await streamChat('How am I doing?', null, makeCallbacks(), {
      healthContext: {restingHeartRate: 52},
    });

    const es = MockEventSource.instances[0];
    const body = JSON.parse(es.options.body as string);
    expect(body).toEqual({
      message: 'How am I doing?',
      conversation_id: null,
      health_context: {restingHeartRate: 52},
    });
    expect(es.options.headers?.Authorization).toBe('Bearer tok-123');
  });

  it('on a 401 mid-stream, refreshes the session once and retries with the new token', async () => {
    (TokenStorage.getToken as jest.Mock).mockResolvedValue('expired-token');
    (refreshSession as jest.Mock).mockResolvedValue('fresh-token');
    const callbacks = makeCallbacks();

    await streamChat('Hi', 'conv-1', callbacks);
    expect(MockEventSource.instances).toHaveLength(1);
    const first = MockEventSource.instances[0];
    expect(first.options.headers?.Authorization).toBe('Bearer expired-token');

    first.emit('error', {type: 'error', message: '', xhrStatus: 401, xhrState: 4});
    await flushMicrotasks();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(first.closed).toBe(true);
    // Retried exactly once — a second EventSource opened with the rotated token.
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].options.headers?.Authorization).toBe('Bearer fresh-token');
    expect(callbacks.onError).not.toHaveBeenCalled();

    // The retried connection completing normally still reaches the caller.
    MockEventSource.instances[1].emit('message', {
      data: JSON.stringify({type: 'done', conversation_id: 'conv-1', message_id: 'm-1'}),
    });
    expect(callbacks.onDone).toHaveBeenCalledWith('conv-1', 'm-1');
  });

  it('falls back to onError when the refresh itself fails, without a second retry', async () => {
    (refreshSession as jest.Mock).mockResolvedValue(null);
    const callbacks = makeCallbacks();

    await streamChat('Hi', null, callbacks);
    MockEventSource.instances[0].emit('error', {type: 'error', message: 'unauthorized', xhrStatus: 401});
    await flushMicrotasks();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(1); // never reopened
    expect(callbacks.onError).toHaveBeenCalledWith('unauthorized');
  });

  it('a non-401 error goes straight to onError without attempting a refresh', async () => {
    const callbacks = makeCallbacks();

    await streamChat('Hi', null, callbacks);
    MockEventSource.instances[0].emit('error', {
      type: 'error',
      message: 'Connection error — check your internet connection.',
      xhrStatus: 0,
    });
    await flushMicrotasks();

    expect(refreshSession).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('Connection error — check your internet connection.');
  });

  it('cancelling before any event closes the connection and mutes further callbacks', async () => {
    const callbacks = makeCallbacks();
    const cancel = await streamChat('Hi', null, callbacks);
    cancel();

    expect(MockEventSource.instances[0].closed).toBe(true);
    MockEventSource.instances[0].emit('message', {
      data: JSON.stringify({type: 'token', content: 'should be ignored'}),
    });
    expect(callbacks.onToken).not.toHaveBeenCalled();
  });

  // A 429 from aiBudget.js's requireAiBudget (or any other JSON error
  // envelope from lib/apiError.js) never reaches onError as raw JSON — see
  // buildStreamErrorMessage's own unit tests below for the parsing rules;
  // this just confirms the streaming error path actually calls it.
  it('turns an AI_BUDGET_EXCEEDED JSON body into a friendly, translated onError message instead of raw JSON', async () => {
    const callbacks = makeCallbacks();
    await streamChat('Hi', null, callbacks);
    MockEventSource.instances[0].emit('error', {
      type: 'error',
      message: JSON.stringify({error: 'Daily AI budget exceeded', code: 'AI_BUDGET_EXCEEDED', resetAt: '2026-09-25T00:00:00.000Z'}),
      xhrStatus: 429,
    });
    await flushMicrotasks();

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const message = (callbacks.onError as jest.Mock).mock.calls[0][0];
    expect(message).not.toContain('AI_BUDGET_EXCEEDED'); // never the raw error code
    expect(message).not.toContain('Daily AI budget exceeded'); // never the raw envelope's `error` text either
    expect(message).toContain('coach.budgetExceeded'); // the i18n key was actually used
  });

  it('uses the `error` field of any other JSON error body, never the raw envelope', async () => {
    const callbacks = makeCallbacks();
    await streamChat('Hi', null, callbacks);
    MockEventSource.instances[0].emit('error', {
      type: 'error',
      message: JSON.stringify({error: 'Something else broke', code: 'SOME_OTHER_ERROR'}),
      xhrStatus: 500,
    });
    await flushMicrotasks();

    expect(callbacks.onError).toHaveBeenCalledWith('Something else broke');
  });
});

describe('buildStreamErrorMessage', () => {
  it('builds a friendly translated message from an AI_BUDGET_EXCEEDED body, formatting resetAt as local HH:MM', () => {
    const resetAt = '2026-09-25T00:00:00.000Z';
    const expectedTime = (() => {
      const d = new Date(resetAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    })();
    const message = buildStreamErrorMessage(JSON.stringify({error: 'Daily AI budget exceeded', code: 'AI_BUDGET_EXCEEDED', resetAt}));
    expect(message).toBe(`coach.budgetExceeded:${JSON.stringify({time: expectedTime})}`);
  });

  it("uses another JSON error body's `error` field verbatim", () => {
    expect(buildStreamErrorMessage(JSON.stringify({error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND'}))).toBe('Conversation not found');
  });

  it('falls back to the generic message for a JSON body with neither a recognized code nor an `error` field', () => {
    expect(buildStreamErrorMessage(JSON.stringify({foo: 'bar'}))).toBe('Connection error — check your internet connection.');
  });

  it('passes a non-JSON body through as-is (plain-text errors, unchanged from before)', () => {
    expect(buildStreamErrorMessage('unauthorized')).toBe('unauthorized');
  });

  it('falls back to the generic message for an empty/missing body', () => {
    expect(buildStreamErrorMessage(undefined)).toBe('Connection error — check your internet connection.');
    expect(buildStreamErrorMessage('')).toBe('Connection error — check your internet connection.');
  });
});
