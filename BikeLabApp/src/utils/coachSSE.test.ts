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
import {streamChat, StreamCallbacks} from './coachSSE';
import {TokenStorage, refreshSession} from './api';

jest.mock('./api', () => ({
  API_BASE_URL: 'https://api.test.example',
  TokenStorage: {getToken: jest.fn()},
  refreshSession: jest.fn(),
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
});
