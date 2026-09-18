import React from 'react';
import { Link } from 'react-router-dom';

// T-6.1: router's `path: '*'` catch-all, replacing the old behaviour where
// an unknown path under the protected `/*` region silently rendered nothing
// (no matching nested <Route>).
export default function NotFoundPage() {
  return (
    <div
      data-testid="not-found-page"
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
      <h1 style={{ fontSize: '3em', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.1em', color: '#666', margin: 0 }}>
        This page doesn&apos;t exist.
      </p>
      <Link to="/" style={{ color: '#274DD3', fontWeight: 600 }}>
        Back to bikelab.app
      </Link>
    </div>
  );
}
