import { Link, useLocation, useNavigate } from 'react-router-dom';
import LastRideBanner from './LastRideBanner';
import './Sidebar.css';
import { useEffect, useState, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { CachedImage } from '../utils/imageCache.jsx';
import { proxyStravaImage } from '../utils/imageProxy';

const navItems = [
  { to: '/', label: 'Bike Garage' },
  { to: '/nutrition', label: 'Nutrition' },
  { to: '/trainings', label: 'Trainings' },
  { to: '/plan', label: 'Analysis & Plan' },
  { to: '/checklist', label: 'Checklists' },
];

export default function Sidebar() {
  const location = useLocation();
  const isMainPage = location.pathname === '/';
  const navigate = useNavigate();

  const [showStravaSuccess, setShowStravaSuccess] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const profileRef = useRef();

  // Получить user info из токена
  let token = localStorage.getItem('token') || sessionStorage.getItem('token');
  let userName = localStorage.getItem('user_name');
  let userAvatar = localStorage.getItem('user_avatar');
  let stravaId = null;
  if (token) {
    try {
      const decoded = jwtDecode(token);
      stravaId = decoded.strava_id;
      if (!userName && decoded.name) userName = decoded.name;
      if (!userAvatar && decoded.avatar) userAvatar = decoded.avatar;
    } catch {}
  }

  useEffect(() => {
    // Проверяем query-параметр после редиректа с Strava
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava_linked') === '1') {
      setShowStravaSuccess(true);
      setTimeout(() => setShowStravaSuccess(false), 4000);
      // Очищаем query
      params.delete('strava_linked');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogout = () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    let userId = null;
    try { userId = jwtDecode(token).userId; } catch {}
    if (userId) localStorage.removeItem(`cycleprog_cache_activities_${userId}`);
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    navigate('/login');
  };

  const handleConnectStrava = () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const backendBase = import.meta.env.PROD
      ? 'https://bikelab.app'
      : 'http://localhost:8080';
    const redirect = encodeURIComponent(`${backendBase}/link_strava`);
    window.location.href =
      `https://www.strava.com/oauth/authorize?client_id=165560&response_type=code&redirect_uri=${redirect}&scope=activity:read_all,profile:read_all&approval_prompt=auto&state=${token}`;
  };

  // Unlink Strava
  const handleUnlinkStrava = async () => {
    setShowProfilePopup(false);
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    let userId = null;
    try { userId = jwtDecode(token).userId; } catch {}
    const res = await fetch('/api/unlink_strava', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      // Очищаем кэш Strava activities для этого пользователя
      if (userId) localStorage.removeItem(`cycleprog_cache_activities_${userId}`);
      const data = await res.json();
      localStorage.setItem('token', data.token);
      window.location.reload();
    } else {
      alert('Failed to unlink Strava');
    }
  };

  // Закрытие попапа при клике вне
  useEffect(() => {
    if (!showProfilePopup) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfilePopup(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfilePopup]);

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav>
        <h2 className="main-logo-text">BIKELAB<span className="main-logo-span">.app</span></h2>
       
        <ul>
          {navItems.map(item => (
            <li key={item.to}>
              <Link 
                to={item.to} 
                className={location.pathname === item.to ? 'active' : ''}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {isMainPage && (
        <div style={{
          fontSize: '13px',
          fontWeight: 400,
          color: '#333',
          opacity: 0.5,
          marginTop: '1.5em',
          lineHeight: '21px',
          padding: '16px'
        }}>
          Go to the <b>Trainings</b> tab to view and export your data.
        </div>
      )}
      {!isMainPage && <LastRideBanner />}
      <div style={{ flex: 0.95 }} />
      <div className='user-aside-container'>
        {showStravaSuccess && (
          <div style={{ background: '#4caf50', color: '#fff', padding: '10px', borderRadius: 6, margin: '0 16px 12px 16px', textAlign: 'center', fontWeight: 600 }}>
            Strava account successfully linked!
          </div>
        )}
        {!stravaId ? (
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
        ) : (
          userName && (
            <div className="sidebar-user-block" ref={profileRef} style={{ position: 'relative' }}>
              {userAvatar ? (
                <CachedImage 
                  src={proxyStravaImage(userAvatar)} 
                  alt={userName} 
                  className="sidebar-user-avatar"
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
              <div
                className="sidebar-user-name"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowProfilePopup(v => !v)}
              >
                {userName}
              </div>
              {showProfilePopup && (
                <div style={{
                  position: 'absolute',
                  bottom: '110%',
                  left: 0,
                  background: '#fff',
                  border: '1px solid #e3e8ee',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px 0 rgba(0,0,0,0.10)',
                  padding: '18px 22px',
                  zIndex: 1000,
                  minWidth: 180
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 10 }}>Profile</div>
                  <button
                    onClick={handleUnlinkStrava}
                    style={{
                      background: '#e53935',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 5,
                      padding: '8px 0',
                      width: '100%',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginBottom: 4
                    }}
                  >
                    Unlink Strava
                  </button>
                </div>
              )}
            </div>
          )
        )}
        <button
          onClick={handleLogout}
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
  );
} 