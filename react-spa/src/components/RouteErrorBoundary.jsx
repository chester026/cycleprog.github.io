import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { logError } from '../lib/log';

// T-6.1: `errorElement` of the root route AND of the protected layout route
// in App.jsx's router, so a page that throws keeps the sidebar. Catches
// render/loader errors that used to crash the whole SPA to a blank white
// screen; react-router 7 only unmounts the route subtree that threw. Errors
// are reported through `logError` (Sentry in prod) — react-router's
// errorElement replaces `Sentry.ErrorBoundary` here, since the router owns
// the boundary.
export default function RouteErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    logError(error, 'Route error', { path: window.location.pathname });
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '1em',
        textAlign: 'center',
        padding: '0 1em',
      }}
    >
      <h1 style={{ fontSize: '1.6em', margin: 0 }}>Something went wrong</h1>
      <p style={{ color: '#666', margin: 0 }}>
        This page hit an unexpected error. Reloading usually fixes it.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 20px',
          border: 'none',
          background: '#274DD3',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}
