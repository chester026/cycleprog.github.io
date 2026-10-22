import './App.css';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import React, { lazy, Suspense, useEffect } from 'react';
import ProtectedRoute from './components/ProtectedRoute';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import NotFoundPage from './pages/NotFoundPage';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { AuthProvider, useAuth, setNavigator } from './auth/AuthProvider';
import { Loader } from './ui';

// Pages are lazy chunks so the login/landing path doesn't download the app.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const TrainingsPage = lazy(() => import('./pages/TrainingsPage'));
const ExchangeTokenPage = lazy(() => import('./pages/ExchangeTokenPage'));
const GaragePage = lazy(() => import('./pages/GaragePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const CoachPage = lazy(() => import('./pages/CoachPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
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

// Full-viewport loader — exported so ProtectedRoute shows the exact same
// "still figuring out auth" state instead of duplicating it (T-6.1).
export const LoadingSpinner = () => (
  <div className="page-loading">
    <Loader label="Loading..." size="lg" />
  </div>
);

// "/" is the landing page for visitors. A logged-in user goes straight to
// the garage and never sees the landing. `isLoading` avoids briefly flashing
// the landing page for an authenticated user while AuthProvider's initial
// refresh is still in flight.
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

// `/goal-assistant/:id` → `/goals/:id`, keeping the id.
function GoalAssistantRedirect() {
  const { id } = useParams();
  return <Navigate to={`/goals/${id}`} replace />;
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
        // A page that throws keeps the shell (sidebar) — only the page
        // subtree is replaced by the boundary.
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: 'garage', element: <GaragePage /> },
          // One element for the coach home and a chat so a chat started from
          // the home keeps its state while the URL catches up (CoachPage.jsx).
          {
            path: 'coach',
            element: <CoachPage />,
            children: [
              { index: true, element: null },
              { path: 'c/:conversationId', element: null },
            ],
          },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'goals/:id', element: <GoalDetailPage /> },
          // The pre-coach URLs: the generator page is gone, goals moved.
          { path: 'goal-assistant', element: <Navigate to="/coach" replace /> },
          { path: 'goal-assistant/:id', element: <GoalAssistantRedirect /> },
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
