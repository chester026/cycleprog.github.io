import Sidebar from './components/Sidebar';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TrainingsPage from './pages/TrainingsPage';
import ExchangeTokenPage from './pages/ExchangeTokenPage';
import GaragePage from './pages/GaragePage';
import AdminPage from './pages/AdminPage';
import PlanPage from './pages/PlanPage';
import ChecklistPage from './pages/ChecklistPage';
import CacheStatus from './components/CacheStatus';
import NutritionPage from './pages/NutritionPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/exchange_token" element={<ExchangeTokenPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<GaragePage />} />
          <Route path="/trainings" element={<TrainingsPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/nutrition" element={<NutritionPage />} />
        </Routes>
      </div>
      <CacheStatus />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
