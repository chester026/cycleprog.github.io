import Sidebar from './components/Sidebar';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import CacheStatus from './components/CacheStatus';
import ProtectedRoute from './components/ProtectedRoute';

// Lazy load pages for better performance
const TrainingsPage = lazy(() => import('./pages/TrainingsPage'));
const ExchangeTokenPage = lazy(() => import('./pages/ExchangeTokenPage'));
const GaragePage = lazy(() => import('./pages/GaragePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const ChecklistPage = lazy(() => import('./pages/ChecklistPage'));
const NutritionPage = lazy(() => import('./pages/NutritionPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

// Loading component
const LoadingSpinner = () => (
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

function App() {
  return (
    <Router>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/exchange_token" element={<ExchangeTokenPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
        <Sidebar />
        <div className="main-content">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<GaragePage />} />
              <Route path="/trainings" element={<TrainingsPage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/checklist" element={<ChecklistPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/nutrition" element={<NutritionPage />} />
            </Routes>
          </Suspense>
        </div>
        <CacheStatus />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
