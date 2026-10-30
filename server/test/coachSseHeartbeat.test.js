// startSseHeartbeat (services/coach.js): `: ping` comment frames keep the
// chat connection alive through proxies while the model is silent. Fake
// timers — no HTTP, the response is a stub with the two fields it reads.
const { startSseHeartbeat, SSE_HEARTBEAT_INTERVAL_MS } = require('../services/coach');

function fakeRes() {
  return { writes: [], writableEnded: false, destroyed: false, write(chunk) { this.writes.push(chunk); } };
}

describe('startSseHeartbeat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes a comment frame every interval until stopped, and never afterwards', () => {
    const res = fakeRes();
    const stop = startSseHeartbeat(res);
    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS * 2);
    expect(res.writes).toEqual([': ping\n\n', ': ping\n\n']);
    stop();
    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS * 3);
    expect(res.writes).toHaveLength(2);
  });

  it('stops itself once the response has ended, without writing to it', () => {
    const res = fakeRes();
    startSseHeartbeat(res, 100);
    vi.advanceTimersByTime(100);
    expect(res.writes).toHaveLength(1);
    res.writableEnded = true;
    vi.advanceTimersByTime(500);
    expect(res.writes).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
