import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LastRideBanner from './LastRideBanner';
import './Sidebar.css';
import { proxyStravaImage } from '../utils/imageProxy';
import { startStravaLink } from '../utils/strava';
import { useAuth } from '../auth/AuthProvider';
import bl_logo from '../assets/img/logo/bl_logo.png';

const navItems = [
  { to: '/garage', label: 'Bike Garage' },
  { to: '/goal-assistant', label: 'Goal Assistant' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/trainings', label: 'Activities' },
  { to: '/checklist', label: 'Checklist' }
];

export default function Sidebar() {
  const location = useLocation();
  const isMainPage = location.pathname === '/garage';
  const navigate = useNavigate();
  // user/name/avatar/strava_id come from GET /api/user-profile via
  // AuthProvider (T-6.1) — no more decoding the JWT ourselves.
  const { user, isLoading, logout, refreshProfile } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const stravaId = user?.strava_id || null;
  const userName = user?.name || null;
  const userAvatar = user?.avatar || null;
  const userDataLoaded = !isLoading;

  useEffect(() => {
    // Проверяем query-параметр после редиректа с Strava (не через popup —
    // сервер шлёт сюда на /profile?strava=linked|error, см. GET /link_strava)
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'linked') {
      // Очищаем query
      params.delete('strava');
      window.history.replaceState({}, '', window.location.pathname);
      // Профиль (strava_id/avatar) изменился на сервере — перечитываем его
      // вместо декодирования токена, который тут не меняется.
      refreshProfile();
    }

    // Слушаем сообщения от popup окна подключения Strava
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'strava-linked') {
        refreshProfile();
      }
    };

    // Слушаем завершение онбординга для обновления профиля
    const handleOnboardingComplete = (event) => {
      if (event.detail?.tokenUpdated) {
        // Небольшая задержка, чтобы профиль успел обновиться на сервере
        setTimeout(() => {
          refreshProfile();
        }, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('onboardingComplete', handleOnboardingComplete);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('onboardingComplete', handleOnboardingComplete);
    };
  }, [refreshProfile]);

  const handleLogout = () => {
    // T-6.4: `utils/cache.js` (the `cycleprog_cache_*` keys this used to
    // remove by hand) is deleted — `logout()` already clears everything via
    // AuthProvider's registered-cleanup list (QueryProvider registers
    // `clearQueryCache`, see src/data/QueryProvider.jsx), so there's no
    // per-user localStorage left to clean up here.
    logout();
    navigate('/login');
  };

  const handleConnectStrava = async () => {
    try {
      await startStravaLink();
    } catch (e) {
      console.error('Failed to start Strava link:', e);
    }
  };

  // Закрываем мобильное меню при клике на ссылку
  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  // Закрываем меню при изменении маршрута
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);



  return (
    <>
      {/* Бургер-кнопка для мобильных устройств */}
      <button
        className={`mobile-menu-toggle ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {/* Оверлей для закрытия меню при клике вне */}
      {isMobileMenuOpen && (
        <div
          className="mobile-overlay"
          role="presentation"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`} data-testid="sidebar">
        <nav>
          <div className="main-logo-text">
            <img src={bl_logo} alt="BikeLab" />
            <span className="main-logo-span">bikelab.app</span>
          </div>

          <ul>
            {navItems.map(item => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={location.pathname === item.to ? 'active' : ''}
                  onClick={handleNavClick}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      {isMainPage && (
        <div style={{
          fontSize: '12px',
          fontWeight: 400,
          color: '#333',
          opacity: 0.5,
          marginTop: '1.5em',
          lineHeight: '21px',
          padding: '14px 26px 16px 14px'
        }}>
          Go to the <b>Goal Assistant</b> page to set your training goals.
        </div>
      )}
      {!isMainPage && <LastRideBanner />}
      <div style={{ flex: 1 }} />
      <div className='user-aside-container'>
        {userDataLoaded && !stravaId ? (
          <button
            onClick={handleConnectStrava}
            style={{
              margin: '10px 20px 16px',
              padding: '12px 0',
              border: 'none',
              width: '100%',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '0.8em',
              cursor: 'pointer',
              background: '#fc4c02',
              color: '#fff'
            }}
          >
            Connect Strava
          </button>
        ) : userDataLoaded && stravaId ? (
          userName && (
            <button
              type="button"
              className="sidebar-user-block sidebar-user-block-btn"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/profile')}
            >
              {userAvatar ? (
                <img
                  src={proxyStravaImage(userAvatar)}
                  alt={userName}
                  className="sidebar-user-avatar"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="sidebar-user-avatar sidebar-user-initial"
                style={{ display: userAvatar ? 'none' : 'flex' }}
              >
                {userName[0]}
              </div>
              <div className="sidebar-user-name">
                {userName}
              </div>
            </button>
          )
        ) : !userDataLoaded ? (
          <div style={{
            margin: '10px 20px 16px',
            padding: '12px 0',
            textAlign: 'center',
            fontSize: '0.8em',
            color: '#666'
          }}>
            Loading...
          </div>
        ) : null}
        <button
          onClick={handleLogout}
          data-testid="logout-button"
          style={{
            margin: '10px 4px 16px',
            padding: '6px 0px 10px 0px',
            textAlign: 'center',
            border: 'none',
            fontWeight: 600,
            fontSize: '0.8em',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <i className="sign-out-icon material-symbols-outlined">logout</i>
        </button>
      </div>

    </aside>
    </>
  );
}
