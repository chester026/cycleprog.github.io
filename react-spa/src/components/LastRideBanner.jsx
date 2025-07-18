import { useState, useEffect } from 'react';
import './LastRideBanner.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';

export default function LastRideBanner() {
  const [lastRide, setLastRide] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadLastRide();
  }, []);

  const loadLastRide = async () => {
    try {
      // Сначала проверяем кэш
      const cachedActivities = cacheUtils.get(CACHE_KEYS.ACTIVITIES);
      if (cachedActivities && cachedActivities.length > 0) {
        // Используем кэшированные данные
        const last = cachedActivities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
        if (last) {
          setLastRide(last);
        }
        return;
      }

      const res = await fetch('/activities');
      
      if (res.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        return;
      }
      
      if (!res.ok) return;
      
      const activities = await res.json();
      if (!activities.length) return;
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(CACHE_KEYS.ACTIVITIES, activities, 30 * 60 * 1000);
      
      // Находим самую свежую тренировку
      const last = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
      if (last) {
        setLastRide(last);
      }
    } catch (e) {
      console.error('Error loading last ride:', e);
      // Не авторизованы или ошибка - баннер остается скрытым
    }
  };

  const showLastRideModal = (ride) => {
    // Анализ и советы
    let html = `<h2 style='margin-top:0; color:#333;'>Анализ поездки</h2>`;
    html += `<div style='margin-bottom:0.7em; color:#888;'>${ride.start_date ? new Date(ride.start_date).toLocaleString() : ''}</div>`;
    
    // Метрики
    html += `<b style='color:#333;'>Дистанция:</b> <span style='color:#333;'>${ride.distance ? (ride.distance/1000).toFixed(1) + ' км' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Время:</b> <span style='color:#333;'>${ride.moving_time ? (ride.moving_time/60).toFixed(0) + ' мин' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Средняя скорость:</b> <span style='color:#333;'>${ride.average_speed ? (ride.average_speed*3.6).toFixed(1) + ' км/ч' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Макс. скорость:</b> <span style='color:#333;'>${ride.max_speed ? (ride.max_speed*3.6).toFixed(1) + ' км/ч' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Набор высоты:</b> <span style='color:#333;'>${ride.total_elevation_gain ? Math.round(ride.total_elevation_gain) + ' м' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Средний пульс:</b> <span style='color:${ride.average_heartrate ? (ride.average_heartrate < 145 ? '#4caf50' : ride.average_heartrate < 160 ? '#ff9800' : '#e53935') : '#888'}; font-weight:600;'>${ride.average_heartrate ? Math.round(ride.average_heartrate) + ' уд/мин' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Макс. пульс:</b> <span style='color:#333;'>${ride.max_heartrate ? Math.round(ride.max_heartrate) + ' уд/мин' : '—'}</span><br>`;
    html += `<b style='color:#333;'>Каденс:</b> <span style='color:#333;'>${ride.average_cadence ? Math.round(ride.average_cadence) + ' об/мин' : '—'}</span><br>`;
    
    // Тип тренировки
    let type = 'Обычная';
    if (ride.distance && ride.distance/1000 > 60) type = 'Длинная';
    else if (ride.average_speed && ride.average_speed*3.6 < 20 && ride.moving_time && ride.moving_time/60 < 60) type = 'Восстановительная';
    else if (ride.total_elevation_gain && ride.total_elevation_gain > 800) type = 'Горная';
    else if ((ride.name||'').toLowerCase().includes('интервал') || (ride.type||'').toLowerCase().includes('interval')) type = 'Интервальная';
    html += `<b style='color:#333;'>Тип:</b> <span style='color:#333;'>${type}</span><br>`;
    
    // Советы
    html += `<hr style='margin:1em 0; border-color:#ddd;'>`;
    html += `<b style='color:#333;'>Что улучшить:</b><ul style='margin:0.5em 0 0 1.2em; padding:0; color:#333;'>`;
    let hasAdvice = false;
    if (ride.average_speed && ride.average_speed*3.6 < 25) { html += `<li style='color:#333;'><b>Средняя скорость ниже 25 км/ч.</b> Для повышения скорости включайте интервальные тренировки (например, 4×4 мин в Z4-Z5 с отдыхом 4 мин), работайте над техникой педалирования (каденс 90–100), следите за положением тела на велосипеде и аэродинамикой.</li>`; hasAdvice = true; }
    if (ride.average_heartrate && ride.average_heartrate > 155) { html += `<li style='color:#333;'><b>Пульс выше 155 уд/мин.</b> Это может быть признаком высокой интенсивности или недостаточного восстановления. Проверьте качество сна, уровень стресса, добавьте восстановительные тренировки, следите за гидратацией и питанием.</li>`; hasAdvice = true; }
    if (ride.total_elevation_gain && ride.total_elevation_gain > 500 && ride.average_speed*3.6 < 18) { html += `<li style='color:#333;'><b>Горная тренировка с низкой скоростью.</b> Для улучшения результатов добавьте силовые тренировки вне велосипеда и интервалы в подъёмы (например, 5×5 мин в Z4).</li>`; hasAdvice = true; }
    if (!ride.average_heartrate) { html += `<li style='color:#333;'><b>Нет данных по пульсу.</b> Добавьте датчик пульса для более точного контроля интенсивности и восстановления.</li>`; hasAdvice = true; }
    if (!ride.distance || ride.distance/1000 < 30) { html += `<li style='color:#333;'><b>Короткая дистанция.</b> Для развития выносливости планируйте хотя бы одну длинную поездку (60+ км) в неделю. Постепенно увеличивайте дистанцию, не забывая про питание и гидратацию в пути.</li>`; hasAdvice = true; }
    if (type === 'Восстановительная') { html += `<li style='color:#333;'><b>Восстановительная тренировка.</b> Отлично! Не забывайте чередовать такие тренировки с интервальными и длинными для прогресса.</li>`; hasAdvice = true; }
    if (type === 'Интервальная' && ride.average_heartrate && ride.average_heartrate < 140) { html += `<li style='color:#333;'><b>Интервальная тренировка с низким пульсом.</b> Интервалы стоит выполнять с большей интенсивностью (Z4-Z5), чтобы получить максимальный тренировочный эффект.</li>`; hasAdvice = true; }
    if (!ride.average_cadence) { html += `<li style='color:#333;'><b>Нет данных по каденсу.</b> Использование датчика каденса поможет отслеживать технику педалирования и избегать излишней усталости.</li>`; hasAdvice = true; }
    if (!hasAdvice) { html += `<li style='color:#333;'>Тренировка выполнена отлично! Продолжайте в том же духе и постепенно повышайте нагрузку для дальнейшего прогресса.</li>`; }
    html += `</ul>`;
    
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.id = 'last-ride-modal';
    modal.style.cssText = 'display:block; position:fixed; z-index:1000; left:0; top:0; width:100vw; height:100vh; background:rgba(34,34,34,0.32);';
    modal.innerHTML = `
      <div id="last-ride-modal-content" style="background:#fff; max-width:570px; margin:7vh auto 0 auto; box-shadow:0 8px 32px 0 rgba(0,0,0,0.18); padding:2em 2em 1.5em 2em; position:relative;">
        <button id="last-ride-modal-close" style="position:absolute; right:1em; top:1em; background:none; border:none; font-size:1.5em; color:#888; cursor:pointer;">×</button>
        <div id="last-ride-modal-body" style="color:#333;">${html}</div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Обработчики закрытия
    const closeBtn = document.getElementById('last-ride-modal-close');
    if (closeBtn) {
      closeBtn.onclick = function() {
        document.body.removeChild(modal);
      };
    }
    
    modal.onclick = function(e) {
      if (e.target === this) {
        document.body.removeChild(modal);
      }
    };
  };

  if (!lastRide) return null;

  const dateStr = lastRide.start_date ? new Date(lastRide.start_date).toLocaleDateString() : '—';
  const dist = lastRide.distance ? (lastRide.distance/1000).toFixed(1) + ' км' : '—';
  const speed = lastRide.average_speed ? (lastRide.average_speed*3.6).toFixed(1) + ' км/ч' : '—';
  const hr = lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' уд/мин' : '—';

  return (
    <div id="last-ride-banner">
      <div className="banner-img-block">
        <div className="banner-img-title">New ride</div>
      </div>
      <div className="banner-black-block">
        <div><span className='banner-meta'>Date:</span> <span className='banner-value'>{dateStr}</span></div>
        <div><span className='banner-meta'>Distance:</span> <span className='banner-value'>{dist}</span></div>
        <div><span className='banner-meta'>Avg. speed:</span> <span className='banner-value'>{speed}</span></div>
        <div><span className='banner-meta'>Heart:</span> <span className='banner-value'>{hr}</span></div>
      </div>
      <div className="banner-btn-block">
        <button 
          className="last-ride-more-btn" 
          onClick={() => showLastRideModal(lastRide)}
        >
          More
        </button>
      </div>
    </div>
  );
} 