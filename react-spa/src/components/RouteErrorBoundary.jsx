import React from 'react';
import { useRouteError } from 'react-router-dom';

// T-6.1: `errorElement` for every route object in App.jsx's router. Catches
// render/loader errors that used to crash the whole SPA to a blank white
// screen (react-router 7's data router unmounts nothing else — only the
// route subtree that threw).
export default function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('Route error:', error);

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
