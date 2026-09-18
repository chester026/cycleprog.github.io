import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

// Avoid pulling in App.jsx's router/AuthProvider/OnboardingProvider tree —
// ProtectedRoute only needs its named `LoadingSpinner` export.
vi.mock('../App', () => ({
  LoadingSpinner: () => <div>Loading...</div>,
}));

const mockUseAuth = vi.fn();
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/garage']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/garage" element={<div>Garage Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    renderProtected();

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Garage Page')).not.toBeInTheDocument();
  });

  it('shows the loader instead of redirecting while auth is still loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

    renderProtected();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
