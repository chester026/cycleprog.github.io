import { Link, useLocation, useNavigate } from 'react-router-dom';
import LastRideBanner from './LastRideBanner';
import './Sidebar.css';
import { useEffect, useState, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { CachedImage } from '../utils/imageCache.jsx';
import { proxyStravaImage } from '../utils/imageProxy';
import bl_logo from '../assets/img/logo/bl_logo.png';

const navItems = [
  { to: '/', label: 'Bike Garage' },
  { to: '/trainings', label: 'Activities' },
  { to: '/plan', label: 'Analysis & Plan' },
  { to: '/nutrition', label: 'Nutrition' },
  { to: '/checklist', label: 'Checklists' }
];

export default function Sidebar() {
  const location = useLocation();
  const isMainPage = location.pathname === '/';
  const navigate = useNavigate();

  const [showStravaSuccess, setShowStravaSuccess] = useState(false);
  const [stravaId, setStravaId] = useState(null);
  const [userName, setUserName] = useState(localStorage.getItem('user_name'));
  const [userAvatar, setUserAvatar] = useState(localStorage.getItem('user_avatar'));
  const [userDataLoaded, setUserDataLoaded] = useState(false);

  // Функция для обновления данных пользователя из токена
  const updateUserDataFromToken = () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setStravaId(decoded.strava_id);
        if (decoded.name) setUserName(decoded.name);
        if (decoded.avatar) setUserAvatar(decoded.avatar);
        setUserDataLoaded(true);
      } catch (error) {
        console.error('Error decoding token:', error);
        setUserDataLoaded(true); // Все равно помечаем как загруженное
      }
    } else {
      setUserDataLoaded(true); // Нет токена - тоже считаем загруженным
    }
  };

  // Обновляем данные при монтировании компонента
  useEffect(() => {
    updateUserDataFromToken();
  }, []);

  useEffect(() => {
    // Проверяем query-параметр после редиректа с Strava
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava_linked') === '1') {
      setShowStravaSuccess(true);
      setTimeout(() => setShowStravaSuccess(false), 4000);
      // Очищаем query
      params.delete('strava_linked');
      window.history.replaceState({}, '', window.location.pathname);
      // Обновляем данные пользователя
      updateUserDataFromToken();
    }

    // Слушаем сообщения от popup окна подключения Strava
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'STRAVA_CONNECTED' && event.data.success) {
        setShowStravaSuccess(true);
        setTimeout(() => setShowStravaSuccess(false), 4000);
        // Обновляем данные пользователя из нового токена
        updateUserDataFromToken();
      }
    };

    // Слушаем завершение онбординга для обновления токена
    const handleOnboardingComplete = (event) => {
      if (event.detail?.tokenUpdated) {
        // Небольшая задержка, чтобы токен успел обновиться
        setTimeout(() => {
          updateUserDataFromToken();
        }, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('onboardingComplete', handleOnboardingComplete);
    
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('onboardingComplete', handleOnboardingComplete);
    };
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



  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
            <div 
              className="sidebar-user-block" 
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/profile')}
            >
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
              <div className="sidebar-user-name">
                {userName}
              </div>
            </div>
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