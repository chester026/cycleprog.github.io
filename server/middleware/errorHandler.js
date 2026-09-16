// Last app.use — catches anything asyncHandler-wrapped routes forward via
// next(err), plus any synchronous throw Express itself catches.
function errorHandler(err, req, res, next) {
  console.error('[error handler]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
  });
}

module.exports = errorHandler;
