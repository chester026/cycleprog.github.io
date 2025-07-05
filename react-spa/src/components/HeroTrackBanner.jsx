import React, { useEffect, useState, useRef } from 'react';
import './HeroTrackBanner.css';
import { MapContainer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import polyline from '@mapbox/polyline';

// Компонент для автоматического масштабирования карты
function MapBounds({ positions }) {
  const map = useMap();
  
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [18, 18] });
    }
  }, [positions, map]);
  
  return null;
}

function AnalysisModal({ open, onClose, lastRide }) {
  if (!open) return null;
  if (!lastRide) return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={e => e.stopPropagation()}>
        <h2>Анализ</h2>
        <div style={{color:'#888'}}>Нет данных для анализа</div>
        <button className="modal-close-btn" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );

  // Определяем тип тренировки
  let type = 'Обычная';
  if (lastRide.distance && lastRide.distance/1000 > 60) type = 'Длинная';
  else if (lastRide.average_speed && lastRide.average_speed*3.6 < 20 && lastRide.moving_time && lastRide.moving_time/60 < 60) type = 'Восстановительная';
  else if (lastRide.total_elevation_gain && lastRide.total_elevation_gain > 800) type = 'Горная';
  else if ((lastRide.name||'').toLowerCase().includes('интервал') || (lastRide.type||'').toLowerCase().includes('interval')) type = 'Интервальная';

  // Генерируем советы
  const generateAdvice = () => {
    const advice = [];
    if (lastRide.average_speed && lastRide.average_speed*3.6 < 25) {
      advice.push('Средняя скорость ниже 25 км/ч. Для повышения скорости включайте интервальные тренировки (например, 4×4 мин в Z4-Z5 с отдыхом 4 мин), работайте над техникой педалирования (каденс 90–100), следите за положением тела на велосипеде и аэродинамикой.');
    }
    if (lastRide.average_heartrate && lastRide.average_heartrate > 155) {
      advice.push('Пульс выше 155 уд/мин. Это может быть признаком высокой интенсивности или недостаточного восстановления. Проверьте качество сна, уровень стресса, добавьте восстановительные тренировки, следите за гидратацией и питанием.');
    }
    if (lastRide.total_elevation_gain && lastRide.total_elevation_gain > 500 && lastRide.average_speed*3.6 < 18) {
      advice.push('Горная тренировка с низкой скоростью. Для улучшения результатов добавьте силовые тренировки вне велосипеда и интервалы в подъёмы (например, 5×5 мин в Z4).');
    }
    if (!lastRide.average_heartrate) {
      advice.push('Нет данных по пульсу. Добавьте датчик пульса для более точного контроля интенсивности и восстановления.');
    }
    if (!lastRide.distance || lastRide.distance/1000 < 30) {
      advice.push('Короткая дистанция. Для развития выносливости планируйте хотя бы одну длинную поездку (60+ км) в неделю. Постепенно увеличивайте дистанцию, не забывая про питание и гидратацию в пути.');
    }
    if (type === 'Восстановительная') {
      advice.push('Восстановительная тренировка. Отлично! Не забывайте чередовать такие тренировки с интервальными и длинными для прогресса.');
    }
    if (type === 'Интервальная' && lastRide.average_heartrate && lastRide.average_heartrate < 140) {
      advice.push('Интервальная тренировка с низким пульсом. Интервалы стоит выполнять с большей интенсивностью (Z4-Z5), чтобы получить максимальный тренировочный эффект.');
    }
    if (!lastRide.average_cadence) {
      advice.push('Нет данных по каденсу. Использование датчика каденса поможет отслеживать технику педалирования и избегать излишней усталости.');
    }
    if (advice.length === 0) {
      advice.push('Тренировка выполнена отлично! Продолжайте в том же духе и постепенно повышайте нагрузку для дальнейшего прогресса.');
    }
    return advice;
  };

  const advice = generateAdvice();

  return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={e => e.stopPropagation()}>
        <h2 style={{marginTop: 0, color: '#333'}}>Анализ поездки</h2>
        <div style={{marginBottom: '0.7em', color: '#888'}}>
          {lastRide.start_date ? new Date(lastRide.start_date).toLocaleString() : ''}
        </div>
        
        {/* Метрики */}
        <div style={{marginBottom: '1em'}}>
          <b style={{color: '#333'}}>Дистанция:</b> <span style={{color: '#333'}}>{lastRide.distance ? (lastRide.distance/1000).toFixed(1) + ' км' : '—'}</span><br/>
          <b style={{color: '#333'}}>Время:</b> <span style={{color: '#333'}}>{lastRide.moving_time ? (lastRide.moving_time/60).toFixed(0) + ' мин' : '—'}</span><br/>
          <b style={{color: '#333'}}>Средняя скорость:</b> <span style={{color: '#333'}}>{lastRide.average_speed ? (lastRide.average_speed*3.6).toFixed(1) + ' км/ч' : '—'}</span><br/>
          <b style={{color: '#333'}}>Макс. скорость:</b> <span style={{color: '#333'}}>{lastRide.max_speed ? (lastRide.max_speed*3.6).toFixed(1) + ' км/ч' : '—'}</span><br/>
          <b style={{color: '#333'}}>Набор высоты:</b> <span style={{color: '#333'}}>{lastRide.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) + ' м' : '—'}</span><br/>
          <b style={{color: '#333'}}>Средний пульс:</b> <span style={{color: lastRide.average_heartrate ? (lastRide.average_heartrate < 145 ? '#4caf50' : lastRide.average_heartrate < 160 ? '#ff9800' : '#e53935') : '#888', fontWeight: '600'}}>{lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' уд/мин' : '—'}</span><br/>
          <b style={{color: '#333'}}>Макс. пульс:</b> <span style={{color: '#333'}}>{lastRide.max_heartrate ? Math.round(lastRide.max_heartrate) + ' уд/мин' : '—'}</span><br/>
          <b style={{color: '#333'}}>Каденс:</b> <span style={{color: '#333'}}>{lastRide.average_cadence ? Math.round(lastRide.average_cadence) + ' об/мин' : '—'}</span><br/>
          <b style={{color: '#333'}}>Тип:</b> <span style={{color: '#333'}}>{type}</span><br/>
        </div>
        
        {/* Советы */}
        <hr style={{margin: '1em 0', borderColor: '#ddd'}}/>
        <b style={{color: '#333'}}>Что улучшить:</b>
        <ul style={{margin: '0.5em 0 0 1.2em', padding: 0, color: '#333'}}>
          {advice.map((item, index) => (
            <li key={index} style={{color: '#333', marginBottom: '0.5em'}}><b>{item.split('.')[0]}.</b> {item.split('.').slice(1).join('.')}</li>
          ))}
        </ul>
        
        <button className="modal-close-btn" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}

export default function HeroTrackBanner() {
  const [lastRide, setLastRide] = useState(null);
  const [trackCoords, setTrackCoords] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  useEffect(() => {
    fetchLastRide();
  }, []);

  const fetchLastRide = async () => {
    try {
      const res = await fetch('/activities');
      if (!res.ok) return;
      const activities = await res.json();
      if (!activities.length) return;
      // Находим самую свежую тренировку
      const last = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
      setLastRide(last);
      if (last && last.map && last.map.summary_polyline) {
        const coords = polyline.decode(last.map.summary_polyline);
        // Leaflet expects [lat, lng]
        setTrackCoords(coords.map(([lat, lng]) => [lat, lng]));
      }
    } catch (e) {
      // Ошибка загрузки
    }
  };

  // Метрики
  const distance = lastRide?.distance ? (lastRide.distance / 1000).toFixed(1) : '—';
  const elev = lastRide?.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) : '—';
  const speed = lastRide?.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) : '—';
  const dateStr = lastRide?.start_date ? new Date(lastRide.start_date).toLocaleDateString() : '—';

  // Центр карты
  const mapCenter = trackCoords && trackCoords.length ? trackCoords[0] : [34.776, 32.424]; // Кипр по умолчанию

  return (
    <div id="garage-hero-track-banner" className="plan-hero garage-hero" style={{backgroundImage: `url(/src/assets/img/bike_bg.png)`, minHeight: 480, display: 'flex', alignItems: 'center', gap: 0, padding: 0}}>
      <div style={{flex: '1 1 658px', minWidth: 520, maxWidth: 765}}>
        <div className="garage-hero-map" style={{width: '100%', height: 440, background: 'transparent', borderRadius: 0}}>
          {trackCoords ? (
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ width: '100%', height: '100%', borderRadius: 0 }}
              scrollWheelZoom={false}
              dragging={false}
              doubleClickZoom={false}
              boxZoom={false}
              keyboard={false}
              zoomControl={false}
              attributionControl={false}
              touchZoom={false}
            >
              <MapBounds positions={trackCoords} />
              {/* Без тайлов, только трек */}
              <Polyline 
                positions={trackCoords} 
                color="#fff" 
                weight={3} 
                opacity={0.8}
                smoothFactor={0}
                lineCap="round"
                lineJoin="round"
              />
              {/* Старт и финиш */}
              {trackCoords.length > 1 && (
                <>
                  <CircleMarker 
                    center={trackCoords[0]} 
                    radius={2.5} 
                    pathOptions={{ color: '#bbb', weight: 1, opacity: 0.7, fillColor: '#fff', fillOpacity: 1 }} 
                  />
                  <CircleMarker 
                    center={trackCoords[trackCoords.length-1]} 
                    radius={2.5} 
                    pathOptions={{ color: '#bbb', weight: 1, opacity: 0.7, fillColor: '#fff', fillOpacity: 1 }} 
                  />
                </>
              )}
            </MapContainer>
          ) : (
            <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>Нет трека</div>
          )}
        </div>
      </div>
      <div style={{flex: '2 1 320px', minWidth: 260, alignItems: 'flex-start', display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '1.2em'}}>
          <h1 style={{fontSize: '0.9em', fontWeight: 600, margin: 0, color: '#fff', textAlign: 'left'}}>Трек последнего заезда</h1>
          <div className="garage-hero-date" style={{fontSize: '1.1em', color: '#fff', opacity: 0.85}}>{dateStr}</div>
        </div>
        <div className="hero-track-cards" style={{display: 'flex', gap: '2em', marginTop: '16px', marginBottom: '1.2em', alignItems: 'flex-end', justifyContent: 'flex-start'}}>
          <div className="total-card" style={{padding: '0 0px', textAlign: 'left'}}>
            <div className="total-label" style={{textAlign: 'left'}}>Дистанция</div>
            <span className="metric-value"><span className="big-number" style={{fontSize: 40, textAlign: 'left'}}>{distance}</span><span className="unit">км</span></span>
          </div>
          <div className="total-card" style={{padding: '0 0px', textAlign: 'left'}}>
            <div className="total-label" style={{textAlign: 'left'}}>Ср. скорость</div>
            <span className="metric-value"><span className="big-number" style={{fontSize: 40, textAlign: 'left'}}>{speed}</span><span className="unit">км/ч</span></span>
          </div>
          <div className="total-card" style={{padding: '0 0px', textAlign: 'left'}}>
            <div className="total-label" style={{textAlign: 'left'}}>Набор</div>
            <span className="metric-value"><span className="big-number" style={{fontSize: 40, textAlign: 'left'}}>{elev}</span><span className="unit">м</span></span>
          </div>
        </div>
        {/* Кнопка Анализ */}
        <button className="analysis-btn" onClick={() => setShowAnalysis(true)}>
          Анализировать
        </button>
        {/* Модалка */}
        <AnalysisModal open={showAnalysis} onClose={() => setShowAnalysis(false)} lastRide={lastRide} />
      </div>
    </div>
  );
} 