import React, { Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../auth/AuthProvider';
import { LoadingSpinner } from '../App';

// T-6.1: layout route (guard + Sidebar + main-content), used as the parent
// of every protected page route in App.jsx's router. `isLoading` covers
// AuthProvider's initial refresh attempt — this never redirects to /login
// while that's still in flight (W-24: no login flash for an authenticated
// user with only a refresh token on page load).
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <>
      <Sidebar />
      <div className="main-content">
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet />
        </Suspense>
      </div>
    </>
  );
}
