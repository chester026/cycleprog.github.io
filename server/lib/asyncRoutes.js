// Shared helper: wraps app.get/post/put/delete/patch (or an express.Router's
// equivalents) so any async handler passed to them automatically forwards a
// rejected promise to next(err), instead of becoming an unhandled rejection.
// server.js applies this to the top-level `app` itself inline (see the top
// of that file); this module lets routes/*.js apply the exact same behavior
// to their routers without duplicating the wrapping logic.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function patchAsyncRoutes(appOrRouter) {
  for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
    if (typeof appOrRouter[m] !== 'function') continue;
    const orig = appOrRouter[m].bind(appOrRouter);
    appOrRouter[m] = (routePath, ...handlers) =>
      orig(routePath, ...handlers.map((h) => (typeof h === 'function' && h.constructor.name === 'AsyncFunction') ? asyncHandler(h) : h));
  }
  return appOrRouter;
}

module.exports = { asyncHandler, patchAsyncRoutes };
