import Sidebar from './components/Sidebar';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ProtectedRoute from './components/ProtectedRoute';
import { OnboardingProvider } from './contexts/OnboardingContext';

// Lazy load pages for better performance
const TrainingsPage = lazy(() => import('./pages/TrainingsPage'));
const ExchangeTokenPage = lazy(() => import('./pages/ExchangeTokenPage'));
const GaragePage = lazy(() => import('./pages/GaragePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const GoalAssistantPage = lazy(() => import('./pages/GoalAssistantPage'));
const GoalDetailPage = lazy(() => import('./pages/GoalDetailPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const ChecklistPage = lazy(() => import('./pages/ChecklistPage'));
const NutritionPage = lazy(() => import('./pages/NutritionPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
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
      <OnboardingProvider>
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
                <Route path="/goal-assistant" element={<GoalAssistantPage />} />
                <Route path="/goal-assistant/:id" element={<GoalDetailPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/trainings" element={<TrainingsPage />} />
                <Route path="/checklist" element={<ChecklistPage />} />
                <Route path="/nutrition" element={<NutritionPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Routes>
            </Suspense>
          </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </OnboardingProvider>
    </Router>
  );
}

export default App;
