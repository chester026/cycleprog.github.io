import React, { useState, useEffect } from 'react';
import './TrainingsPage.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';
import defaultHeroImage from '../assets/img/hero/2_anal.webp';

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

  // Strava OAuth constants
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
      distance: { label: 'Distance', unit: 'km' },
      moving_time: { label: 'Moving time', unit: 'min' },
      elapsed_time: { label: 'Elapsed time', unit: 'min' },
      total_elevation_gain: { label: 'Elevation gain', unit: 'm' },
      average_speed: { label: 'Average speed', unit: 'km/h' },
      max_speed: { label: 'Max speed', unit: 'km/h' },
      average_cadence: { label: 'Average cadence', unit: 'rpm' },
      average_temp: { label: 'Average temperature', unit: '°C' },
      average_heartrate: { label: 'Average heartrate', unit: 'bpm' },
      max_heartrate: { label: 'Max heartrate', unit: 'bpm' },
      elev_high: { label: 'Max elevation', unit: 'm' }
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
    activityData.name = activity.name || 'No name';
    
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
      if (!res.ok) throw new Error('Error analyzing activity');
      const data = await res.json();
      setActivityAnalysis(data);
    } catch (e) {
      setAnalysisError('Error analyzing activity');
    } finally {
      setAnalysisLoading(false);
    }
    setShowModal(true);
  };

  // Функция для анализа тренировки и генерации рекомендаций
  // Функция для расчета мощности по формулам Strava
  const calculatePower = (activity) => {
    if (!activity || !activity.distance || !activity.moving_time || !activity.total_elevation_gain) {
      return null;
    }

    const totalWeight = 75 + 8; // вес райдера + велосипеда (кг)
    const distance = parseFloat(activity.distance) || 0; // метры
    const time = parseFloat(activity.moving_time) || 0; // секунды
    const elevationGain = parseFloat(activity.total_elevation_gain) || 0; // метры
    const averageSpeed = parseFloat(activity.average_speed) || 0; // м/с

    if (distance <= 0 || time <= 0 || averageSpeed <= 0) {
      return null;
    }

    // Константы для расчетов
    const GRAVITY = 9.81; // м/с²
    const AIR_DENSITY_SEA_LEVEL = 1.225; // кг/м³ (стандартная плотность воздуха на уровне моря)
    const CD_A = 0.4; // аэродинамический профиль
    const CRR = 0.005; // коэффициент сопротивления качению (асфальт)

    // Функция для расчета плотности воздуха с учетом температуры и высоты
    const calculateAirDensity = (temperature, elevation) => {
      // Температура в Кельвинах (если передана в Цельсиях)
      const tempK = temperature ? temperature + 273.15 : 288.15; // 15°C по умолчанию
      
      // Высота над уровнем моря в метрах
      const heightM = elevation || 0;
      
      // Формула для расчета плотности воздуха с учетом температуры и высоты
      // Атмосферное давление на высоте (барометрическая формула)
      const pressureAtHeight = 101325 * Math.exp(-heightM / 7400); // Па
      
      // Плотность воздуха = давление / (R * температура)
      // R = 287.05 Дж/(кг·К) - газовая постоянная для воздуха
      const R = 287.05;
      const density = pressureAtHeight / (R * tempK);
      
      return density;
    };

    // Получаем данные о температуре и высоте
    const temperature = activity.average_temp; // °C
    const maxElevation = activity.elev_high; // максимальная высота в метрах
    
    // Рассчитываем плотность воздуха с учетом температуры и высоты
    const airDensity = calculateAirDensity(temperature, maxElevation);

    // Средний уклон
    const averageGrade = elevationGain / distance;

    // Гравитационная сила
    let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;

    // Сопротивление качению
    const rollingPower = CRR * totalWeight * GRAVITY * averageSpeed;

    // Аэродинамическое сопротивление
    const aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);

    // Общая мощность
    let totalPower = rollingPower + aeroPower;

    if (averageGrade > 0) {
      totalPower += gravityPower;
    } else {
      totalPower += gravityPower;
      const minPowerOnDescent = 20;
      totalPower = Math.max(minPowerOnDescent, totalPower);
    }

    if (isNaN(totalPower) || totalPower < 0 || totalPower > 10000) {
      return null;
    }

    return {
      total: Math.round(totalPower),
      gravity: Math.round(gravityPower),
      rolling: Math.round(rollingPower),
      aero: Math.round(aeroPower),
      grade: (averageGrade * 100).toFixed(1)
    };
  };

  const analyzeActivity = (activity) => {
    // Определяем тип тренировки
    let type = 'Regular';
    if (activity.distance && activity.distance/1000 > 60) type = 'Long';
    else if (activity.average_speed && activity.average_speed*3.6 < 20 && activity.moving_time && activity.moving_time/60 < 60) type = 'Recovery';
    else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Mountain';
    else if ((activity.name||'').toLowerCase().includes('interval') || (activity.type||'').toLowerCase().includes('interval')) type = 'Interval';
    
    // Генерируем рекомендации
    const recommendations = [];
    
    if (activity.average_speed && activity.average_speed*3.6 < 25) {
      recommendations.push({
        title: 'Average speed below 25 km/h',
        advice: 'To improve speed, include interval training (e.g., 4×4 min with 4 min rest, Z4-Z5), work on pedal technique (cadence 90–100), pay attention to your body position on the bike, and aerodynamics.'
      });
    }
    
    if (activity.average_heartrate && activity.average_heartrate > 155) {
      recommendations.push({
        title: 'Heart rate above 155 bpm',
        advice: 'This may indicate high intensity or insufficient recovery. Check your sleep quality, stress level, add recovery training, pay attention to hydration and nutrition.'
      });
    }
    
    if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed*3.6 < 18) {
      recommendations.push({
        title: 'Mountain training with low speed',
        advice: 'To improve results, add strength training off the bike and intervals in ascents (e.g., 5×5 min in Z4).'
      });
    }
    
    if (!activity.average_heartrate) {
      recommendations.push({
        title: 'No heart rate data',
        advice: 'Add a heart rate monitor for more accurate intensity control and recovery.'
      });
    }
    
    if (!activity.distance || activity.distance/1000 < 30) {
      recommendations.push({
        title: 'Short distance',
        advice: 'To develop endurance, plan at least one long ride (60+ km) per week. Gradually increase the distance, remembering to eat and hydrate on the road.'
      });
    }
    
    if (type === 'Recovery') {
      recommendations.push({
        title: 'Recovery training',
        advice: 'Great! Don\'t forget to alternate such training with intervals and long rides for progress.'
      });
    }
    
    if (type === 'Interval' && activity.average_heartrate && activity.average_heartrate < 140) {
      recommendations.push({
        title: 'Interval training with low heart rate',
        advice: 'Intervals should be performed with greater intensity (Z4-Z5) to get the maximum training effect.'
      });
    }
    
    if (!activity.average_cadence) {
      recommendations.push({
        title: 'No cadence data',
        advice: 'Using a cadence sensor will help track pedal technique and avoid excessive fatigue.'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Great training!',
        advice: 'Training completed perfectly! Continue in the same spirit and gradually increase the load for further progress.'
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

  const fetchActivities = async () => {
    setLoading(true);
    setError(null);
    setFromCache(false);
    const userId = getUserId();
    const cacheKey = userId ? `activities_${userId}` : CACHE_KEYS.ACTIVITIES;
    try {
      // Сначала проверяем кэш
      const cachedActivities = cacheUtils.get(cacheKey);
      if (cachedActivities && cachedActivities.length > 0) {
        setActivities(cachedActivities);
        setFromCache(true);
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/activities');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        setError('Too many requests. Please try again later.');
        setLoading(false);
        return;
      }
      
      if (!res.ok) throw new Error('Network error');
      
      const data = await res.json();
      if (data && data.error) throw new Error(data.message || 'Strava error');
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(cacheKey, data, 30 * 60 * 1000);
      
      setActivities(data);
      setFromCache(false);
    } catch (e) {
      console.error('Error fetching activities:', e);
      setError('Error loading Strava data');
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
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    let userId = null, stravaId = null;
    try {
      const decoded = jwtDecode(token);
      userId = decoded.userId;
      stravaId = decoded.strava_id;
    } catch {}
    if (userId && !stravaId) {
      localStorage.removeItem(`cycleprog_cache_activities_${userId}`);
      setActivities([]);
      setAnalytics(null);
    }
    fetchActivities();
    fetchHeroImage();
  }, [localStorage.getItem('token')]);

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
              <div id="trainings-hero-banner" className="plan-hero hero-banner" style={{ backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})` }}>
        <h1 className="hero-title">
          Strava Trainings
          <select 
            value={selectedYear} 
            onChange={handleYearChange}
            className="year-selector"
          >
            <option value="all">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </h1>
        <div className="plan-hero-cards">
          <div className="total-card">
            <div className="total-label">Total Distance</div>
            <span className="metric-value"><span className="big-number">{analytics?.totalKm ?? 0}</span><span className="unit">km</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Elevation Gain</div>
            <span className="metric-value"><span className="big-number">{analytics?.totalElev ?? 0}</span><span className="unit">m</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Moving Time</div>
            <span className="metric-value"><span className="big-number">{analytics?.totalMovingHours ?? 0}</span><span className="unit">h</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Average Speed</div>
            <span className="metric-value"><span className="big-number">{analytics?.avgSpeed ?? 0}</span><span className="unit">km/h</span></span>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={handleStravaLogin}>Get Data</button>
          <button onClick={downloadJSON} className="export-btn" style={{ display: filteredActivities.length ? '' : 'none' }}>Export JSON</button>
        </div>
        {fromCache && (
          <div className="cache-indicator">Using cached data</div>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="trainings-content">
        {loading && <div className="content-loader"><div></div></div>}
        <div className="filters">
        <span className="filters-title">Filters</span>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          title="Collapse/Expand filters" 
          className="filters-toggle"
        >
          {showFilters ? '▼' : '▲'}
        </button>
        <div className="filters-fields" style={{ display: showFilters ? 'flex' : 'none' }}>
          <div>
            <label>Search by name<br />
              <input 
                type="text" 
                value={filters.name}
                onChange={(e) => setFilters({...filters, name: e.target.value})}
                placeholder="Name..." 
                style={{ width: 160 }} 
              />
            </label>
          </div>
          <div>
            <label>From date<br />
              <input 
                type="date" 
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
              />
            </label>
          </div>
          <div>
            <label>To date<br />
              <input 
                type="date" 
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
              />
            </label>
          </div>
          <div>
            <label>Type<br />
              <select 
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                style={{ width: 120 }}
              >
                <option value="">All</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div>
            <label>Distance (km)<br />
              <input 
                type="number" 
                value={filters.distMin}
                onChange={(e) => setFilters({...filters, distMin: e.target.value})}
                placeholder="from" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.distMax}
                onChange={(e) => setFilters({...filters, distMax: e.target.value})}
                placeholder="to" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div>
            <label>Average speed (km/h)<br />
              <input 
                type="number" 
                value={filters.speedMin}
                onChange={(e) => setFilters({...filters, speedMin: e.target.value})}
                placeholder="from" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.speedMax}
                onChange={(e) => setFilters({...filters, speedMax: e.target.value})}
                placeholder="to" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div>
            <label>Average heartrate<br />
              <input 
                type="number" 
                value={filters.hrMin}
                onChange={(e) => setFilters({...filters, hrMin: e.target.value})}
                placeholder="from" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.hrMax}
                onChange={(e) => setFilters({...filters, hrMax: e.target.value})}
                placeholder="to" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div>
            <label>Elevation gain (m)<br />
              <input 
                type="number" 
                value={filters.elevMin}
                onChange={(e) => setFilters({...filters, elevMin: e.target.value})}
                placeholder="from" 
                style={{ width: 60 }} 
              /> – 
              <input 
                type="number" 
                value={filters.elevMax}
                onChange={(e) => setFilters({...filters, elevMax: e.target.value})}
                placeholder="to" 
                style={{ width: 60 }} 
              />
            </label>
          </div>
          <div className="filters-reset">
            <button 
              onClick={resetFilters}
              className="reset-btn"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>
      <div className="activities">
        {!loading && !error && filteredActivities.length === 0 && <p className="no-activities">No trainings</p>}
        {!loading && !error && filteredActivities.length > 0 && (
          <div className="activities-grid">
            {filteredActivities.map((a, idx) => (
              <div className="activity" key={a.id || idx}>
                <div className="activity-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div className="activity-title">{a.name || 'No name'}</div>
                    <div className="activity-date">{a.start_date ? new Date(a.start_date).toLocaleString() : ''}</div>
                  </div>
                  <div className="activity-actions">
                    <button 
                      onClick={() => showActivityModal(a)}
                      title="Analysis" 
                      className="activity-btn analysis-btn"
                    >
                      Analysis
                    </button>
                    <button 
                      onClick={async () => {
                        setSelectedActivity(a); // Устанавливаем выбранную тренировку для заголовка
                        setAiModalOpen(true);
                        setAiAnalysis('');
                        setAiError(null);
                        setAiLoading(true);
                        // Преобразуем значения в привычные единицы
                        const powerData = calculatePower(a);
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
                          date: a.start_date,
                          // Данные о мощности
                          estimated_power_w: powerData ? powerData.total : undefined,
                          gravity_power_w: powerData ? powerData.gravity : undefined,
                          rolling_resistance_w: powerData ? powerData.rolling : undefined,
                          aerodynamic_power_w: powerData ? powerData.aero : undefined,
                          average_grade_percent: powerData ? powerData.grade : undefined,
                          // Реальные данные мощности (если есть)
                          real_average_power_w: a.average_watts,
                          real_max_power_w: a.max_watts
                        };
                        try {
                          const res = await apiFetch('/api/ai-analysis', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ summary })
                          });
                          const data = await res.json();
                          if (data.analysis) setAiAnalysis(data.analysis);
                          else setAiError('No response from AI');
                        } catch (e) {
                          setAiError('Error requesting AI');
                        } finally {
                          setAiLoading(false);
                        }
                      }}
                      title="AI Analysis"
                      className="activity-btn ai-btn"
                    >
                      AI Analysis
                    </button>
                  </div>
                </div>
                <table className="activity-table">
                  <tbody>
                    <tr><td>Distance</td><td>{a.distance ? (a.distance / 1000).toFixed(2) : '-'}</td><td>km</td></tr>
                    <tr><td>Moving time</td><td>{a.moving_time ? (a.moving_time / 60).toFixed(1) : '-'}</td><td>min</td></tr>
                    <tr><td>Elapsed time</td><td>{a.elapsed_time ? (a.elapsed_time / 60).toFixed(1) : '-'}</td><td>min</td></tr>
                    <tr><td>Elevation gain</td><td>{a.total_elevation_gain ?? '-'}</td><td>m</td></tr>
                    <tr><td>Average speed</td><td>{a.average_speed ? (a.average_speed * 3.6).toFixed(2) : '-'}</td><td>km/h</td></tr>
                    <tr><td>Max speed</td><td>{a.max_speed ? (a.max_speed * 3.6).toFixed(2) : '-'}</td><td>km/h</td></tr>
                    <tr><td>Average cadence</td><td>{a.average_cadence ?? '-'}</td><td>rpm</td></tr>
                    <tr><td>Average temperature</td><td>{a.average_temp ?? '-'}</td><td>°C</td></tr>
                    <tr><td>Average heartrate</td><td>{a.average_heartrate ?? '-'}</td><td>bpm</td></tr>
                    <tr><td>Max heartrate</td><td>{a.max_heartrate ?? '-'}</td><td>bpm</td></tr>
                    <tr><td>Max elevation</td><td>{a.elev_high ?? '-'}</td><td>m</td></tr>
                    <tr><td>Estimated power</td><td>{calculatePower(a)?.total ?? '-'}</td><td>W</td></tr>
                    <tr><td>Real avg power</td><td>{a.average_watts ?? '-'}</td><td>W</td></tr>
                    <tr><td>Real max power</td><td>{a.max_watts ?? '-'}</td><td>W</td></tr>
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
          <div style={{ color: '#274DD3', fontSize: '1.1em', opacity: 0.7 }}>Loading analytics...</div>
        ) : analytics ? (
          <div className="analytics-cards">
            <div className="analytics-card">
              <span className="big-number">{analytics.totalRides}</span>
              <span className="stat-label">Trainings</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.totalKm}</span>
              <span className="stat-label">km</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.totalTimeH}</span>
              <span className="stat-label">hours</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.totalCalories}</span>
              <span className="stat-label">kcal</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.longRides}</span>
              <span className="stat-label">Long</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.intervalRides}</span>
              <span className="stat-label">Intervals</span>
            </div>
            <div className="analytics-card">
              <span className="big-number">{analytics.vo2max ?? '—'}</span>
              <span className="stat-label">VO₂max</span>
            </div>
          </div>
        ) : (
          <div style={{ color: '#274DD3', fontSize: '1.1em', opacity: 0.7 }}>No data</div>
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
              <h3>Activity Analysis</h3>
              <div className="activity-summary">
                <p><strong>Distance:</strong> {selectedActivity.distance ? (selectedActivity.distance / 1000).toFixed(1) : '-'} km</p>
                <p><strong>Time:</strong> {selectedActivity.moving_time ? Math.round(selectedActivity.moving_time / 60) : '-'} min</p>
                <p><strong>Average speed:</strong> {selectedActivity.average_speed ? (selectedActivity.average_speed * 3.6).toFixed(1) : '-'} km/h</p>
                <p><strong>Max speed:</strong> {selectedActivity.max_speed ? (selectedActivity.max_speed * 3.6).toFixed(1) : '-'} km/h</p>
                <p><strong>Elevation gain:</strong> {selectedActivity.total_elevation_gain ? Math.round(selectedActivity.total_elevation_gain) : '-'} m</p>
                <p><strong>Average heartrate:</strong> {selectedActivity.average_heartrate ? Math.round(selectedActivity.average_heartrate) : '-'} bpm</p>
                <p><strong>Max heartrate:</strong> {selectedActivity.max_heartrate ? Math.round(selectedActivity.max_heartrate) : '-'} bpm</p>
                <p><strong>Cadence:</strong> {selectedActivity.average_cadence ? Math.round(selectedActivity.average_cadence) : '-'} rpm</p>
                <p><strong>Type:</strong> {analysisLoading ? 'Loading...' : analysisError ? 'Error' : activityAnalysis?.type ?? '-'}</p>
              </div>
              <hr />
              <div className="recommendations">
                <h4>Recommendations</h4>
                {analysisLoading && <div>Loading...</div>}
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
            }} title="Close">×</button>
            <div className="activity-analysis-modal-body" style={{ width: '100%' }}>
              <h3 style={{ fontWeight: 800, color:'#000', border: 'none', fontSize: '2.5em', margin: '0 0 1.2em 0', letterSpacing: '-1px', textAlign: 'left' }}>
                {selectedActivity?.name ? selectedActivity.name : 'AI Activity Analysis'}
              </h3>
              {aiLoading && <div style={{ color: '#274DD3', fontSize: '1.1em', textAlign: 'center' }}>Loading...</div>}
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