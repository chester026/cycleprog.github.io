import React, { useState } from 'react';
import './AdminPage.css';
import Footer from '../components/Footer';
import UsersTab from './admin/UsersTab';
import StravaTab from './admin/StravaTab';
import HeroImagesTab from './admin/HeroImagesTab';
import DatabaseTab from './admin/DatabaseTab';
import AiUsageTab from './admin/AiUsageTab';

// T-6.3 (audit W-21/W-22/W-23, GUIDE-6.md "no file > 600 lines" target):
// AdminPage.jsx was 852 lines with every tab's markup/state/handlers
// inline plus a page-local `Notification` component and window.alert/
// confirm calls. It is now a thin tab shell — each tab is its own file
// under src/pages/admin/ with its own data hooks (from
// src/data/hooks/useAdmin.js), its own useConfirm/useToast wiring, and (for
// Users/Strava/HeroImages) its own loading state, instead of one page-wide
// Promise.all gate. Default export + lazy-chunk boundary (App.jsx) unchanged.
const TABS = [
  { id: 'users', label: 'Users', Component: UsersTab },
  { id: 'strava', label: 'Strava', Component: StravaTab },
  { id: 'hero', label: 'Hero Images', Component: HeroImagesTab },
  { id: 'database', label: 'Database', Component: DatabaseTab },
  { id: 'ai-usage', label: 'AI Usage', Component: AiUsageTab },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('users');
  const ActiveTabComponent = TABS.find((t) => t.id === activeTab)?.Component ?? UsersTab;

  return (
    <div className="admin-wrap">
      <div className="admin-layout">
        {/* Вертикальная боковая панель с табами */}
        <div className="admin-sidebar">
          <div className="admin-tabs">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                className={`admin-tab-btn ${activeTab === id ? 'admin-tab-active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <span className="tab-text">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Основной контент */}
        <div className="admin-content">
          <ActiveTabComponent />
        </div>
      </div>

      <Footer />
    </div>
  );
}
