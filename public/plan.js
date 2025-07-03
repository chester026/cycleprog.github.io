// Автоматический анализ тренировок и рекомендации

function formatNumber(n, digits = 1) {
  return n ? n.toFixed(digits).replace(/\.0+$/, '') : '—';
}

function analyzeActivities(activities) {
  if (!activities.length) return 'Нет данных для анализа.';

  // 1. Общий объём за последние 4 недели
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const totalElev = recent.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
  const totalTime = recent.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
  // Средняя скорость на равнине — медиана
  const flats = recent.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
  const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
  const medianFlatSpeed = median(flatSpeeds);
  const avgSpeed = totalTime > 0 ? totalKm / totalTime : 0;

  // 2. Количество тренировок и средняя длина
  const count = recent.length;
  const avgKm = count ? totalKm / count : 0;

  // 3. Самая длинная тренировка
  const maxDist = Math.max(...recent.map(a => a.distance || 0)) / 1000;

  // 4. Количество дней с тренировками
  const days = new Set(recent.map(a => (a.start_date || '').slice(0,10)));

  // 5. Есть ли интервалы (по наличию type=interval или коротких интенсивных тренировок)
  const intervals = recent.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));

  // 6. Есть ли длинные поездки (более 2.5ч или 60км)
  const longRides = recent.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);

  // 7. Есть ли восстановительные (короткие, низкая скорость)
  const easyRides = recent.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);

  // 8. Динамика (есть ли рост объёма)
  // (Для простоты: сравним сумму км за последние 2 недели и предыдущие 2 недели)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const last2 = activities.filter(a => new Date(a.start_date) > twoWeeksAgo);
  const prev2 = activities.filter(a => new Date(a.start_date) <= twoWeeksAgo && new Date(a.start_date) > fourWeeksAgo);
  const last2km = last2.reduce((s,a)=>s+(a.distance||0),0)/1000;
  const prev2km = prev2.reduce((s,a)=>s+(a.distance||0),0)/1000;

  let html = `<b>Анализ за последние 4 недели:</b><br>`;
  html += `• <b>Всего тренировок:</b> ${count}<br>`;
  html += `• <b>Общий объём:</b> ${formatNumber(totalKm)} км, ${formatNumber(totalElev,0)} м набора, ${formatNumber(totalTime)} ч<br>`;
  html += `• <b>Средняя длина тренировки:</b> ${formatNumber(avgKm)} км<br>`;
  html += `• <b>Самая длинная тренировка:</b> ${formatNumber(maxDist)} км<br>`;
  html += `• <b>Средняя скорость на равнине (медиана):</b> ${formatNumber(medianFlatSpeed)} км/ч<br>`;
  html += `• <b>Дней с тренировками:</b> ${days.size}<br>`;
  html += `• <b>Длинные поездки (&gt;60км или &gt;2.5ч):</b> ${longRides.length}<br>`;
  html += `• <b>Интервальные тренировки:</b> ${intervals.length}<br>`;
  html += `• <b>Восстановительные тренировки:</b> ${easyRides.length}<br>`;
  html += `<hr style='margin:1em 0;'>`;

  // Рекомендации
  html += `<b>Рекомендации:</b><br>`;
  if (count < 8) html += '• Увеличьте частоту тренировок до 2-3 в неделю.<br>';
  if (totalKm < 300) html += '• Увеличьте недельный объём до 70-100 км для развития выносливости.<br>';
  if (longRides.length < 2) html += '• Добавьте хотя бы 1 длинную поездку (&gt;2.5ч или &gt;60км) в неделю.<br>';
  if (last2km < prev2km) html += '• Объём за последние 2 недели снизился — проверьте причины (усталость, болезнь, мотивация).<br>';
  if (totalElev < 2000) html += '• Добавьте тренировки с набором высоты для подготовки к горным гонкам.<br>';
  return html;
}

function weekNumber(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 4 - (d.getDay()||7));
  const yearStart = new Date(d.getFullYear(),0,1);
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

function renderWeekPlan() {
  const el = document.getElementById('week-plan');
  if (!el) return;
  const days = [
    { day: 'Понедельник', type: 'Восстановительная', desc: 'Лёгкая езда 40–60 мин, каденс 90–100, пульс Z1–Z2' },
    { day: 'Вторник', type: 'Мощность', desc: 'Интервалы: 4×4 мин в Z5, отдых 4 мин, каденс 85–95' },
    { day: 'Четверг', type: 'Каденс/техника', desc: '1–1.5 ч, упражнения на высокий каденс, одностороннее педалирование, пульс Z2' },
    { day: 'Суббота', type: 'Эндюранс', desc: 'Длительная поездка 2–4 ч, пульс Z2–Z3, набор высоты' }
  ];
  let html = '<table class="styled-table"><thead><tr><th>День</th><th>Тип</th><th>Описание</th></tr></thead><tbody>';
  days.forEach(d => {
    html += `<tr><td>${d.day}</td><td>${d.type}</td><td>${d.desc}</td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderMonthPlan() {
  const el = document.getElementById('month-plan');
  if (!el) return;
  let html = '<table class="styled-table"><thead><tr><th>Неделя</th><th>Фокус</th><th>Ключевые тренировки</th></tr></thead><tbody>';
  html += '<tr><td>1</td><td>Базовая выносливость, техника</td><td>3–4 тренировки: 1× эндюранс, 1× мощность, 1× каденс, 1× восстановительная</td></tr>';
  html += '<tr><td>2</td><td>Интервалы, развитие мощности</td><td>3–4 тренировки: 2× интервалы, 1× эндюранс, 1× восстановительная</td></tr>';
  html += '<tr><td>3</td><td>Длительные поездки, набор высоты</td><td>3–4 тренировки: 2× эндюранс, 1× мощность, 1× восстановительная</td></tr>';
  html += '<tr><td>4</td><td>Смешанная неделя, восстановление</td><td>2–3 тренировки: 1× интервалы, 1× эндюранс, 1× восстановительная</td></tr>';
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderAnalysisCards(activities) {
  // Анализ за 4 недели
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const totalElev = recent.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
  const totalTime = recent.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
  // Средняя скорость на равнине — медиана
  const flats = recent.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
  const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
  const medianFlatSpeed = median(flatSpeeds);
  const avgSpeed = totalTime > 0 ? totalKm / totalTime : 0;
  const count = recent.length;
  const avgKm = count ? totalKm / count : 0;
  const maxDist = Math.max(...recent.map(a => a.distance || 0)) / 1000;
  const days = new Set(recent.map(a => (a.start_date || '').slice(0,10)));
  const intervals = recent.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
  const longRides = recent.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);
  const easyRides = recent.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);
  // Карточки (5 сверху, 4 снизу)
  const cards1 = [
    {label:'Всего тренировок', value:count},
    {label:'Общий объём', value:`${formatNumber(totalKm)} км`},
    {label:'Набор высоты', value:`${formatNumber(totalElev,0)} м`},
    {label:'Общее время', value:`${formatNumber(totalTime)} ч`},
    {label:'Средняя длина', value:`${formatNumber(avgKm)} км`}
  ];
  const cards2 = [
    {label:'Самая длинная', value:`${formatNumber(maxDist)} км`},
    {label:'Средняя скорость на равнине (медиана)', value:`${formatNumber(medianFlatSpeed)} км/ч`},
    {label:'Дней с тренировками', value:days.size},
    {label:'Длинные поездки', value:longRides.length}
  ];
  let html1 = cards1.map(c=>`<div class='analysis-card'><div style='font-size:1.1em;font-weight:600;'>${c.label}</div><div style='font-size:2em;font-weight:700;margin-top:6px;'>${c.value}</div></div>`).join('');
  let html2 = cards2.map(c=>`<div class='analysis-card'><div style='font-size:1.1em;font-weight:600;'>${c.label}</div><div style='font-size:2em;font-weight:700;margin-top:6px;'>${c.value}</div></div>`).join('');
  document.getElementById('analysis-cards-row').innerHTML = html1;
  document.getElementById('analysis-cards-row-2').innerHTML = html2;
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}

function renderGoalProgress(activities, period = '4w') {
  let filtered = activities;
  const now = new Date();
  if (period === '4w') {
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    filtered = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  } else if (period === '3m') {
    const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
    filtered = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
  } else if (period === 'year') {
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    filtered = activities.filter(a => new Date(a.start_date) > yearAgo);
  }
  // 1. Средняя скорость на равнине (flat)
  // Новый фильтр: набор < 0.5% дистанции, длина > 20 км, скорость < 40 км/ч
  const flats = filtered.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
  const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
  const medianFlatSpeed = median(flatSpeeds);
  const flatSpeedGoal = 30;
  let flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed/flatSpeedGoal*100));

  // 2. Средняя скорость на подъёмах (hill)
  // Новый фильтр: набор > 2% дистанции, длина > 5 км, скорость < 20 км/ч
  const hills = filtered.filter(a => (a.distance||0) > 5000 && (a.total_elevation_gain||0) > (a.distance||0)*0.02 && (a.average_speed||0)*3.6 < 20);
  const hillSpeeds = hills.map(a => (a.average_speed||0)*3.6);
  const medianHillSpeed = median(hillSpeeds);
  const hillSpeedGoal = 17.5;
  let hillSpeedPct = Math.floor(Math.min(100, medianHillSpeed / hillSpeedGoal * 100));

  // Медианный пульс на равнине
  const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
  const medianFlatHR = median(flatHRs);
  // Медианный пульс на подъёмах
  const hillHRs = hills.map(a => a.average_heartrate).filter(Boolean);
  const medianHillHR = median(hillHRs);

  // Пульсовые зоны для целей
  let flatHRZone = medianFlatHR ? (medianFlatHR < 127 ? 'Z2' : medianFlatHR < 145 ? 'Z3' : 'Z4+') : '—';
  let hillHRZone = medianHillHR ? (medianHillHR < 127 ? 'Z2' : medianHillHR < 145 ? 'Z3' : medianHillHR < 163 ? 'Z4' : 'Z5') : '—';

  // Цветовая индикация пульса на подъёмах
  let hillPulseClass = 'goal-pulse-grey';
  if (medianHillHR >= 145 && medianHillHR <= 150) hillPulseClass = 'goal-pulse-green';
  else if ((medianHillHR >= 140 && medianHillHR < 145) || (medianHillHR > 150 && medianHillHR <= 155)) hillPulseClass = 'goal-pulse-yellow';

  let hillPulseStr = '';
  if (medianHillHR) {
    hillPulseStr = `, <span class='${hillPulseClass}'>пульс: ${medianHillHR.toFixed(0)}</span>`;
  }

  function progressBar(pct, label) {
    return `<div class='goal-progress-bar-outer'><div class='goal-progress-bar'><div class='goal-progress-bar-inner' style='width:${pct}%;'></div></div><span class='goal-progress-bar-pct'>${pct}%</span></div><div class='goal-progress-bar-label'>${label}</div>`;
  }
  document.getElementById('goal-flat-speed').innerHTML = flats.length ?
    progressBar(flatSpeedPct, `${medianFlatSpeed.toFixed(1)} км/ч, пульс: ${medianFlatHR ? medianFlatHR.toFixed(0) : '—'} (${flatHRZone})`) : '—';
  document.getElementById('goal-hill-speed').innerHTML = hills.length ?
    progressBar(hillSpeedPct, `${medianHillSpeed.toFixed(1)} км/ч${hillPulseStr}, тренировок: ${hills.length}`) : '—';

  // 4. Пульс (по зонам)
  // Процент равнинных тренировок с пульсом в Z2–Z3
  const flatsInZone = flats.filter(a => a.average_heartrate && a.average_heartrate >= 109 && a.average_heartrate < 145).length;
  const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;
  // Процент подъёмных тренировок с пульсом в Z3–Z4
  const hillsInZone = hills.filter(a => a.average_heartrate && a.average_heartrate >= 145 && a.average_heartrate < 163).length;
  const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;
  // Итоговый процент — среднее двух
  const pulseGoalPct = flats.length && hills.length ? Math.round((flatZonePct + hillZonePct) / 2) : (flatZonePct || hillZonePct);
  document.getElementById('goal-hr').innerHTML = (flats.length || hills.length) ?
    progressBar(pulseGoalPct, `Равнина: ${flatZonePct}%, подъёмы: ${hillZonePct}% в целевых зонах`) : '—';

  // 5. Длительные поездки (более 2.5ч или 60км)
  const longRides = filtered.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);
  let longRidePct = Math.min(100, Math.round(longRides.length/4*100));
  let longRideLabel = period === 'all' ? `${longRides.length} за всё время` : period === '3m' ? `${longRides.length} за 3 месяца` : period === 'year' ? `${longRides.length} за год` : `${longRides.length} за 4 недели`;
  document.getElementById('goal-long-ride').innerHTML = progressBar(longRidePct, longRideLabel);

  // 6. Интервалы (по названию или типу)
  const intervals = filtered.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
  let intervalsPct = Math.min(100, Math.round(intervals.length/4*100));
  let intervalsLabel = period === 'all' ? `${intervals.length} за всё время` : period === '3m' ? `${intervals.length} за 3 месяца` : period === 'year' ? `${intervals.length} за год` : `${intervals.length} за 4 недели`;
  document.getElementById('goal-intervals').innerHTML = progressBar(intervalsPct, intervalsLabel);

  // 7. Восстановительные тренировки (короткие, низкая скорость)
  const easyRides = filtered.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);
  let easyPct = Math.min(100, Math.round(easyRides.length/4*100));
  let easyLabel = period === 'all' ? `${easyRides.length} за всё время` : period === '3m' ? `${easyRides.length} за 3 месяца` : period === 'year' ? `${easyRides.length} за год` : `${easyRides.length} за 4 недели`;
  document.getElementById('goal-recovery').innerHTML = progressBar(easyPct, easyLabel);

  // 8. Питание и гидратация — не анализируем, просто выводим "Тренировать!"
  // document.getElementById('goal-nutrition').innerHTML = 'Тренировать!';
}

// 1. ВРЕМЯ В ПУЛЬСОВЫХ ЗОНАХ (Z2, Z3, Z4)
function renderHRZones(activities) {
  // Берём только последние 8 недель
  const now = new Date();
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > eightWeeksAgo);
  // Считаем суммарное время в зонах
  let z2 = 0, z3 = 0, z4 = 0, other = 0;
  recent.forEach(a => {
    if (!a.average_heartrate || !a.moving_time) return;
    const hr = a.average_heartrate;
    const t = a.moving_time / 60; // минуты
    if (hr >= 109 && hr < 127) z2 += t;
    else if (hr >= 127 && hr < 145) z3 += t;
    else if (hr >= 145 && hr < 163) z4 += t;
    else other += t;
  });
  const total = z2 + z3 + z4 + other;
  const data = [z2, z3, z4, other];
  const labels = ['Z2 (109-126)', 'Z3 (127-144)', 'Z4 (145-162)', 'Другое'];
  const colors = ['#4caf50', '#ff9800', '#e53935', '#bdbdbd'];
  // Вставляем блок
  let html = `<b>Время в пульсовых зонах (8 недель)</b><br>`;
  html += `<canvas id='hr-zones-chart' width='280' height='280' style='max-width:280px; margin:0 auto; display:block;'></canvas>`;
  html += `<div style='font-size:0.98em; margin-top:0.7em;'>`;
  html += `Z2: <b>${z2.toFixed(0)} мин</b> (${((z2/total)*100).toFixed(1)}%)<br>`;
  html += `Z3: <b>${z3.toFixed(0)} мин</b> (${((z3/total)*100).toFixed(1)}%)<br>`;
  html += `Z4: <b>${z4.toFixed(0)} мин</b> (${((z4/total)*100).toFixed(1)}%)<br>`;
  html += `</div>`;
  const el = document.getElementById('hr-zones-block');
  if (el) el.innerHTML = html;
  // Chart.js
  setTimeout(() => {
    const ctx = document.getElementById('hr-zones-chart');
    if (ctx && window.Chart) {
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors, borderWidth: 1 }]
        },
        options: {
          plugins: { legend: { display: true, position: 'bottom' } },
          cutout: '60%',
          responsive: false
        }
      });
    }
  }, 100);
}

// 2. ПЛАН-ФАКТ АНАЛИЗ
function renderPlanFact(activities) {
  // Фактические показатели за 4 недели
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const count = recent.length;
  const longRides = recent.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600).length;
  const intervals = recent.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval'))).length;
  // Плановые значения (можно вынести в настройки)
  const plan = { weeks: 4, rides: 12, km: 400, long: 4, intervals: 8 };
  // Сравнение
  let html = `<div>`;

  html += `<table class='styled-table' style='margin-top:10px;'><thead><tr><th>Показатель</th><th>План</th><th>Факт</th><th>Выполнение</th></tr></thead><tbody>`;
  html += `<tr><td>Тренировки</td><td>${plan.rides}</td><td>${count}</td><td>${Math.round(count/plan.rides*100)}%</td></tr>`;
  html += `<tr><td>Объём (км)</td><td>${plan.km}</td><td>${totalKm.toFixed(0)}</td><td>${Math.round(totalKm/plan.km*100)}%</td></tr>`;
  html += `<tr><td>Длинные поездки</td><td>${plan.long}</td><td>${longRides}</td><td>${Math.round(longRides/plan.long*100)}%</td></tr>`;
  html += `<tr><td>Интервалы</td><td>${plan.intervals}</td><td>${intervals}</td><td>${Math.round(intervals/plan.intervals*100)}%</td></tr>`;
  html += `</tbody></table></div>`;
  document.getElementById('plan-fact-block').innerHTML = html;
}

function renderPlanFactHero(activities) {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const count = recent.length;
  const longRides = recent.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600).length;
  const plan = { rides: 12, km: 400, long: 4, intervals: 8 };
  const data = [
    { label: 'Тренировки', fact: count, plan: plan.rides, pct: Math.round(count/plan.rides*100) },
    { label: 'Объём, км', fact: Math.round(totalKm), plan: plan.km, pct: Math.round(totalKm/plan.km*100) },
    { label: 'Длинные', fact: longRides, plan: plan.long, pct: Math.round(longRides/plan.long*100) },
    { label: 'FTP/VO₂max', fact: lastRealIntervals.count, min: lastRealIntervals.min, plan: lastRealIntervals.label, pct: '', color: lastRealIntervals.color },
  ];
  const html = data.map((d, i) =>
    `<div class="plan-fact-hero-card">
      <div style="display:flex;align-items:center;gap:0.7em;margin-bottom:0.15em;">
        ${i === 3 ? `<span style='display:inline-block;width:18px;height:18px;border-radius:50%;background:${d.color};border:2px solid #fff;'></span>` : ''}
        <span style="font-size:32px;font-weight:800;color:#fff;line-height:1;">${i < 3 ? d.pct + '%' : d.fact}</span>
        ${i === 3
          ? `<span style="font-size:1.1em;opacity:0.7;color:#fff;">/ ${d.min} мин</span>`
          : `<span style="font-size:1.1em;opacity:0.7;color:#fff;">${d.fact} / ${d.plan}</span>`
        }
      </div>
      <div style="font-size:1em;color:#fff;opacity:0.5;">${d.label}</div>
    </div>`
  ).join('');
  const el = document.getElementById('plan-fact-hero');
  if (el) el.innerHTML = html;
}

let lastRealIntervals = { count: 0, min: 0, label: '', color: '#bdbdbd' };

async function renderRealIntervalsCard(activities, period = '4w', useCache = false) {
  let filtered = activities;
  const now = new Date();
  if (period === '4w') {
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    filtered = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  } else if (period === '3m') {
    const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
    filtered = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
  } else if (period === 'year') {
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    filtered = activities.filter(a => new Date(a.start_date) > yearAgo);
  }
  const actsToAnalyze = filtered;
  let totalIntervals = 0;
  let analyzed = 0;
  let details = [];
  let totalTimeSec = 0;
  let rateLimitExceeded = false;
  let usedCache = false;
  for (const act of actsToAnalyze) {
    try {
      let streams = null;
      const cacheKey = `streams_${act.id}`;
      // Пробуем получить из кэша
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        streams = JSON.parse(cached);
        usedCache = true;
      } else {
        const res = await fetch(`/activities/${act.id}/streams`);
        if (res.status === 429) { rateLimitExceeded = true; break; }
        if (!res.ok) continue;
        streams = await res.json();
        // Сохраняем в кэш
        localStorage.setItem(cacheKey, JSON.stringify(streams));
      }
      const hr = streams.heartrate?.data || [];
      let intervals = 0;
      let inInt = false, startIdx = 0;
      for (let i = 0; i < hr.length; i++) {
        const h = hr[i] || 0;
        if (h >= 160) {
          if (!inInt) { inInt = true; startIdx = i; }
        } else {
          if (inInt && (i - startIdx) >= 120) { intervals++; totalTimeSec += (i - startIdx); }
          inInt = false;
        }
      }
      if (inInt && (hr.length - startIdx) >= 120) { intervals++; totalTimeSec += (hr.length - startIdx); }
      totalIntervals += intervals;
      analyzed++;
      details.push(`${act.name || 'Без названия'}: ${intervals}`);
    } catch (e) {
      // Если ошибка и есть кэш — используем кэш
      const cacheKey = `streams_${act.id}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const streams = JSON.parse(cached);
        usedCache = true;
        const hr = streams.heartrate?.data || [];
        let intervals = 0;
        let inInt = false, startIdx = 0;
        for (let i = 0; i < hr.length; i++) {
          const h = hr[i] || 0;
          if (h >= 160) {
            if (!inInt) { inInt = true; startIdx = i; }
          } else {
            if (inInt && (i - startIdx) >= 120) { intervals++; totalTimeSec += (i - startIdx); }
            inInt = false;
          }
        }
        if (inInt && (hr.length - startIdx) >= 120) { intervals++; totalTimeSec += (hr.length - startIdx); }
        totalIntervals += intervals;
        analyzed++;
        details.push(`${act.name || 'Без названия'}: ${intervals}`);
      } else {
        continue;
      }
    }
  }
  const totalTimeMin = Math.round(totalTimeSec / 60);
  // Цветовая дифференциация
  let color = '#bdbdbd', label = 'Мало';
  if (totalIntervals >= 15 && totalIntervals < 25) { color = '#4caf50'; label = 'Норма'; }
  else if (totalIntervals >= 25 && totalIntervals < 35) { color = '#ffeb3b'; label = 'Много'; }
  else if (totalIntervals >= 35 && totalIntervals < 45) { color = '#e53935'; label = 'Слишком много'; }
  lastRealIntervals = { count: totalIntervals, min: totalTimeMin, label, color };
  let html = '';
  if (rateLimitExceeded) {
    html += `<div style=\"background:#ffeaea;color:#d7263d;padding:0.7em 1em;border-radius:6px;margin-bottom:1em;font-weight:600;\">Превышен лимит запросов Strava API. Попробуйте позже.</div>`;
  }
  html += analyzed ? `
    <div style=\"display:flex;align-items:center;gap:0.7em;\">
      <span style=\"display:inline-block;width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;\"></span>
      <span style=\"font-size:1.3em;font-weight:800;color:#000;\">${totalIntervals} / ${totalTimeMin} мин</span>
      <span style=\"font-size:0.9em;opacity:0.5;color:#000;margin-top:0.12em;\">${label}</span>
    </div>
    <div class='goal-progress-bar-label' style='margin-top:0.5em;'>Критерий: пульс ≥160 не менее 120 сек подряд</div>
  ` : 'Нет данных';
  document.getElementById('goal-real-intervals').innerHTML = html;
  renderPlanFactHero(activities);
}

// --- Индикатор кэша ---
function setCacheIndicator(show) {
  let indicator = document.getElementById('cache-indicator');
  if (show) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'cache-indicator';
      indicator.textContent = 'Cached data';
      // Обновленный стиль
      indicator.style = `position:absolute;bottom:80px;left:18px;z-index:2000;background:rgb(238,238,238);color:rgb(173,173,173);padding:6px 8px;font-weight:500;font-size:0.8em;letter-spacing:0.04em;`;
      // Если есть .sidebar — вставить внутрь, иначе body
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.appendChild(indicator);
      } else {
        indicator.style.position = 'fixed';
        indicator.style.bottom = '80px';
        indicator.style.left = '18px';
        document.body.appendChild(indicator);
      }
    }
    indicator.style.display = '';
  } else if (indicator) {
    indicator.style.display = 'none';
  }
}

fetch('/activities')
  .then(async res => {
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    if (data && data.error) throw new Error(data.message || 'Ошибка Strava');
    localStorage.setItem('activities', JSON.stringify(data));
    setCacheIndicator(false); // Нет кэша, данные свежие
    return data;
  })
  .then(async activities => {
    renderGoalProgress(activities);
    await renderRealIntervalsCard(activities);
    renderWeekPlan();
    renderMonthPlan();
    if (activities.length) {
      const weeks = {};
      activities.forEach(a => {
        const week = weekNumber(a.start_date);
        if (!weeks[week]) weeks[week] = 0;
        weeks[week] += 1;
      });
      const weekKeys = Object.keys(weeks);
      const minWeek = Math.min(...weekKeys);
      const maxWeek = Math.max(...weekKeys);
      const avgPerWeek = activities.length / (maxWeek - minWeek + 1);
      const goal = 4;
      const pct = Math.round(Math.min(100, avgPerWeek / goal * 100));
      document.getElementById('avg-per-week').innerHTML = `Среднее число тренировок в неделю: <b>${avgPerWeek.toFixed(2)}</b> <span style='color:#888'> (${pct}%)</span> / <b>4</b> `;
      renderPeriodSummary(activities);
      renderRecommendations(activities);
      renderSummary(activities);
      renderHRZones(activities);
      renderPlanFact(activities);
    } else {
      document.getElementById('avg-per-week').textContent = '';
      document.getElementById('hr-zones-block').innerHTML = '';
      document.getElementById('plan-fact-block').innerHTML = '';
    }
  })
  .catch(async (err) => {
    const cached = localStorage.getItem('activities');
    if (cached) {
      const activities = JSON.parse(cached);
      setCacheIndicator(true); // Используем кэш
      renderGoalProgress(activities);
      await renderRealIntervalsCard(activities, undefined, true); // передаем флаг кэша
      renderWeekPlan();
      renderMonthPlan();
      if (activities.length) {
        const weeks = {};
        activities.forEach(a => {
          const week = weekNumber(a.start_date);
          if (!weeks[week]) weeks[week] = 0;
          weeks[week] += 1;
        });
        const weekKeys = Object.keys(weeks);
        const minWeek = Math.min(...weekKeys);
        const maxWeek = Math.max(...weekKeys);
        const avgPerWeek = activities.length / (maxWeek - minWeek + 1);
        const goal = 4;
        const pct = Math.round(Math.min(100, avgPerWeek / goal * 100));
        document.getElementById('avg-per-week').innerHTML = `Среднее число тренировок в неделю: <b>${avgPerWeek.toFixed(2)}</b> <span style='color:#888'> (${pct}%)</span> / <b>4</b> `;
        renderPeriodSummary(activities);
        renderRecommendations(activities);
        renderSummary(activities);
        renderHRZones(activities);
        renderPlanFact(activities);
      } else {
        document.getElementById('avg-per-week').textContent = '';
        document.getElementById('hr-zones-block').innerHTML = '';
        document.getElementById('plan-fact-block').innerHTML = '';
      }
    } else {
      setCacheIndicator(false);
      renderWeekPlan();
      renderMonthPlan();
      const avgPerWeek = document.getElementById('avg-per-week');
      if (avgPerWeek) avgPerWeek.textContent = '';
      const periodSummary = document.getElementById('period-summary');
      if (periodSummary) periodSummary.innerHTML = '';
      const periodSummaryTitle = document.getElementById('period-summary-title');
      if (periodSummaryTitle) periodSummaryTitle.textContent = '';
      const recommendationsBlock = document.getElementById('recommendations-block');
      if (recommendationsBlock) recommendationsBlock.innerHTML = '';
      const summaryBlock = document.getElementById('summary-block');
      if (summaryBlock) summaryBlock.innerHTML = '';
      const hrZonesBlock = document.getElementById('hr-zones-block');
      if (hrZonesBlock) hrZonesBlock.innerHTML = '';
      const planFactBlock = document.getElementById('plan-fact-block');
      if (planFactBlock) planFactBlock.innerHTML = '';
      alert('Ошибка загрузки данных с сервера и нет кэшированных данных.');
    }
  });

function renderPeriodSummary(activities) {
  if (!activities.length) {
    document.getElementById('period-summary').innerHTML = '';
    document.getElementById('period-summary-title').textContent = '';
    if (window.periodSummaryChart) window.periodSummaryChart.destroy();
    return;
  }
  // Сортируем по дате (от новых к старым)
  const acts = activities.slice().sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));
  const periods = [];
  let period = [];
  let periodStart = acts[0] ? new Date(acts[0].start_date) : null;
  for (let i = 0; i < acts.length; ++i) {
    const d = new Date(acts[i].start_date);
    if (period.length && (period.length >= 28 || (periodStart - d) > 27*24*60*60*1000)) {
      periods.push(period);
      period = [];
      periodStart = d;
    }
    period.push(acts[i]);
  }
  if (period.length) periods.push(period);
  function median(arr) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  }
  function percentForPeriod(period) {
    const flats = period.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
    const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
    const medianFlatSpeed = median(flatSpeeds);
    const flatSpeedGoal = 30;
    let flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed/flatSpeedGoal*100));
    const hills = period.filter(a => (a.distance||0) > 5000 && (a.total_elevation_gain||0) > (a.distance||0)*0.02 && (a.average_speed||0)*3.6 < 20);
    const hillSpeeds = hills.map(a => (a.average_speed||0)*3.6);
    const medianHillSpeed = median(hillSpeeds);
    const hillSpeedGoal = 17.5;
    let hillSpeedPct = Math.floor(Math.min(100, medianHillSpeed / hillSpeedGoal * 100));
    const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
    const medianFlatHR = median(flatHRs);
    const flatsInZone = flats.filter(a => a.average_heartrate && a.average_heartrate >= 109 && a.average_heartrate < 145).length;
    const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;
    const hillsInZone = hills.filter(a => a.average_heartrate && a.average_heartrate >= 145 && a.average_heartrate < 163).length;
    const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;
    const pulseGoalPct = flats.length && hills.length ? Math.round((flatZonePct + hillZonePct) / 2) : (flatZonePct || hillZonePct);
    const longRides = period.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);
    let longRidePct = Math.min(100, Math.round(longRides.length/4*100));
    const intervals = period.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
    let intervalsPct = Math.min(100, Math.round(intervals.length/4*100));
    const easyRides = period.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);
    let easyPct = Math.min(100, Math.round(easyRides.length/4*100));
    const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, intervalsPct, easyPct];
    const avg = Math.round(all.reduce((a,b)=>a+b,0)/all.length);
    return {avg, all, start: period[period.length-1]?.start_date, end: period[0]?.start_date};
  }
  const summary = periods.map(percentForPeriod)
    .filter(s => {
      // Фильтруем только периоды, начинающиеся с 2025 года и позже
      if (!s.start) return false;
      const year = new Date(s.start).getFullYear();
      return year >= 2025;
    });
  let html = `<table class='styled-table'><thead><tr><th>Период</th><th>Средний % выполнения</th><th>Детализация</th></tr></thead><tbody>`;
  summary.forEach((s,i) => {
    const start = s.start ? new Date(s.start).toLocaleDateString() : '';
    const end = s.end ? new Date(s.end).toLocaleDateString() : '';
    html += `<tr><td>${start} – ${end}</td><td style='font-weight:700;color:#274DD3;'>${s.avg}%</td><td>${s.all.join('% / ')}%</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('period-summary-title').textContent = 'Прогресс по 4-недельным периодам';
  document.getElementById('period-summary').innerHTML = html;

  // --- График ---
  const ctx = document.getElementById('period-summary-chart').getContext('2d');
  if (window.periodSummaryChart) window.periodSummaryChart.destroy();
  if (summary.length > 1) {
    window.periodSummaryChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: summary.map(s => {
          const start = s.start ? new Date(s.start) : null;
          const end = s.end ? new Date(s.end) : null;
          function mmYY(d) { return d ? (d.getMonth()+1).toString().padStart(2,'0') + '.' + (d.getFullYear()%100).toString().padStart(2,'0') : ''; }
          return `${mmYY(start)}–${mmYY(end)}`;
        }),
        datasets: [{
          label: 'Средний % выполнения',
          data: summary.map(s => s.avg),
          borderColor: '#274DD3',
          backgroundColor: 'rgba(39,77,211,0.10)',
          pointBackgroundColor: '#274DD3',
          pointBorderColor: '#fff',
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: '% выполнения' },
            grid: { color: '#eee' }
          },
          x: {
            title: { display: false },
            grid: { display: false }
          }
        }
      }
    });
  } else {
    ctx.clearRect(0,0,400,180);
  }
}

function renderRecommendations(activities) {
  if (!activities.length) {
    document.getElementById('recommendations-block').innerHTML = '';
    return;
  }
  // --- Сравнение с профи ---
  // Профи: скорость 33–38 км/ч, пульс Z3–Z4, объём 350–500 км/нед, интервалы, длинные поездки
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const totalTime = recent.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
  const avgSpeed = totalTime > 0 ? totalKm / totalTime : 0;
  const flats = recent.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
  const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
  const medianFlatSpeed = median(flatSpeeds);
  const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
  const medianFlatHR = median(flatHRs);
  const intervals = recent.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
  const longRides = recent.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);
  let html = '<h2>Рекомендации</h2>';
  html += `<b>Сравнение с профи:</b><br>`;
  html += `<table class='styled-table'><thead><tr><th>Показатель</th><th>Мои данные</th><th>Профи</th></tr></thead><tbody>`;
  html += `<tr><td>Ср. скорость на равнине</td><td>${medianFlatSpeed ? medianFlatSpeed.toFixed(1) : '—'} км/ч</td><td>33–38 км/ч</td></tr>`;
  html += `<tr><td>Медианный пульс на равнине</td><td>${medianFlatHR ? medianFlatHR.toFixed(0) : '—'}</td><td>Z3–Z4</td></tr>`;
  html += `<tr><td>Объём за 4 недели</td><td>${totalKm.toFixed(0)} км</td><td>1400–2000 км</td></tr>`;
  html += `<tr><td>Интервальные тренировки</td><td>${intervals.length}</td><td>2–3/нед</td></tr>`;
  html += `<tr><td>Длинные поездки (&gt;60км или &gt;2.5ч)</td><td>${longRides.length}</td><td>1–2/нед</td></tr>`;
  html += `</tbody></table>`;
  // Используем analyzeActivities для генерации рекомендаций
  let rec = analyzeActivities(activities);
  rec = rec.split('<b>Рекомендации:</b><br>')[1] || '';
  rec = rec.replace(/<hr[^>]*>/g, '');
  if (rec.trim()) {
    html += `<div class='analysis-card' style='margin-top:1em;'>${rec}</div>`;
  }
  // --- Профессиональные рекомендации ---
  html += `<br><br><b>Профессиональные рекомендации:</b><br><ul style='margin:0 0 0 1.2em; padding:0; font-size:1em;'>`;
  html += `<li>Планируйте тренировки по принципу периодизации: 3 недели наращивания нагрузки, 1 неделя восстановления.</li>`;
  html += `<li>Проводите регулярные тесты FTP/CP для отслеживания прогресса и корректировки зон.</li>`;
  html += `<li>Включайте в план тренировки на развитие слабых сторон (например, интервалы в гору, спринты, cadence drills).</li>`;
  html += `<li>Контролируйте восстановление: следите за пульсом покоя, качеством сна, используйте субъективную шкалу усталости.</li>`;
  html += `<li>Обращайте внимание на питание и гидратацию до, во время и после тренировок.</li>`;
  html += `<li>Регулярно анализируйте данные: ищите закономерности, отслеживайте динамику, корректируйте план.</li>`;
  html += `<li>Включайте в неделю хотя бы одну вариативную тренировку (новый маршрут, техника, групповой заезд).</li>`;
  html += `<li>Работайте над техникой педалирования и посадкой (bike fit).</li>`;
  html += `</ul><br><br>`;

  document.getElementById('recommendations-block').innerHTML = html;
}

function renderSummary(activities) {
  if (!activities.length) {
    document.getElementById('summary-block').innerHTML = '';
    return;
  }
  // Краткое резюме: сколько недель прогресса, средний % выполнения, динамика
  const now = new Date();
  const acts = activities.slice().sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));
  const periods = [];
  let period = [];
  let periodStart = acts[0] ? new Date(acts[0].start_date) : null;
  for (let i = 0; i < acts.length; ++i) {
    const d = new Date(acts[i].start_date);
    if (period.length && (period.length >= 28 || (periodStart - d) > 27*24*60*60*1000)) {
      periods.push(period);
      period = [];
      periodStart = d;
    }
    period.push(acts[i]);
  }
  if (period.length) periods.push(period);
  function median(arr) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  }
  function percentForPeriod(period) {
    const flats = period.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
    const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
    const medianFlatSpeed = median(flatSpeeds);
    const flatSpeedGoal = 30;
    let flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed/flatSpeedGoal*100));
    const hills = period.filter(a => (a.distance||0) > 5000 && (a.total_elevation_gain||0) > (a.distance||0)*0.02 && (a.average_speed||0)*3.6 < 20);
    const hillSpeeds = hills.map(a => (a.average_speed||0)*3.6);
    const medianHillSpeed = median(hillSpeeds);
    const hillSpeedGoal = 17.5;
    let hillSpeedPct = Math.floor(Math.min(100, medianHillSpeed / hillSpeedGoal * 100));
    const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
    const medianFlatHR = median(flatHRs);
    const flatsInZone = flats.filter(a => a.average_heartrate && a.average_heartrate >= 109 && a.average_heartrate < 145).length;
    const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;
    const hillsInZone = hills.filter(a => a.average_heartrate && a.average_heartrate >= 145 && a.average_heartrate < 163).length;
    const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;
    const pulseGoalPct = flats.length && hills.length ? Math.round((flatZonePct + hillZonePct) / 2) : (flatZonePct || hillZonePct);
    const longRides = period.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);
    let longRidePct = Math.min(100, Math.round(longRides.length/4*100));
    const intervals = period.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.name||'').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
    let intervalsPct = Math.min(100, Math.round(intervals.length/4*100));
    const easyRides = period.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);
    let easyPct = Math.min(100, Math.round(easyRides.length/4*100));
    const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, intervalsPct, easyPct];
    const avg = Math.round(all.reduce((a,b)=>a+b,0)/all.length);
    return avg;
  }
  const avgPercents = periods.map(percentForPeriod);
  const avgAll = avgPercents.length ? Math.round(avgPercents.reduce((a,b)=>a+b,0)/avgPercents.length) : 0;
  let trend = '';
  if (avgPercents.length > 1) {
    const last = avgPercents[0], prev = avgPercents[1];
    if (last > prev) trend = '⬆️ Прогресс ускоряется!';
    else if (last < prev) trend = '⬇️ Есть спад, проверьте восстановление.';
    else trend = '→ Прогресс стабилен.';
  }
  let html = `<div class='summary-card' style='margin-top:0;'><h2 style='margin-top:0'>Саммари</h2>`;
  html += `Всего периодов: <b>${avgPercents.length}</b><br>`;
  html += `Средний % выполнения: <b>${avgAll}%</b><br>`;
  if (trend) html += `Динамика: <b>${trend}</b><br>`;
  // Добавляю советы из рекомендаций:
  html += `<ul style='margin:0.7em 0 0 1.2em; padding:0; font-size:1em;'>`;
  html += `<li>Не забывайте про восстановительные тренировки.</li>`;
  html += `<li>Объём растёт — хорошо! Следите за самочувствием и не забывайте про восстановление.</li>`;
  html += `<li>Средняя скорость низкая — поработайте над техникой и интервальными тренировками.</li>`;
  html += `</ul>`;
  html += `</div>`;
  document.getElementById('summary-block').innerHTML = html;
}

// --- Обработчик селектора периода ---
document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('goal-period-select');
  if (!select) return;
  const saved = localStorage.getItem('goalPeriod') || '4w';
  select.value = saved;
  let allActs = [];
  fetch('/activities').then(res => res.json()).then(acts => {
    allActs = acts;
    renderGoalProgress(allActs, select.value);
  });
  select.addEventListener('change', () => {
    localStorage.setItem('goalPeriod', select.value);
    renderGoalProgress(allActs, select.value);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  // const btn = document.getElementById('toggle-period-summary');
  // const content = document.getElementById('period-summary');
  // content.style.display = 'none';
  // btn.textContent = '►';
  // btn.onclick = function() {
  //   if (content.style.display === 'none') {
  //     content.style.display = '';
  //     btn.textContent = '▼';
  //   } else {
  //     content.style.display = 'none';
  //     btn.textContent = '►';
  //   }
  // };
});

// --- Добавление событий в календарь на главной странице ---
function setupNextRideCalendarLinks() {
  // Первый заезд: 28 июня, 16:00–19:00
  const event1 = {
    title: 'Групповой заезд — Cyprus Gran Fondo',
    location: 'Pafos Castle, Пафос, Кипр',
    details: 'Групповой старт Gran Fondo Cyprus. Не забудьте подготовить велосипед!',
    start: '2025-06-28T16:00:00+03:00',
    end:   '2025-06-28T19:00:00+03:00'
  };
  // Второй заезд: 28 июня, 06:00–09:00
  const event2 = {
    title: 'Утренний заезд — Cyprus Gran Fondo',
    location: 'Pafos Castle, Пафос, Кипр',
    details: 'Утренний групповой старт Gran Fondo Cyprus.',
    start: '2025-06-28T06:00:00+03:00',
    end:   '2025-06-28T09:00:00+03:00'
  };
  // Google Calendar URL generator
  function gcalUrl(event) {
    const fmt = s => s.replace(/[-:]/g,'').replace('+0300','Z');
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${fmt(event.start)}/${fmt(event.end)}&details=${encodeURIComponent(event.details)}&location=${encodeURIComponent(event.location)}&sf=true&output=xml`;
  }
  // Apple Calendar (.ics) generator
  function icsContent(event) {
    const fmt = s => s.replace(/[-:]/g,'').replace('+0300','Z');
    return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${event.title}\nDTSTART:${fmt(event.start)}\nDTEND:${fmt(event.end)}\nLOCATION:${event.location}\nDESCRIPTION:${event.details}\nEND:VEVENT\nEND:VCALENDAR`;
  }
  // 1-й заезд
  const gcal1 = document.getElementById('gcal-link-1');
  const ical1 = document.getElementById('ical-link-1');
  if (gcal1) gcal1.href = gcalUrl(event1);
  if (ical1) ical1.onclick = function(e) {
    e.preventDefault();
    const blob = new Blob([icsContent(event1).replace(/\\n/g,'\r\n')], {type: 'text/calendar'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'next-ride-1.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();}, 1000);
  };
  // 2-й заезд
  const gcal2 = document.getElementById('gcal-link-2');
  const ical2 = document.getElementById('ical-link-2');
  if (gcal2) gcal2.href = gcalUrl(event2);
  if (ical2) ical2.onclick = function(e) {
    e.preventDefault();
    const blob = new Blob([icsContent(event2).replace(/\\n/g,'\r\n')], {type: 'text/calendar'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'next-ride-2.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();}, 1000);
  };
}
// Автоматически инициализируем на главной
if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
  window.addEventListener('DOMContentLoaded', setupNextRideCalendarLinks);
}

// --- Динамический вывод заездов на главной ---
async function loadAndRenderNextRides() {
  const container = document.getElementById('rides-dynamic-block');
  if (!container) return;
  container.innerHTML = '';
  try {
    const res = await fetch('/api/rides');
    const rides = await res.json();
    rides.forEach((event, idx) => {
      const startDate = new Date(event.start);
      const dateStr = startDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      const dateStrCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      const timeStr = startDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      container.innerHTML += `
        <div class="ride-card" data-ride-id="${event.id}">
          <button class="ride-card-del" title="Удалить заезд">&times;</button>
          <b class="ride-card-date">${dateStrCap}, ${timeStr}</b><br>
          <span class="ride-card-place">Место: ${event.location}${event.locationLink ? `, <a href='${event.locationLink}' target='_blank'>локация</a>` : ''}</span><br>
          ${event.details ? `<div class="ride-card-details">${event.details}</div>` : ''}
        </div>
      `;
    });
    // Навешиваем обработчики удаления
    setTimeout(() => {
      document.querySelectorAll('.ride-card-del').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const card = btn.closest('.ride-card');
          const id = card.getAttribute('data-ride-id');
          if (!id) return;
          if (!confirm('Удалить этот заезд?')) return;
          fetch('/api/rides/' + id, { method: 'DELETE' })
            .then(() => {
              card.classList.add('ride-card-hide');
              setTimeout(() => {
                card.remove();
                loadAndRenderNextRides();
              }, 370);
            });
        };
      });
    }, 0);
    // После вывода заездов — выводим погоду
    renderWeatherBlock();
  } catch (e) {
    container.innerHTML += '<div style="color:#e53935;">Ошибка загрузки заездов</div>';
  }
}

// --- Прогноз погоды на неделю для Кипра и Тродоса с табами ---
async function renderWeatherBlock() {
  // Создаём контейнер для табов и погодных блоков
  let tabsWrap = document.getElementById('weather-tabs-wrap');
  if (!tabsWrap) {
    tabsWrap = document.createElement('div');
    tabsWrap.id = 'weather-tabs-wrap';
    tabsWrap.style.marginBottom = '1.5em';
    const main = document.querySelector('.main');
    if (main) main.appendChild(tabsWrap);
  }
  tabsWrap.innerHTML = `
    <div class="weather-tabs">
      <button class="weather-tab weather-tab-active" data-tab="coast">Coast</button>
      <button class="weather-tab" data-tab="mountain">Mountains</button>
    </div>
    <div id="weather-week-block" class="weather-week-block"></div>
    <div id="weather-troodos-block" class="weather-week-block" style="display:none;"></div>
  `;

  // Вспомогательная функция для отрисовки погодного блока
  async function renderWeatherForPlace({lat, lon, blockId}) {
    let block = document.getElementById(blockId);
    if (!block) return;
    block.innerHTML = '';
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,uv_index_max&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const days = data.daily;
      if (!days || !days.time) throw new Error('Нет данных');
      function weatherEmoji(code) {
        if (code === 0) return '☀️';
        if ([1,2,3].includes(code)) return '⛅';
        if ([45,48].includes(code)) return '🌫️';
        if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
        if ([71,73,75,77,85,86].includes(code)) return '🌨️';
        if ([95,96,99].includes(code)) return '⛈️';
        return '❓';
      }
      block.innerHTML += '<div class="weather-week-cards">' +
        days.time.map((date, i) => {
          const tmax = days.temperature_2m_max[i];
          const tmin = days.temperature_2m_min[i];
          const prec = days.precipitation_sum[i];
          const wind = days.wind_speed_10m_max[i];
          const code = days.weather_code[i];
          const uv = days.uv_index_max ? days.uv_index_max[i] : null;
          const dateStr = new Date(date).toLocaleDateString('ru-RU', {weekday:'short', day:'numeric', month:'short'});
          const dateStrCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
          return `<div class='weather-card total-card'>
            <div class='weather-card-date'>${dateStrCap}</div>
            <div class='weather-card-emoji'>${weatherEmoji(code)}</div>
            <div class='weather-card-temp metric-value'><span class='big-number'>${Math.round(tmax)}°</span><span class='unit'>/${Math.round(tmin)}°</span> </div>
            <div class='weather-card-meta'>Осадки: <b>${prec} мм</b></div>
            <div class='weather-card-meta'>Ветер: <b>${wind} м/с</b></div>
            <div class='weather-card-meta'>UV: <b>${uv !== null ? uv : '—'}</b></div>
          </div>`;
        }).join('') + '</div>';
    } catch (e) {
      block.innerHTML += '<div style="color:#e53935;">Ошибка загрузки прогноза погоды</div>';
    }
    return block;
  }

  // Основной блок — Кипр (Nicosia)
  await renderWeatherForPlace({
    lat: 35.1264,
    lon: 33.4299,
    blockId: 'weather-week-block'
  });
  // Второй блок — Тродос
  await renderWeatherForPlace({
    lat: 34.9333,
    lon: 32.8667,
    blockId: 'weather-troodos-block'
  });

  // Логика табов
  const tabBtns = tabsWrap.querySelectorAll('.weather-tab');
  const coastBlock = document.getElementById('weather-week-block');
  const mountainBlock = document.getElementById('weather-troodos-block');
  tabBtns.forEach(btn => {
    btn.onclick = function() {
      tabBtns.forEach(b => b.classList.remove('weather-tab-active'));
      btn.classList.add('weather-tab-active');
      if (btn.dataset.tab === 'coast') {
        coastBlock.style.display = '';
        mountainBlock.style.display = 'none';
      } else {
        coastBlock.style.display = 'none';
        mountainBlock.style.display = '';
      }
    };
  });

  // --- Блок: bike garage ---
  let gridBlock = document.getElementById('bike-garage-block');
  if (!gridBlock) {
    gridBlock = document.createElement('div');
    gridBlock.id = 'bike-garage-block';
    gridBlock.className = 'bike-garage-block';
    const main = document.querySelector('.main');
    const hero = document.getElementById('hero-track-banner');
    if (main && hero) {
      main.insertBefore(gridBlock, hero.nextSibling);
    }
  }
  // Динамически подгружаем изображения garage
  async function renderGarageImages() {
    const res = await fetch('/api/garage/positions');
    const pos = await res.json();
    gridBlock.innerHTML = `
      <div class="bike-garage-title">Bike garage</div>
      <div class="bike-garage-flex">
        <div class="bike-garage-right">
          <div class="bike-garage-right-top" style="background:${pos['left-top'] ? `url('img/garage/${pos['left-top']}') center/cover` : '#f4f6fa'};display:flex;align-items:center;justify-content:center;color:#aaa;">
            ${pos['left-top'] ? '' : 'No image'}
          </div>
          <div class="bike-garage-right-bottom" style="background:${pos['left-bottom'] ? `url('img/garage/${pos['left-bottom']}') center/cover` : '#f4f6fa'};display:flex;align-items:center;justify-content:center;color:#aaa;">
            ${pos['left-bottom'] ? '' : 'No image'}
          </div>
        </div>
        <div class="bike-garage-left">
          <div class="bike-garage-left-block" style="display:flex;align-items:center;justify-content:center;color:#aaa;">
            ${pos['right'] ? `<img src="img/garage/${pos['right']}" alt="Bike" class="bike-garage-img" />` : 'Upload images in admin'}
          </div>
        </div>
      </div>
    `;
  }
  renderGarageImages();
}

if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
  window.addEventListener('DOMContentLoaded', loadAndRenderNextRides);
}

// --- Проверка наличия токена Strava и показ модалки ---
(async function checkStravaAuth() {
  try {
    const res = await fetch('/strava-auth-status');
    const data = await res.json();
    if (!data.hasToken) {
      // Создаём модалку
      let modal = document.getElementById('strava-auth-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'strava-auth-modal';
        modal.style.cssText = 'position:fixed;z-index:2000;left:0;top:0;width:100vw;height:100vh;background:rgba(34,34,34,0.32);display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `
          <div style="background:#fff;max-width:420px;padding:2em 2em 1.5em 2em;box-shadow:0 8px 32px 0 rgba(0,0,0,0.18);position:relative;text-align:center;">
            <h2 style='margin-top:0'>Требуется авторизация Strava</h2>
            <p>Для загрузки и анализа тренировок подключите Strava.</p>
            <a href="https://www.strava.com/oauth/authorize?client_id=165560&response_type=code&redirect_uri=http://localhost:8080/exchange_token&approval_prompt=force&scope=activity:read_all" style="display:inline-block;background:#274DD3;color:#fff;padding:0.7em 1.5em;border:none;border-radius:4px;font-size:1.1em;font-weight:600;cursor:pointer;text-decoration:none;margin-top:1.2em;">Получить данные Strava</a>
          </div>
        `;
        document.body.appendChild(modal);
      }
    }
  } catch (e) { /* ignore */ }
})(); 