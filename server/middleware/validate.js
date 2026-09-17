// Request-body validation using the same zod schemas @bikelab/shared exports
// for clients (T-2.2, docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/
// 04-cross-layer.md §6.1). Schemas are written to be tolerant of what real
// clients send TODAY (partial/passthrough where needed) — the goal is
// rejecting garbage *types*, not changing accepted shapes; existing
// handler-level checks (range validation, ownership checks, etc.) stay as
// they are.
const { ApiError } = require('../lib/apiError');

// `schema.parse(req.body)` throws a ZodError on failure; asyncRoutes'
// patchAsyncRoutes only auto-wraps `async function` handlers, so this stays
// a plain (non-async) middleware and calls next(err) itself rather than
// relying on being auto-wrapped.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body', issues));
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
