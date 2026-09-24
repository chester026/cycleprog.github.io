// Unit tests for services/aiBudget.js's cached-token weighting (recordUsage)
// and admin exemption (requireAiBudget) — T-? coach-readiness-budget,
// Problem B. repositories/aiBudget.js is stubbed (no real DB); ../db's pool
// is stubbed too (see auth.middleware.test.js for this same require-cache
// convention) since requireAiBudget's admin-fallback path queries it
// directly when req.userRow isn't already set. End-to-end coverage of the
// 429 response shape against a real Postgres lives in
// test/integration/aiBudget.test.js.
const { pool } = require('../db');
const poolQueryMock = vi.fn();
pool.query = (...args) => poolQueryMock(...args);

const aiBudgetRepo = require('../repositories/aiBudget');
const recordUsageMock = vi.fn();
const getUsageForDayMock = vi.fn();
aiBudgetRepo.recordUsage = recordUsageMock;
aiBudgetRepo.getUsageForDay = getUsageForDayMock;

const { recordUsage, requireAiBudget } = require('../services/aiBudget');

describe('recordUsage — bills cached prompt tokens at their real (25%) weight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records prompt_tokens - 0.75*cached_tokens, not the raw prompt_tokens', async () => {
    await recordUsage(7, { prompt_tokens: 10000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 8000 } });
    // 10000 - 0.75*8000 = 4000
    expect(recordUsageMock).toHaveBeenCalledWith(7, expect.any(String), 4000, 500);
  });

  it('rounds a fractional result to the nearest integer', async () => {
    // 101 - 0.75*1 = 100.25 -> 100
    await recordUsage(7, { prompt_tokens: 101, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 1 } });
    expect(recordUsageMock).toHaveBeenCalledWith(7, expect.any(String), 100, 0);
  });

  it('tolerates a missing prompt_tokens_details field (no discount, full weight)', async () => {
    await recordUsage(7, { prompt_tokens: 500, completion_tokens: 20 });
    expect(recordUsageMock).toHaveBeenCalledWith(7, expect.any(String), 500, 20);
  });

  it('clips cached_tokens at prompt_tokens rather than going negative on an implausible response', async () => {
    // cached_tokens (500) exceeds prompt_tokens (100) — clip to 100, so
    // 100 - 0.75*100 = 25, never a negative count.
    await recordUsage(7, { prompt_tokens: 100, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 500 } });
    expect(recordUsageMock).toHaveBeenCalledWith(7, expect.any(String), 25, 0);
  });

  it('is a no-op when both weighted prompt tokens and completion tokens are zero', async () => {
    await recordUsage(7, { prompt_tokens: 0, completion_tokens: 0 });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('is a no-op without throwing when userId or usage is missing', async () => {
    await recordUsage(null, { prompt_tokens: 100, completion_tokens: 0 });
    await recordUsage(7, null);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});

describe('requireAiBudget — admin exemption', () => {
  function makeReqRes(overrides = {}) {
    const req = { user: { userId: 1 }, ...overrides };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    return { req, res, next };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getUsageForDayMock.mockResolvedValue({ prompt_tokens: 0, completion_tokens: 0 });
  });

  it('skips the budget check entirely for an admin via req.userRow — no extra DB read (authMiddleware already fetched it)', async () => {
    const { req, res, next } = makeReqRes({ userRow: { is_admin: true } });
    await requireAiBudget(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(getUsageForDayMock).not.toHaveBeenCalled();
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it('still enforces the budget for a non-admin req.userRow', async () => {
    getUsageForDayMock.mockResolvedValue({ prompt_tokens: 10_000_000, completion_tokens: 0 });
    const { req, res, next } = makeReqRes({ userRow: { is_admin: false } });
    await requireAiBudget(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to one indexed SELECT for admin status when req.userRow is absent', async () => {
    poolQueryMock.mockResolvedValue({ rows: [{ is_admin: true }] });
    const { req, res, next } = makeReqRes();
    await requireAiBudget(req, res, next);
    expect(poolQueryMock).toHaveBeenCalledWith(expect.stringMatching(/is_admin/i), [1]);
    expect(next).toHaveBeenCalled();
    expect(getUsageForDayMock).not.toHaveBeenCalled();
  });

  it('still enforces the budget when the DB fallback says not admin', async () => {
    poolQueryMock.mockResolvedValue({ rows: [{ is_admin: false }] });
    const { req, res, next } = makeReqRes();
    await requireAiBudget(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(getUsageForDayMock).toHaveBeenCalled();
  });
});
