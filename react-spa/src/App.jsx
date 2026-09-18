import './App.css';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate } from 'react-router-dom';
import React, { lazy, Suspense, useEffect } from 'react';
import ProtectedRoute from './components/ProtectedRoute';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import NotFoundPage from './pages/NotFoundPage';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { AuthProvider, useAuth, setNavigator } from './auth/AuthProvider';

// Lazy load pages for better performance
const LandingPage = lazy(() => import('./pages/LandingPage'));
const TrainingsPage = lazy(() => import('./pages/TrainingsPage'));
const ExchangeTokenPage = lazy(() => import('./pages/ExchangeTokenPage'));
const GaragePage = lazy(() => import('./pages/GaragePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const GoalAssistantPage = lazy(() => import('./pages/GoalAssistantPage'));
const GoalDetailPage = lazy(() => import('./pages/GoalDetailPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'));
const ChecklistPage = lazy(() => import('./pages/ChecklistPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

// Loading component — exported so ProtectedRoute (and anything else that
// needs the exact same "still figuring out auth" loader) doesn't duplicate
// it (T-6.1).
export const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    Loading...
  </div>
);

// "/" - лендинг для незалогиненных. Залогиненных сразу отправляем в гараж,
// лендинг им не показываем. `isLoading` avoids briefly flashing the landing
// page for an authenticated user while AuthProvider's initial refresh is
// still in flight.
function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  return isAuthenticated ? <Navigate to="/garage" replace /> : <LandingPage />;
}

// Gates /admin on top of ProtectedRoute's plain-auth check (T-6.1): the
// page itself stays a lazy chunk in the SPA (owner decision), only regular
// users get redirected before it ever loads.
function AdminRoute() {
  const { isAdmin, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!isAdmin) return <Navigate to="/garage" replace />;
  return <AdminPage />;
}

// Hands react-router's `navigate` to AuthProvider/utils/api.js so a hard
// 401 or a failed silent refresh can redirect via SPA navigation
// (`/login?session_expired=true`) instead of `window.location.href`.
function NavigatorBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    setNavigator(navigate);
    return () => setNavigator(null);
  }, [navigate]);
  return null;
}

function RootLayout() {
  return (
    <>
      <NavigatorBridge />
      <Suspense fallback={<LoadingSpinner />}>
        <Outlet />
      </Suspense>
    </>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'exchange_token', element: <ExchangeTokenPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'garage', element: <GaragePage /> },
          { path: 'goal-assistant', element: <GoalAssistantPage /> },
          { path: 'goal-assistant/:id', element: <GoalDetailPage /> },
          { path: 'analysis', element: <AnalysisPage /> },
          { path: 'maintenance', element: <MaintenancePage /> },
          { path: 'trainings', element: <TrainingsPage /> },
          { path: 'checklist', element: <ChecklistPage /> },
          { path: 'admin', element: <AdminRoute /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <RouterProvider router={router} />
      </OnboardingProvider>
    </AuthProvider>
  );
}

export default App;
