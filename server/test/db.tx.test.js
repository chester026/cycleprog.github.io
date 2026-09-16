// Required before ../db creates its real Pool — see auth.middleware.test.js's
// header comment for why this pattern works (require cache => same `pool`
// object everywhere), applied here to withTransaction instead of authMiddleware.
process.env.PGHOST = process.env.PGHOST || 'localhost';

const { pool, withTransaction } = require('../db');

function fakeClient() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
}

describe('withTransaction', () => {
  let client;

  beforeEach(() => {
    client = fakeClient();
    pool.connect = vi.fn().mockResolvedValue(client);
  });

  it('BEGINs, runs fn, COMMITs, and releases the client on success', async () => {
    const result = await withTransaction(async (c) => {
      await c.query('SELECT 1');
      return 'ok';
    });

    expect(result).toBe('ok');
    const calls = client.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('SELECT 1');
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('passes the connected client through to fn (not the shared pool)', async () => {
    await withTransaction(async (c) => {
      expect(c).toBe(client);
    });
  });

  it('ROLLBACKs and rethrows when fn throws, and still releases the client', async () => {
    const boom = new Error('boom');

    await expect(
      withTransaction(async (c) => {
        await c.query('SELECT 1');
        throw boom;
      })
    ).rejects.toThrow(boom);

    const calls = client.query.mock.calls.map((c) => c[0]);
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('releases the client even when ROLLBACK itself is what we are recovering from', async () => {
    const boom = new Error('boom');
    client.query = vi.fn(async (sql) => {
      if (sql === 'SELECT 1') throw boom;
      return { rows: [], rowCount: 0 };
    });

    await expect(withTransaction((c) => c.query('SELECT 1'))).rejects.toThrow(boom);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
