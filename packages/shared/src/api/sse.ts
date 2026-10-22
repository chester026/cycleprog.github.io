/**
 * Reads a `text/event-stream` fetch Response as parsed JSON `data:` frames.
 * Used by the web coach chat on top of `ApiClient.stream` (browser
 * `EventSource` can't send a Bearer header or a POST body). Handles frames
 * split across chunks, several frames per chunk, CRLF line endings and
 * comment lines (`: ping` heartbeats). Any non-JSON `data:` payload is
 * skipped rather than thrown — a malformed frame shouldn't kill the turn.
 */

// Structural types instead of the DOM lib's `Response`/`TextDecoder`: the
// app compiles this package's sources with React Native's lib set (no DOM),
// and only the few members used here matter.
interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}
export interface SseResponse {
  body: { getReader(): ByteReader } | null;
}
interface Utf8Decoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}
declare const TextDecoder: new () => Utf8Decoder;

/**
 * Yields one parsed JSON object per SSE frame. Aborting `signal` cancels the
 * body reader and ends the iteration; the frame currently being read is
 * never yielded.
 */
export async function* readSseJson(response: SseResponse, signal?: AbortSignal): AsyncGenerator<unknown, void, undefined> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);
  }

  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done || signal?.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      // A frame ends at a blank line; everything after the last one is a
      // partial frame still being received.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const payload = parseFrame(frame);
        if (payload !== undefined) yield payload;
      }
    }
    // A final frame without a trailing blank line (server ended the response
    // right after it) is still a complete frame.
    if (!signal?.aborted && buffer.trim()) {
      const payload = parseFrame(buffer);
      if (payload !== undefined) yield payload;
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // Also reached when the consumer breaks out of its `for await` early —
    // cancelling closes the connection so the server sees the client leave.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// Joins a frame's `data:` lines per the SSE spec (several `data:` lines form
// one newline-joined payload) and ignores comments and other fields.
function parseFrame(frame: string): unknown {
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  if (dataLines.length === 0) return undefined;
  try {
    return JSON.parse(dataLines.join('\n'));
  } catch {
    return undefined;
  }
}
