import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LastRideBanner.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';

export default function LastRideBanner() {
  const [lastRide, setLastRide] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    let userId = null, stravaId = null;
    try {
      const decoded = jwtDecode(token);
      userId = decoded.userId;
      stravaId = decoded.strava_id;
    } catch {}
    if (userId && !stravaId) {
      localStorage.removeItem(`cycleprog_cache_activities_${userId}`);
    }
    loadLastRide();
  }, []);

  // Добавляем эффект для повторной попытки загрузки
  useEffect(() => {
    if (!lastRide && retryCount < 3) {
      const timer = setTimeout(() => {
        console.log(`🔄 LastRideBanner: повторная попытка загрузки #${retryCount + 1}`);
        loadLastRide();
        setRetryCount(prev => prev + 1);
      }, 1000 + retryCount * 1000); // 1s, 2s, 3s интервалы

      return () => clearTimeout(timer);
    }
  }, [lastRide, retryCount]);

  // Слушаем изменения в localStorage для реагирования на обновления кэша
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key && e.key.includes('cycleprog_cache_activities')) {
        console.log('🔄 LastRideBanner: обнаружено обновление кэша активностей');
        loadLastRide();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Получить userId из токена
  function getUserId() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode(token);
      return decoded.userId;
    } catch {
      return null;
    }
  }

  const loadLastRide = async () => {
    try {
      const userId = getUserId();
      const cacheKey = userId ? `activities_${userId}` : CACHE_KEYS.ACTIVITIES;
      // Сначала проверяем кэш
      const cachedActivities = cacheUtils.get(cacheKey);
      if (cachedActivities && cachedActivities.length > 0) {
        // Используем кэшированные данные - фильтруем велосипедные активности
        const rides = cachedActivities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
        if (rides.length > 0) {
          const last = rides.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
          if (last) {
            setLastRide(last);
            setRetryCount(0); // Сбрасываем счетчик при успешной загрузке
          }
        }
        return;
      }

      // Если кэша нет, делаем запрос к серверу
      const res = await apiFetch('/api/activities');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        return;
      }
      
      if (!res.ok) return;
      
      const activities = await res.json();
      if (!activities.length) return;
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(cacheKey, activities, 30 * 60 * 1000);
      
      // Фильтруем велосипедные активности и находим самую свежую тренировку
      const rides = activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
      if (rides.length > 0) {
        const last = rides.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
        if (last) {
          setLastRide(last);
          setRetryCount(0); // Сбрасываем счетчик при успешной загрузке
        }
      }
    } catch (e) {
      console.error('Error loading last ride:', e);
      // Не авторизованы или ошибка - баннер остается скрытым
    }
  };

  if (!lastRide) return null;

          const dateStr = lastRide.start_date ? new Date(lastRide.start_date).toLocaleDateString('ru-RU') : '—';
  const dist = lastRide.distance ? (lastRide.distance/1000).toFixed(1) + ' km' : '—';
  const speed = lastRide.average_speed ? (lastRide.average_speed*3.6).toFixed(1) + ' km/h' : '—';
  const hr = lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' bpm' : '—';
  const cd = lastRide.average_cadence ? Math.round(lastRide.average_cadence) + ' rpm' : '—';

  return (
    <div id="last-ride-banner">
      <div className="banner-img-block">
        <div className="banner-img-title">New ride</div>
        <div style={{ position:'relative', fontSize:'10px', fontWeight:600, top: '45px', left:'20px' }}><span className='banner-meta' >Date:</span> <span className='banner-value'>{dateStr}</span></div>
      </div>
      <div className="banner-black-block">
       
        <div><span className='banner-meta'>Distance:</span> <span className='banner-value'>{dist}</span></div>
        <div><span className='banner-meta'>Avg. speed:</span> <span className='banner-value'>{speed}</span></div>
        <div><span className='banner-meta'>Heart:</span> <span className='banner-value'>{hr}</span></div>
        <div><span className='banner-meta'>Cadence:</span> <span className='banner-value'>{cd}</span></div>
      </div>
      <div className="banner-btn-block">
        <button 
          className="last-ride-more-btn" 
          onClick={() => navigate('/')}
        >
          More
        </button>
      </div>
    </div>
  );
} 