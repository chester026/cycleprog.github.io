// Request validation driven by the shared API contract (T-7.1) — the
// successor of validateBody(schema): one middleware per route that checks
// params, query and body against the SAME `defineEndpoint` definition the
// clients call through `callEndpoint`, so a shape can't drift on one side
// without the other noticing (shared tests + inventory test).
//
//   const { contract: c } = require('@bikelab/shared/api');
//   router.get('/:id', authMiddleware, contract(c.activities.detail), handler);
//
// Parsed values replace req.params/req.query/req.body (so `z.coerce.number()`
// ids arrive as numbers). Errors are the unified 400 VALIDATION_ERROR body
// with per-field `details`, same as validateBody.
//
// Response validation: only when CONTRACT_VALIDATE_RESPONSES=1 (CI/dev) —
// `res.json` is wrapped and a mismatch is logged AND turned into a 500 so
// the integration suite fails loudly, while production never pays for a
// second parse of every response nor risks a false-positive outage.
const { ApiError } = require('../lib/apiError');
const logger = require('../lib/logger');

const VALIDATE_RESPONSES = process.env.CONTRACT_VALIDATE_RESPONSES === '1';

function issuesOf(error) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function contract(def) {
  if (!def || !def.method || !def.path) throw new Error('contract(): endpoint definition required');
  return function contractMiddleware(req, res, next) {
    if (def.params) {
      const r = def.params.safeParse(req.params);
      if (!r.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid route params', issuesOf(r.error)));
      // req.params is re-created by Express per layer — assigning fields keeps the object identity.
      Object.assign(req.params, r.data);
    }
    if (def.query) {
      const r = def.query.safeParse(req.query);
      if (!r.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid query', issuesOf(r.error)));
      // Express 5 exposes `req.query` as a getter; Express 4 (this app) lets us set it.
      try { req.query = r.data ?? {}; } catch { Object.assign(req.query, r.data ?? {}); }
    }
    if (def.body) {
      const r = def.body.safeParse(req.body);
      if (!r.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body', issuesOf(r.error)));
      req.body = r.data;
    }
    if (VALIDATE_RESPONSES && def.response && !def.sse) {
      const originalJson = res.json.bind(res);
      res.json = (payload) => {
        // Only successful bodies are contract-shaped; error envelopes are the errorHandler's.
        if (res.statusCode < 400) {
          const r = def.response.safeParse(payload);
          if (!r.success) {
            logger.error({ route: `${def.method} ${def.path}`, issues: issuesOf(r.error) }, '[contract] response does not match contract');
            res.status(500);
            return originalJson({ error: 'Response contract violation', code: 'INTERNAL', details: issuesOf(r.error) });
          }
        }
        return originalJson(payload);
      };
    }
    next();
  };
}

// Marks a route as intentionally outside the contract (static pages, OAuth
// browser callbacks, SSE, the legacy shim). The inventory test reads it.
function uncontracted(reason) {
  if (!reason) throw new Error('uncontracted(reason) needs a reason');
  const mw = function uncontractedMiddleware(req, res, next) { next(); };
  mw.__uncontracted = reason;
  return mw;
}

module.exports = { contract, uncontracted, VALIDATE_RESPONSES };
