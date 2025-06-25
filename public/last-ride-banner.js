// Функция для отображения баннера последней тренировки в сайдбаре
async function loadAndRenderLastRideBanner() {
  try {
    const bannerElement = document.getElementById('last-ride-banner');
    if (!bannerElement) return; // Если элемента нет на странице, выходим
    
    // Скрываем баннер по умолчанию при загрузке
    bannerElement.style.display = 'none';
    
    const res = await fetch('/activities');
    if (!res.ok) {
      return;
    }
    const activities = await res.json();
    
    if (!activities.length) {
      return;
    }
    
    // Находим самую свежую тренировку
    const last = activities.slice().sort((a,b)=>new Date(b.start_date)-new Date(a.start_date))[0];
    if (!last) {
      return;
    }
    
    const dateStr = last.start_date ? new Date(last.start_date).toLocaleDateString() : '—';
    const dist = last.distance ? (last.distance/1000).toFixed(1) + ' км' : '—';
    const hr = last.average_heartrate ? Math.round(last.average_heartrate) + ' уд/мин' : '—';
    
    bannerElement.innerHTML = `
      <div class="banner-img-block">
        <div class="banner-img-title">Новый заезд</div>
      </div>
      <div class="banner-black-block">
        <div><span class='banner-meta'>Дата:</span> <span class='banner-value'>${dateStr}</span></div>
        <div style="margin-top:0.2em;"><span class='banner-meta'>Дистанция:</span> <span class='banner-value'>${dist}</span></div>
        <div style="margin-top:0.2em;"><span class='banner-meta'>Пульс:</span> <span class='banner-value'>${hr}</span></div>
      </div>
      <div class="banner-btn-block">
        <button class="last-ride-more-btn" id="last-ride-more-btn">Подробнее</button>
      </div>
    `;
    
    // Показываем баннер только когда есть данные
    bannerElement.style.display = 'block';
    
    // Добавляем обработчик для кнопки "Подробнее"
    const moreBtn = document.getElementById('last-ride-more-btn');
    if (moreBtn) {
      moreBtn.onclick = function() {
        showLastRideModal(last);
      };
    }
  } catch (e) {
    // Не авторизованы или ошибка - баннер остается скрытым
  }
}

// Функция для показа модального окна с анализом тренировки
function showLastRideModal(ride) {
  // Создаем модальное окно, если его нет
  let modal = document.getElementById('last-ride-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'last-ride-modal';
    modal.style.cssText = 'display:none; position:fixed; z-index:1000; left:0; top:0; width:100vw; height:100vh; background:rgba(34,34,34,0.32);';
    modal.innerHTML = `
      <div id="last-ride-modal-content" style="background:#fff; border-radius:10px; max-width:570px; margin:7vh auto 0 auto; box-shadow:0 8px 32px 0 rgba(0,0,0,0.18); padding:2em 2em 1.5em 2em; position:relative;">
        <button id="last-ride-modal-close" style="position:absolute; right:1em; top:1em; background:none; border:none; font-size:1.5em; color:#888; cursor:pointer;">×</button>
        <div id="last-ride-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Обработчики закрытия
    document.getElementById('last-ride-modal-close').onclick = function() {
      modal.style.display = 'none';
    };
    modal.onclick = function(e) {
      if (e.target === this) this.style.display = 'none';
    };
  }
  
  // Анализ и советы
  let html = `<h2 style='margin-top:0;'>Анализ поездки</h2>`;
  html += `<div style='margin-bottom:0.7em; color:#888;'>${ride.start_date ? new Date(ride.start_date).toLocaleString() : ''}</div>`;
  
  // Метрики
  html += `<b>Дистанция:</b> ${ride.distance ? (ride.distance/1000).toFixed(1) + ' км' : '—'}<br>`;
  html += `<b>Время:</b> ${ride.moving_time ? (ride.moving_time/60).toFixed(0) + ' мин' : '—'}<br>`;
  html += `<b>Средняя скорость:</b> ${ride.average_speed ? (ride.average_speed*3.6).toFixed(1) + ' км/ч' : '—'}<br>`;
  html += `<b>Макс. скорость:</b> ${ride.max_speed ? (ride.max_speed*3.6).toFixed(1) + ' км/ч' : '—'}<br>`;
  html += `<b>Набор высоты:</b> ${ride.total_elevation_gain ? Math.round(ride.total_elevation_gain) + ' м' : '—'}<br>`;
  html += `<b>Средний пульс:</b> <span style='color:${ride.average_heartrate ? (ride.average_heartrate < 145 ? '#4caf50' : ride.average_heartrate < 160 ? '#ff9800' : '#e53935') : '#888'}; font-weight:600;'>${ride.average_heartrate ? Math.round(ride.average_heartrate) + ' уд/мин' : '—'}</span><br>`;
  html += `<b>Макс. пульс:</b> ${ride.max_heartrate ? Math.round(ride.max_heartrate) + ' уд/мин' : '—'}<br>`;
  html += `<b>Каденс:</b> ${ride.average_cadence ? Math.round(ride.average_cadence) + ' об/мин' : '—'}<br>`;
  
  // Тип тренировки
  let type = 'Обычная';
  if (ride.distance && ride.distance/1000 > 60) type = 'Длинная';
  else if (ride.average_speed && ride.average_speed*3.6 < 20 && ride.moving_time && ride.moving_time/60 < 60) type = 'Восстановительная';
  else if (ride.total_elevation_gain && ride.total_elevation_gain > 800) type = 'Горная';
  else if ((ride.name||'').toLowerCase().includes('интервал') || (ride.type||'').toLowerCase().includes('interval')) type = 'Интервальная';
  html += `<b>Тип:</b> ${type}<br>`;
  
  // Советы
  html += `<hr style='margin:1em 0;'>`;
  html += `<b>Что улучшить:</b><ul style='margin:0.5em 0 0 1.2em; padding:0;'>`;
  let hasAdvice = false;
  if (ride.average_speed && ride.average_speed*3.6 < 25) { html += `<li><b>Средняя скорость ниже 25 км/ч.</b> Для повышения скорости включайте интервальные тренировки (например, 4×4 мин в Z4-Z5 с отдыхом 4 мин), работайте над техникой педалирования (каденс 90–100), следите за положением тела на велосипеде и аэродинамикой.</li>`; hasAdvice = true; }
  if (ride.average_heartrate && ride.average_heartrate > 155) { html += `<li><b>Пульс выше 155 уд/мин.</b> Это может быть признаком высокой интенсивности или недостаточного восстановления. Проверьте качество сна, уровень стресса, добавьте восстановительные тренировки, следите за гидратацией и питанием.</li>`; hasAdvice = true; }
  if (ride.total_elevation_gain && ride.total_elevation_gain > 500 && ride.average_speed*3.6 < 18) { html += `<li><b>Горная тренировка с низкой скоростью.</b> Для улучшения результатов добавьте силовые тренировки вне велосипеда и интервалы в подъёмы (например, 5×5 мин в Z4).</li>`; hasAdvice = true; }
  if (!ride.average_heartrate) { html += `<li><b>Нет данных по пульсу.</b> Добавьте датчик пульса для более точного контроля интенсивности и восстановления.</li>`; hasAdvice = true; }
  if (!ride.distance || ride.distance/1000 < 30) { html += `<li><b>Короткая дистанция.</b> Для развития выносливости планируйте хотя бы одну длинную поездку (60+ км) в неделю. Постепенно увеличивайте дистанцию, не забывая про питание и гидратацию в пути.</li>`; hasAdvice = true; }
  if (type === 'Восстановительная') { html += `<li><b>Восстановительная тренировка.</b> Отлично! Не забывайте чередовать такие тренировки с интервальными и длинными для прогресса.</li>`; hasAdvice = true; }
  if (type === 'Интервальная' && ride.average_heartrate && ride.average_heartrate < 140) { html += `<li><b>Интервальная тренировка с низким пульсом.</b> Интервалы стоит выполнять с большей интенсивностью (Z4-Z5), чтобы получить максимальный тренировочный эффект.</li>`; hasAdvice = true; }
  if (!ride.average_cadence) { html += `<li><b>Нет данных по каденсу.</b> Использование датчика каденса поможет отслеживать технику педалирования и избегать излишней усталости.</li>`; hasAdvice = true; }
  if (!hasAdvice) { html += `<li>Тренировка выполнена отлично! Продолжайте в том же духе и постепенно повышайте нагрузку для дальнейшего прогресса.</li>`; }
  html += `</ul>`;
  
  document.getElementById('last-ride-modal-body').innerHTML = html;
  modal.style.display = 'block';
  // Всегда навешиваем обработчик на кнопку закрытия
  const closeBtn = document.getElementById('last-ride-modal-close');
  if (closeBtn) {
    closeBtn.onclick = function() {
      modal.style.display = 'none';
    };
  }
}

// Загружаем баннер при загрузке страницы
document.addEventListener('DOMContentLoaded', loadAndRenderLastRideBanner); 