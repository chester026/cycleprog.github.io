import { useState, useEffect } from 'react';
import './TrainingsPage.css';

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

  // Статистика по отфильтрованным данным
  const totalMeters = filteredActivities.reduce((sum, act) => sum + (act.distance || 0), 0);
  const totalKm = (totalMeters / 1000).toFixed(1);
  const totalElev = filteredActivities.reduce((sum, act) => sum + (act.total_elevation_gain || 0), 0);
  const totalMovingSec = filteredActivities.reduce((sum, act) => sum + (act.moving_time || 0), 0);
  const totalMovingHours = (totalMovingSec / 3600).toFixed(1);
  let avgSpeed = '—';
  if (totalMovingSec > 0) {
    avgSpeed = ((totalMeters / 1000) / (totalMovingSec / 3600)).toFixed(1);
  }

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

  const showActivityModal = (activity) => {
    setSelectedActivity(activity);
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
      const res = await fetch('/activities');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      if (data && data.error) throw new Error(data.message || 'Ошибка Strava');
      localStorage.setItem('activities', JSON.stringify(data));
      setActivities(data);
      setFromCache(false);
    } catch (e) {
      // Если ошибка — пробуем взять из localStorage
      const cached = localStorage.getItem('activities');
      if (cached) {
        setActivities(JSON.parse(cached));
        setFromCache(true);
      } else {
        setError('Ошибка загрузки данных Strava');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Попробуем получить тренировки сразу (если уже авторизованы)
    fetchActivities();
  }, []);

  return (
    <div className="main main-relative">
      <div id="trainings-hero-banner" className="plan-hero">
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
            <span className="metric-value"><span className="big-number">{totalKm}</span><span className="unit">км</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Набор высоты</div>
            <span className="metric-value"><span className="big-number">{Math.round(totalElev)}</span><span className="unit">м</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Время в движении</div>
            <span className="metric-value"><span className="big-number">{totalMovingHours}</span><span className="unit">ч</span></span>
          </div>
          <div className="total-card">
            <div className="total-label">Средняя скорость</div>
            <span className="metric-value"><span className="big-number">{avgSpeed}</span><span className="unit">км/ч</span></span>
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
                <div className="activity-actions">
                  <button 
                    onClick={() => showActivityModal(a)}
                    title="Анализ" 
                    className="activity-btn analysis-btn"
                  >
                    <span>🔍</span>
                  </button>
                  <button 
                    onClick={(e) => copyActivityData(a, e.target)}
                    title="Скопировать JSON" 
                    className="activity-btn copy-btn"
                  >
                    📋
                  </button>
                </div>
                <div className="activity-title">{a.name || 'Без названия'}</div>
                <div className="activity-date">{a.start_date ? new Date(a.start_date).toLocaleString() : ''}</div>
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
                <p><strong>Тип:</strong> {analyzeActivity(selectedActivity).type}</p>
              </div>
              
              <hr />
              <div className="recommendations">
                <h4>Рекомендации</h4>
                <ul>
                  {analyzeActivity(selectedActivity).recommendations.map((rec, index) => (
                    <li key={index}>
                      <strong>{rec.title}</strong><br />
                      {rec.advice}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 