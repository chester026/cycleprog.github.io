import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';

// Same reasoning as ProtectedRoute.test.jsx — keep this test from pulling in
// App.jsx's full router/lazy page tree.
vi.mock('../App', () => ({
  LoadingSpinner: () => <div>Loading...</div>,
}));

describe('router: unknown path', () => {
  it('renders NotFoundPage for a path with no matching route', () => {
    render(
      <MemoryRouter initialEntries={['/this-route-does-not-exist']}>
        <Routes>
          <Route path="/garage" element={<div>Garage Page</div>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('404')).toBeInTheDocument();
  });
});
