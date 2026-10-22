import { describe, expect, it } from 'vitest';
import { readSseJson } from './sse.js';

const encoder = new TextEncoder();

// A Response whose body emits `chunks` one read() at a time, so a test can
// control exactly where the byte stream is cut.
function sseResponse(chunks: string[]): Response {
  const queue = [...chunks];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(next));
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

async function collect(response: Response, signal?: AbortSignal): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of readSseJson(response, signal)) events.push(event);
  return events;
}

describe('readSseJson', () => {
  it('yields one parsed object per frame when several frames arrive in one chunk', async () => {
    const events = await collect(
      sseResponse(['data: {"type":"token","content":"a"}\n\ndata: {"type":"token","content":"b"}\n\n']),
    );
    expect(events).toEqual([
      { type: 'token', content: 'a' },
      { type: 'token', content: 'b' },
    ]);
  });

  it('reassembles a frame split across chunks, including a cut inside a multi-byte character', async () => {
    const frame = 'data: {"type":"token","content":"Привет"}\n\n';
    const bytes = encoder.encode(frame);
    // Cut in the middle of the Cyrillic word: between the two bytes of one character.
    const cut = frame.indexOf('Привет') + 3;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const events = await collect(new Response(body));
    expect(events).toEqual([{ type: 'token', content: 'Привет' }]);
  });

  it('reassembles a frame whose blank-line terminator arrives in the next chunk', async () => {
    const events = await collect(sseResponse(['data: {"type":"tok', 'en","content":"x"}', '\n', '\ndata: {"type":"done","conversation_id":"c","message_id":"m"}\n\n']));
    expect(events).toEqual([
      { type: 'token', content: 'x' },
      { type: 'done', conversation_id: 'c', message_id: 'm' },
    ]);
  });

  it('ignores comment lines (heartbeats) and non-data fields', async () => {
    const events = await collect(sseResponse([': ping\n\n', ': ping\n', 'event: message\nid: 7\ndata: {"type":"token","content":"y"}\n\n', ': ping\n\n']));
    expect(events).toEqual([{ type: 'token', content: 'y' }]);
  });

  it('accepts CRLF line endings and joins multi-line data per the SSE spec', async () => {
    const events = await collect(sseResponse(['data: {"a":\r\ndata: 1}\r\n\r\ndata: {"b":2}\r\n\r\n']));
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('yields a trailing frame that the server ended without a blank line', async () => {
    const events = await collect(sseResponse(['data: {"type":"error","message":"boom"}\n']));
    expect(events).toEqual([{ type: 'error', message: 'boom' }]);
  });

  it('skips a data line that is not valid JSON instead of throwing', async () => {
    const events = await collect(sseResponse(['data: not json\n\ndata: {"ok":true}\n\n']));
    expect(events).toEqual([{ ok: true }]);
  });

  it('stops yielding once the signal aborts and cancels the body', async () => {
    const controller = new AbortController();
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(streamController) {
        pulls++;
        if (pulls === 1) {
          streamController.enqueue(encoder.encode('data: {"n":1}\n\n'));
          return;
        }
        // Hang: this would only resolve on a real server, so the abort has to unblock the reader.
        return new Promise(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    });

    const events: unknown[] = [];
    const iteration = (async () => {
      for await (const event of readSseJson(new Response(body), controller.signal)) {
        events.push(event);
        controller.abort();
      }
    })();
    await iteration;
    expect(events).toEqual([{ n: 1 }]);
    expect(cancelled).toBe(true);
  });

  it('yields nothing when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(sseResponse(['data: {"n":1}\n\n']), controller.signal);
    expect(events).toEqual([]);
  });

  it('yields nothing for a response without a body', async () => {
    expect(await collect(new Response(null, { status: 204 }))).toEqual([]);
  });

  it('cancels the body when the consumer stops iterating early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(encoder.encode('data: {"n":1}\n\ndata: {"n":2}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const event of readSseJson(new Response(body))) {
      expect(event).toEqual({ n: 1 });
      break;
    }
    expect(cancelled).toBe(true);
  });
});
