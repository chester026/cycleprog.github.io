// Typed error the errorHandler middleware knows how to render as the unified
// API error body: { error: <message string>, code: <UPPER_SNAKE>, [details] }.
// Route handlers throw/next() one of these instead of hand-rolling
// res.status(...).json({ error, code }) so the shape stays consistent and the
// status/code pairing lives in one place.
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// `details` is only meaningful for validation errors (an array of per-field
// problems) — see the format contract in docs/audit/layers/04-cross-layer.md §5.6.
function badRequest(code, message, details) {
  return new ApiError(400, code, message, details);
}

function unauthorized(message = 'Unauthorized') {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

function forbidden(message = 'Forbidden') {
  return new ApiError(403, 'FORBIDDEN', message);
}

function notFound(code, message) {
  return new ApiError(404, code, message);
}

function conflict(message = 'Conflict') {
  return new ApiError(409, 'CONFLICT', message);
}

function tooMany(message = 'Too many requests') {
  return new ApiError(429, 'RATE_LIMITED', message);
}

function internal(message = 'Internal server error') {
  return new ApiError(500, 'INTERNAL', message);
}

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooMany,
  internal,
};
