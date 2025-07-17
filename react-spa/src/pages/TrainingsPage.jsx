import React, { useState, useEffect } from 'react';
import './TrainingsPage.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import { apiFetch } from '../utils/api';

export default function TrainingsPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [selectedYear, setSelectedYear] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [filters, setFilters] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    type: '',
    distMin: '',
    distMax: '',
    speedMin: '',
    speedMax: '',
    hrMin: '',
    hrMax: '',
    elevMin: '',
    elevMax: ''
  });
  const [heroImage, setHeroImage] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [activityAnalysis, setActivityAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Strava OAuth константы
  const clientId = '165560';
  const redirectUri = window.location.origin + '/exchange_token';
  const scope = 'activity:read_all';

  // Получаем годы из данных
  const years = Array.from(new Set(activities.map(a => a.start_date ? new Date(a.start_date).getFullYear() : null).filter(Boolean))).sort((a,b) => b-a);
  
  // Фильтрация по году
  const yearFiltered = selectedYear === 'all' ? activities : activities.filter(a => a.start_date && new Date(a.start_date).getFullYear() == selectedYear);
  
  // Получаем типы тренировок для выбранного года
  const types = Array.from(new Set(yearFiltered.map(a => a.type).filter(Boolean)));

  // Применение всех фильтров
  const filteredActivities = yearFiltered.filter(a => {
    if (filters.name && !(a.name || '').toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.dateFrom && (!a.start_date || new Date(a.start_date) < new Date(filters.dateFrom))) return false;
    if (filters.dateTo && (!a.start_date || new Date(a.start_date) > new Date(filters.dateTo + 'T23:59:59'))) return false;
    if (filters.type && a.type !== filters.type) return false;
    if (filters.distMin && (!a.distance || a.distance/1000 < parseFloat(filters.distMin))) return false;
    if (filters.distMax && (!a.distance || a.distance/1000 > parseFloat(filters.distMax))) return false;
    if (filters.speedMin && (!a.average_speed || a.average_speed*3.6 < parseFloat(filters.speedMin))) return false;
    if (filters.speedMax && (!a.average_speed || a.average_speed*3.6 > parseFloat(filters.speedMax))) return false;
    if (filters.hrMin && (!a.average_heartrate || a.average_heartrate < parseFloat(filters.hrMin))) return false;
    if (filters.hrMax && (!a.average_heartrate || a.average_heartrate > parseFloat(filters.hrMax))) return false;
    if (filters.elevMin && (!a.total_elevation_gain || a.total_elevation_gain < parseFloat(filters.elevMin))) return false;
    if (filters.elevMax && (!a.total_elevation_gain || a.total_elevation_gain > parseFloat(filters.elevMax))) return false;
    return true;
  });

  // Статистика по отфильтрованным данным (заменяем на данные с сервера)
  // const totalMeters = filteredActivities.reduce((sum, act) => sum + (act.distance || 0), 0);
  // const totalKm = (totalMeters / 1000).toFixed(1);
  // const totalElev = filteredActivities.reduce((sum, act) => sum + (act.total_elevation_gain || 0), 0);
  // const totalMovingSec = filteredActivities.reduce((sum, act) => sum + (act.moving_time || 0), 0);
  // const totalMovingHours = (totalMovingSec / 3600).toFixed(1);
  // let avgSpeed = '—';
  // if (totalMovingSec > 0) {
  //   avgSpeed = ((totalMeters / 1000) / (totalMovingSec / 3600)).toFixed(1);
  // }

  const resetFilters = () => {
    setFilters({
      name: '',
      dateFrom: '',
      dateTo: '',
      type: '',
      distMin: '',
      distMax: '',
      speedMin: '',
      speedMax: '',
      hrMin: '',
      hrMax: '',
      elevMin: '',
      elevMax: ''
    });
  };

  const downloadJSON = () => {
    if (!filteredActivities.length) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredActivities, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', 'strava_activities.json');
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
  };

  const copyActivityData = (activity, buttonElement) => {
    const fieldMap = {
      distance: { label: 'Дистанция', unit: 'км' },
      moving_time: { label: 'Время в движении', unit: 'мин' },
      elapsed_time: { label: 'Общее время', unit: 'мин' },
      total_elevation_gain: { label: 'Набор высоты', unit: 'м' },
      average_speed: { label: 'Средняя скорость', unit: 'км/ч' },
      max_speed: { label: 'Максимальная скорость', unit: 'км/ч' },
      average_cadence: { label: 'Средний каденс', unit: 'об/мин' },
      average_temp: { label: 'Средняя температура', unit: '°C' },
      average_heartrate: { label: 'Средний пульс', unit: 'уд/мин' },
      max_heartrate: { label: 'Максимальный пульс', unit: 'уд/мин' },
      elev_high: { label: 'Макс. высота', unit: 'м' }
    };
    
    const activityData = {};
    Object.keys(fieldMap).forEach(key => {
      let value = activity[key];
      if (value == null) value = '-';
      if (key === 'distance' && value !== '-') value = (value / 1000).toFixed(2);
      if ((key === 'moving_time' || key === 'elapsed_time') && value !== '-') value = (value / 60).toFixed(1);
      if ((key === 'average_speed' || key === 'max_speed') && value !== '-') value = (value * 3.6).toFixed(2);
      activityData[key] = value;
    });
    activityData.name = activity.name || 'Без названия';
    
    navigator.clipboard.writeText(JSON.stringify(activityData, null, 2));
    
    // Показываем подтверждение
    if (buttonElement) {
      const originalText = buttonElement.textContent;
      buttonElement.textContent = '✔';
      setTimeout(() => {
        buttonElement.textContent = originalText;
      }, 1200);
    }
  };

  const showActivityModal = async (activity) => {
    setSelectedActivity(activity);
    setActivityAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    try {
      const res = await apiFetch(`/api/analytics/activity/${activity.id}`);
      if (!res.ok) throw new Error('Ошибка анализа активности');
      const data = await res.json();
      setActivityAnalysis(data);
    } catch (e) {
      setAnalysisError('Ошибка анализа активности');
    } finally {
      setAnalysisLoading(false);
    }
    setShowModal(true);
  };

  // Функция для анализа тренировки и генерации рекомендаций
  const analyzeActivity = (activity) => {
    // Определяем тип тренировки
    let type = 'Обычная';
    if (activity.distance && activity.distance/1000 > 60) type = 'Длинная';
    else if (activity.average_speed && activity.average_speed*3.6 < 20 && activity.moving_time && activity.moving_time/60 < 60) type = 'Восстановительная';
    else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Горная';
    else if ((activity.name||'').toLowerCase().includes('интервал') || (activity.type||'').toLowerCase().includes('interval')) type = 'Интервальная';
    
    // Генерируем рекомендации
    const recommendations = [];
    
    if (activity.average_speed && activity.average_speed*3.6 < 25) {
      recommendations.push({
        title: 'Средняя скорость ниже 25 км/ч',
        advice: 'Для повышения скорости включайте интервальные тренировки (например, 4×4 мин в Z4-Z5 с отдыхом 4 мин), работайте над техникой педалирования (каденс 90–100), следите за положением тела на велосипеде и аэродинамикой.'
      });
    }
    
    if (activity.average_heartrate && activity.average_heartrate > 155) {
      recommendations.push({
        title: 'Пульс выше 155 уд/мин',
        advice: 'Это может быть признаком высокой интенсивности или недостаточного восстановления. Проверьте качество сна, уровень стресса, добавьте восстановительные тренировки, следите за гидратацией и питанием.'
      });
    }
    
    if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed*3.6 < 18) {
      recommendations.push({
        title: 'Горная тренировка с низкой скоростью',
        advice: 'Для улучшения результатов добавьте силовые тренировки вне велосипеда и интервалы в подъёмы (например, 5×5 мин в Z4).'
      });
    }
    
    if (!activity.average_heartrate) {
      recommendations.push({
        title: 'Нет данных по пульсу',
        advice: 'Добавьте датчик пульса для более точного контроля интенсивности и восстановления.'
      });
    }
    
    if (!activity.distance || activity.distance/1000 < 30) {
      recommendations.push({
        title: 'Короткая дистанция',
        advice: 'Для развития выносливости планируйте хотя бы одну длинную поездку (60+ км) в неделю. Постепенно увеличивайте дистанцию, не забывая про питание и гидратацию в пути.'
      });
    }
    
    if (type === 'Восстановительная') {
      recommendations.push({
        title: 'Восстановительная тренировка',
        advice: 'Отлично! Не забывайте чередовать такие тренировки с интервальными и длинными для прогресса.'
      });
    }
    
    if (type === 'Интервальная' && activity.average_heartrate && activity.average_heartrate < 140) {
      recommendations.push({
        title: 'Интервальная тренировка с низким пульсом',
        advice: 'Интервалы стоит выполнять с большей интенсивностью (Z4-Z5), чтобы получить максимальный тренировочный эффект.'
      });
    }
    
    if (!activity.average_cadence) {
      recommendations.push({
        title: 'Нет данных по каденсу',
        advice: 'Использование датчика каденса поможет отслеживать технику педалирования и избегать излишней усталости.'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Отличная тренировка!',
        advice: 'Тренировка выполнена отлично! Продолжайте в том же духе и постепенно повышайте нагрузку для дальнейшего прогресса.'
      });
    }
    
    return { type, recommendations };
  };

  const handleStravaLogin = () => {
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=auto&scope=${scope}`;
    window.location.href = url;
  };

  const handleYearChange = (e) => {
    setSelectedYear(e.target.value);
  };

  const fetchActivities = async () => {
    setLoading(true);
    setError(null);
    setFromCache(false);
    
    try {
      // Сначала проверяем кэш
      const cachedActivities = cacheUtils.get(CACHE_KEYS.ACTIVITIES);
      if (cachedActivities && cachedActivities.length > 0) {
        setActivities(cachedActivities);
        setFromCache(true);
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/activities');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        setError('Слишком много запросов. Попробуйте позже.');
        setLoading(false);
        return;
      }
      
      if (!res.ok) throw new Error('Network error');
      
      const data = await res.json();
      if (data && data.error) throw new Error(data.message || 'Ошибка Strava');
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(CACHE_KEYS.ACTIVITIES, data, 30 * 60 * 1000);
      
      setActivities(data);
      setFromCache(false);
    } catch (e) {
      console.error('Error fetching activities:', e);
      setError('Ошибка загрузки данных Strava');
    } finally {
      setLoading(false);
    }
  };

  const fetchHeroImage = async () => {
    try {
      const imageFilename = await heroImagesUtils.getHeroImage('trainings');
      if (imageFilename) {
        setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
      }
    } catch (error) {
      console.error('Error loading hero image:', error);
    }
  };

  // Получаем аналитику с сервера (по выбранному году)
  useEffect(() => {
    const fetchAnalytics = async () => {
      setAnalyticsLoading(true);
      try {
        const url = selectedYear === 'all' ? '/api/analytics/summary?year=all' : `/api/analytics/summary?year=${selectedYear}`;
        const res = await apiFetch(url);
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data.summary);
        }
      } finally {
        setAnalyticsLoading(false);
      }
    };
    fetchAnalytics();
  }, [selectedYear]);

  useEffect(() => {
    // Попробуем получить тренировки сразу (если уже авторизованы)
    fetchActivities();
    fetchHeroImage();
  }, []);

  useEffect(() => {
    if (aiModalOpen) {
      setTimeout(() => setAiModalVisible(true), 10);
      document.body.style.overflow = 'hidden';
    } else {
      setAiModalVisible(false);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [aiModalOpen]);

  return (
    <div className="main main-relative">
      <div id="trainings-hero-banner" className="plan-hero hero-banner" style={{ backgroundImage: heroImage ? `url(${heroImage})` : 'none' }}>
        <h1 className="hero-title">
          Тренировки Strava
          <select 
            value={selectedYear} 
            onChange={handleYearChange}
            className="year-selector"
          >
            <option value="all">Все годы</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </h1>
        <div className="plan-hero-cards">
          <div className="total-card">
            <div className="total-label">Всего пройдено</div>
            <span className="metric-value"><span className="big-number">{analytics?.totalKm ?? 0}</span><span className="unit">км</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Набор высоты</div>
            <span className="metric-value"><span className="big-number">{analytics?.totalElev ?? 0}</span><span className="unit">м</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Время в движении</div>
            <span className="metric-value"><span className="big-number">{analytics?.totalMovingHours ?? 0}</span><span className="unit">ч</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Средняя скорость</div>
            <span className="metric-value"><span className="big-number">{analytics?.avgSpeed ?? 0}</span><span className="unit">км/ч</span></span>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={handleStravaLogin}>Получить данные</button>
          <button onClick={downloadJSON} className="export-btn" style={{ display: filteredActivities.length ? '' : 'none' }}>Выгрузить JSON</button>
        </div>
        {fromCache && (
          <div className="cache-indicator">Используются кэшированные данные</div>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="trainings-content">
        {loading && <div className="content-loader"><div></div></div>}
        <div className="filters">
        <span className="filters-title">Фильтры</span>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          title="Свернуть/развернуть фильтры" 
          className="filters-toggle"
        >
          {showFilters ? '▼' : '▲'}
        </button>
        <div className="filters-fields" style={{ display: showFilters ? 'flex' : 'none' }}>
          <div>
            <label>Поиск по названию<br />
              <input 
                type="text" 
                value={filters.name}
                onChange={(e) => setFilters({...filters, name: e.target.value})}
                placeholder="Название..." 
                style={{ width: 160 }} 
              />
            </label>
          </div>
          <div>
            <label>Дата от<br />
              <input 
                type="date" 
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
              />
            </label>
          </div>
          <div>
            <label>Дата до<br />
              <input 
                type="date" 
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
              />
            </label>
          </div>
          <div>
            <label>Тип<br />
              <select 
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                style={{ width: 120 }}
              >
                <option value="">Все</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div>
            <label>Дистанция (км)<br />
              <input 
                type="number" 
                value={filters.distMin}
                onChange={(e) => setFilters({...filters, distMin: e.target.value})}
                placeholder="от" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.distMax}
                onChange={(e) => setFilters({...filters, distMax: e.target.value})}
                placeholder="до" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div>
            <label>Ср. скорость (км/ч)<br />
              <input 
                type="number" 
                value={filters.speedMin}
                onChange={(e) => setFilters({...filters, speedMin: e.target.value})}
                placeholder="от" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.speedMax}
                onChange={(e) => setFilters({...filters, speedMax: e.target.value})}
                placeholder="до" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div>
            <label>Ср. пульс<br />
              <input 
                type="number" 
                value={filters.hrMin}
                onChange={(e) => setFilters({...filters, hrMin: e.target.value})}
                placeholder="от" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.hrMax}
                onChange={(e) => setFilters({...filters, hrMax: e.target.value})}
                placeholder="до" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div>
            <label>Набор высоты (м)<br />
              <input 
                type="number" 
                value={filters.elevMin}
                onChange={(e) => setFilters({...filters, elevMin: e.target.value})}
                placeholder="от" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.elevMax}
                onChange={(e) => setFilters({...filters, elevMax: e.target.value})}
                placeholder="до" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div className="filters-reset">
            <button 
              onClick={resetFilters}
              className="reset-btn"
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      </div>
      <div className="activities">
        {!loading && !error && filteredActivities.length === 0 && <p className="no-activities">Нет тренировок</p>}
        {!loading && !error && filteredActivities.length > 0 && (
          <div className="activities-grid">
            {filteredActivities.map((a, idx) => (
              <div className="activity" key={a.id || idx}>
                <div className="activity-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div className="activity-title">{a.name || 'Без названия'}</div>
                    <div className="activity-date">{a.start_date ? new Date(a.start_date).toLocaleString() : ''}</div>
                  </div>
                  <div className="activity-actions">
                    <button 
                      onClick={() => showActivityModal(a)}
                      title="Анализ" 
                      className="activity-btn analysis-btn"
                    >
                      Анализ
                    </button>
                    <button
                      onClick={async () => {
                        setSelectedActivity(a); // Устанавливаем выбранную тренировку для заголовка
                        setAiModalOpen(true);
                        setAiAnalysis('');
                        setAiError(null);
                        setAiLoading(true);
                        // Преобразуем значения в привычные единицы
                        const summary = {
                          name: a.name,
                          distance_km: a.distance ? +(a.distance / 1000).toFixed(2) : undefined,
                          moving_time_min: a.moving_time ? +(a.moving_time / 60).toFixed(1) : undefined,
                          elapsed_time_min: a.elapsed_time ? +(a.elapsed_time / 60).toFixed(1) : undefined,
                          average_speed_kmh: a.average_speed ? +(a.average_speed * 3.6).toFixed(2) : undefined,
                          max_speed_kmh: a.max_speed ? +(a.max_speed * 3.6).toFixed(2) : undefined,
                          average_cadence: a.average_cadence,
                          average_temp: a.average_temp,
                          average_heartrate: a.average_heartrate,
                          max_heartrate: a.max_heartrate,
                          total_elevation_gain_m: a.total_elevation_gain,
                          max_elevation_m: a.elev_high,
                          date: a.start_date
                        };
                        try {
                          const res = await apiFetch('/api/ai-analysis', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ summary })
                          });
                          const data = await res.json();
                          if (data.analysis) setAiAnalysis(data.analysis);
                          else setAiError('Нет ответа от ИИ');
                        } catch (e) {
                          setAiError('Ошибка запроса к ИИ');
                        } finally {
                          setAiLoading(false);
                        }
                      }}
                      title="ИИ-анализ"
                      className="activity-btn ai-btn"
                    >
                      ИИ-анализ
                    </button>
                  </div>
                </div>
                <table className="activity-table">
                  <tbody>
                    <tr><td>Дистанция</td><td>{a.distance ? (a.distance / 1000).toFixed(2) : '-'}</td><td>км</td></tr>
                    <tr><td>Время в движении</td><td>{a.moving_time ? (a.moving_time / 60).toFixed(1) : '-'}</td><td>мин</td></tr>
                    <tr><td>Общее время</td><td>{a.elapsed_time ? (a.elapsed_time / 60).toFixed(1) : '-'}</td><td>мин</td></tr>
                    <tr><td>Набор высоты</td><td>{a.total_elevation_gain ?? '-'}</td><td>м</td></tr>
                    <tr><td>Средняя скорость</td><td>{a.average_speed ? (a.average_speed * 3.6).toFixed(2) : '-'}</td><td>км/ч</td></tr>
                    <tr><td>Максимальная скорость</td><td>{a.max_speed ? (a.max_speed * 3.6).toFixed(2) : '-'}</td><td>км/ч</td></tr>
                    <tr><td>Средний каденс</td><td>{a.average_cadence ?? '-'}</td><td>об/мин</td></tr>
                    <tr><td>Средняя температура</td><td>{a.average_temp ?? '-'}</td><td>°C</td></tr>
                    <tr><td>Средний пульс</td><td>{a.average_heartrate ?? '-'}</td><td>уд/мин</td></tr>
                    <tr><td>Максимальный пульс</td><td>{a.max_heartrate ?? '-'}</td><td>уд/мин</td></tr>
                    <tr><td>Макс. высота</td><td>{a.elev_high ?? '-'}</td><td>м</td></tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      <div className="analytics-summary">
        {analyticsLoading ? (
          <div style={{ color: '#274DD3', fontSize: '1.1em', opacity: 0.7 }}>Загрузка аналитики...</div>
        ) : analytics ? (
          <div className="analytics-cards">
            <div className="analytics-card">
              <span className="big-number">{analytics.totalRides}</span>
              <span className="stat-label">Тренировок</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.totalKm}</span>
              <span className="stat-label">км</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.totalTimeH}</span>
              <span className="stat-label">часов</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.totalCalories}</span>
              <span className="stat-label">ккал</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.longRides}</span>
              <span className="stat-label">Длинные</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.intervalRides}</span>
              <span className="stat-label">Интервальные</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.vo2max ?? '—'}</span>
              <span className="stat-label">VO₂max</span>
            </div>
          </div>
        ) : (
          <div style={{ color: '#274DD3', fontSize: '1.1em', opacity: 0.7 }}>Нет данных</div>
        )}
      </div>
      {/* Модалка анализа тренировки */}
      {showModal && selectedActivity && (
        <div className="modal">
          <div className="modal-content">
            <button 
              onClick={() => setShowModal(false)}
              className="modal-close"
            >
              ×
            </button>
            <div className="activity-analysis-modal-body">
              <h3>Анализ тренировки</h3>
              <div className="activity-summary">
                <p><strong>Дистанция:</strong> {selectedActivity.distance ? (selectedActivity.distance / 1000).toFixed(1) : '-'} км</p>
                <p><strong>Время:</strong> {selectedActivity.moving_time ? Math.round(selectedActivity.moving_time / 60) : '-'} мин</p>
                <p><strong>Средняя скорость:</strong> {selectedActivity.average_speed ? (selectedActivity.average_speed * 3.6).toFixed(1) : '-'} км/ч</p>
                <p><strong>Макс. скорость:</strong> {selectedActivity.max_speed ? (selectedActivity.max_speed * 3.6).toFixed(1) : '-'} км/ч</p>
                <p><strong>Набор высоты:</strong> {selectedActivity.total_elevation_gain ? Math.round(selectedActivity.total_elevation_gain) : '-'} м</p>
                <p><strong>Средний пульс:</strong> {selectedActivity.average_heartrate ? Math.round(selectedActivity.average_heartrate) : '-'} уд/мин</p>
                <p><strong>Макс. пульс:</strong> {selectedActivity.max_heartrate ? Math.round(selectedActivity.max_heartrate) : '-'} уд/мин</p>
                <p><strong>Каденс:</strong> {selectedActivity.average_cadence ? Math.round(selectedActivity.average_cadence) : '-'} об/мин</p>
                <p><strong>Тип:</strong> {analysisLoading ? 'Загрузка...' : analysisError ? 'Ошибка' : activityAnalysis?.type ?? '-'}</p>
              </div>
              <hr />
              <div className="recommendations">
                <h4>Рекомендации</h4>
                {analysisLoading && <div>Загрузка...</div>}
                {analysisError && <div style={{color: 'red'}}>{analysisError}</div>}
                {!analysisLoading && !analysisError && activityAnalysis && (
                  <ul>
                    {activityAnalysis.recommendations.map((rec, index) => (
                      <li key={index}>
                        <strong>{rec.title}</strong><br />
                        {rec.advice}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Модалка ИИ-анализа */}
      {aiModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100%',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          overflow: 'scroll',
          transition: 'background 0.2s',
          opacity: aiModalVisible ? 1 : 0,
          transform: aiModalVisible ? 'scale(1)' : 'scale(0.98)',
          pointerEvents: aiModalVisible ? 'auto' : 'none',
          transitionProperty: 'opacity, transform, background',
          transitionDuration: '0.35s',
          transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
        }}>
          <div style={{
           
          
           
            padding: '2.5em 2em 2em 2em',
            
            width: '768px',
            minHeight: 320,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: '1.13em',
            fontWeight: 400,
            color: '#000',
            letterSpacing: '-0.01em',
            lineHeight: 1.6,
            overflowY: 'auto',
          }}>
            <button onClick={() => setAiModalOpen(false)} style={{
              position: 'absolute',
              top: 18,
              right: 0,
              fontSize: '2.2em',
              background: 'none',
              border: 'none',
              color: '#000',
              opacity:0.5,
              cursor: 'pointer',
              zIndex: 10,
              lineHeight: 1,
              padding: 0,
              transition: 'color 0.2s',
            }} title="Закрыть">×</button>
            <div className="activity-analysis-modal-body" style={{ width: '100%' }}>
              <h3 style={{ fontWeight: 800, color:'#000', border: 'none', fontSize: '2.5em', margin: '0 0 1.2em 0', letterSpacing: '-1px', textAlign: 'left' }}>
                {selectedActivity?.name ? selectedActivity.name : 'ИИ-анализ тренировки'}
              </h3>
              {aiLoading && <div style={{ color: '#274DD3', fontSize: '1.1em', textAlign: 'center' }}>Загрузка...</div>}
              {aiError && <div style={{color: 'red', textAlign: 'center'}}>{aiError}</div>}
              {!aiLoading && !aiError && aiAnalysis && (
                <div style={{whiteSpace: 'pre-line', fontSize: '1.13em', color: '#000', marginTop: 12}}>{aiAnalysis}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 