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

function App() {
  return (
    <Router>
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<GaragePage />} />
          <Route path="/trainings" element={<TrainingsPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/exchange_token" element={<ExchangeTokenPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
      <CacheStatus />
    </Router>
  );
}

export default App;
