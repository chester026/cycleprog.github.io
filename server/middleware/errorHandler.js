const config = require('../config');
const { ApiError } = require('../lib/apiError');

// Last app.use — catches anything asyncHandler-wrapped routes forward via
// next(err), plus any synchronous throw Express itself catches.
//
// Every error response body follows the same shape:
//   { error: '<human message>', code: '<UPPER_SNAKE_CODE>', [details] }
// `error` stays a string for backward compatibility with both clients
// (react-spa/src/utils/api.js, BikeLabApp/src/utils/api.ts), which have
// always read `errorData.error`. `code` is new and machine-readable.
// `details` (an array) is only ever present for validation errors.
function errorHandler(err, req, res, next) {
  // req.log is attached by pino-http (middleware/requestLogger.js); falls
  // back to nothing rather than console in the (test-only) case a request
  // reaches this handler without going through that middleware first.
  req.log?.error({ err }, 'unhandled');
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined && { details: err.details }),
    });
  }

  // multer file-size limit
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large', code: 'FILE_TOO_LARGE' });
  }
  // multer fileFilter rejection (the `cb(new Error(...))` in server.js's
  // `upload` config) — multer wraps/forwards it as a plain Error, not one of
  // its own MulterError codes.
  if (err && err.message === 'Only JPEG/PNG/WebP allowed') {
    return res.status(400).json({ error: err.message, code: 'UNSUPPORTED_FILE_TYPE' });
  }
  // express.json() body-parser failure (malformed JSON body)
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON', code: 'INVALID_JSON' });
  }

  res.status(err.status || 500).json({
    error: config.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
    code: 'INTERNAL',
  });
}

module.exports = errorHandler;
