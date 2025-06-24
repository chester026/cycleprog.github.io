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
  const avgSpeed = totalTime > 0 ? totalKm / totalTime : 0;

  // 2. Количество тренировок и средняя длина
  const count = recent.length;
  const avgKm = count ? totalKm / count : 0;

  // 3. Самая длинная тренировка
  const maxDist = Math.max(...recent.map(a => a.distance || 0)) / 1000;

  // 4. Количество дней с тренировками
  const days = new Set(recent.map(a => (a.start_date || '').slice(0,10)));

  // 5. Есть ли интервалы (по наличию type=interval или коротких интенсивных тренировок)
  const intervals = recent.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.type && a.type.toLowerCase().includes('interval')));

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
  html += `• <b>Средняя скорость:</b> ${formatNumber(avgSpeed)} км/ч<br>`;
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
  if (easyRides.length < 2) html += '• Не забывайте про восстановительные тренировки.<br>';
  if (last2km < prev2km) html += '• Объём за последние 2 недели снизился — проверьте причины (усталость, болезнь, мотивация).<br>';
  if (last2km > prev2km) html += '• Объём растёт — хорошо! Следите за самочувствием и не забывайте про восстановление.<br>';
  if (avgSpeed < 22 && totalKm > 100) html += '• Средняя скорость низкая — поработайте над техникой и интервальными тренировками.<br>';
  if (totalElev < 2000) html += '• Добавьте тренировки с набором высоты для подготовки к горным гонкам.<br>';

  if (html.endsWith('<b>Рекомендации:</b><br>')) html += '• Продолжайте в том же духе!<br>';

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
  const days = [
    { day: 'Понедельник', type: 'Восстановительная', desc: 'Лёгкая езда 40–60 мин, каденс 90–100, пульс Z1–Z2' },
    { day: 'Вторник', type: 'Мощность', desc: 'Интервалы: 4×4 мин в Z5, отдых 4 мин, каденс 85–95' },
    { day: 'Четверг', type: 'Каденс/техника', desc: '1–1.5 ч, упражнения на высокий каденс, одностороннее педалирование, пульс Z2' },
    { day: 'Суббота', type: 'Эндюранс', desc: 'Длительная поездка 2–4 ч, пульс Z2–Z3, набор высоты' }
  ];
  let html = '<table class="plan-table"><thead><tr><th>День</th><th>Тип</th><th>Описание</th></tr></thead><tbody>';
  days.forEach(d => {
    html += `<tr><td>${d.day}</td><td>${d.type}</td><td>${d.desc}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('week-plan').innerHTML = html;
}

function renderMonthPlan() {
  let html = '<table class="plan-table"><thead><tr><th>Неделя</th><th>Фокус</th><th>Ключевые тренировки</th></tr></thead><tbody>';
  html += '<tr><td>1</td><td>Базовая выносливость, техника</td><td>3–4 тренировки: 1× эндюранс, 1× мощность, 1× каденс, 1× восстановительная</td></tr>';
  html += '<tr><td>2</td><td>Интервалы, развитие мощности</td><td>3–4 тренировки: 2× интервалы, 1× эндюранс, 1× восстановительная</td></tr>';
  html += '<tr><td>3</td><td>Длительные поездки, набор высоты</td><td>3–4 тренировки: 2× эндюранс, 1× мощность, 1× восстановительная</td></tr>';
  html += '<tr><td>4</td><td>Смешанная неделя, восстановление</td><td>2–3 тренировки: 1× интервалы, 1× эндюранс, 1× восстановительная</td></tr>';
  html += '</tbody></table>';
  document.getElementById('month-plan').innerHTML = html;
}

function renderAnalysisCards(activities) {
  // Анализ за 4 недели
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  const totalElev = recent.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
  const totalTime = recent.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
  const avgSpeed = totalTime > 0 ? totalKm / totalTime : 0;
  const count = recent.length;
  const avgKm = count ? totalKm / count : 0;
  const maxDist = Math.max(...recent.map(a => a.distance || 0)) / 1000;
  const days = new Set(recent.map(a => (a.start_date || '').slice(0,10)));
  const intervals = recent.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.type && a.type.toLowerCase().includes('interval')));
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
    {label:'Средняя скорость', value:`${formatNumber(avgSpeed)} км/ч`},
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

function renderGoalProgress(activities) {
  // 1. Средняя скорость на равнине (flat)
  // Новый фильтр: набор < 0.5% дистанции, длина > 20 км, скорость < 40 км/ч
  const flats = activities.filter(a => (a.distance||0) > 20000 && (a.total_elevation_gain||0) < (a.distance||0)*0.005 && (a.average_speed||0)*3.6 < 40);
  const flatSpeeds = flats.map(a => (a.average_speed||0)*3.6);
  const medianFlatSpeed = median(flatSpeeds);
  const flatSpeedGoal = 30;
  let flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed/flatSpeedGoal*100));

  // 2. Средняя скорость на подъёмах (hill)
  // Новый фильтр: набор > 2% дистанции, длина > 5 км, скорость < 20 км/ч
  const hills = activities.filter(a => (a.distance||0) > 5000 && (a.total_elevation_gain||0) > (a.distance||0)*0.02 && (a.average_speed||0)*3.6 < 20);
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
  const longRides = activities.filter(a => (a.distance||0) > 60000 || (a.moving_time||0) > 2.5*3600);
  let longRidePct = Math.min(100, Math.round(longRides.length/4*100));
  document.getElementById('goal-long-ride').innerHTML = progressBar(longRidePct, `${longRides.length} за 4 недели`);

  // 6. Интервалы (по названию или типу)
  const intervals = activities.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.type && a.type.toLowerCase().includes('interval')));
  let intervalsPct = Math.min(100, Math.round(intervals.length/4*100));
  document.getElementById('goal-intervals').innerHTML = progressBar(intervalsPct, `${intervals.length} за 4 недели`);

  // 7. Восстановительные тренировки (короткие, низкая скорость)
  const easyRides = activities.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);
  let easyPct = Math.min(100, Math.round(easyRides.length/4*100));
  document.getElementById('goal-recovery').innerHTML = progressBar(easyPct, `${easyRides.length} за 4 недели`);

  // 8. Питание и гидратация — не анализируем, просто выводим "Тренировать!"
  document.getElementById('goal-nutrition').innerHTML = 'Тренировать!';
}

fetch('/activities')
  .then(res => res.json())
  .then(activities => {
    renderGoalProgress(activities);
    renderWeekPlan();
    renderMonthPlan();
    // Вывод среднего числа тренировок в неделю
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
    } else {
      document.getElementById('avg-per-week').textContent = '';
    }
    renderPeriodSummary(activities);
  })
  .catch(() => {
    renderWeekPlan();
    renderMonthPlan();
    document.getElementById('avg-per-week').textContent = '';
    document.getElementById('period-summary').innerHTML = '';
    document.getElementById('period-summary-title').textContent = '';
  });

function renderPeriodSummary(activities) {
  if (!activities.length) {
    document.getElementById('period-summary').innerHTML = '';
    document.getElementById('period-summary-title').textContent = '';
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
    const intervals = period.filter(a => (a.name||'').toLowerCase().includes('интервал') || (a.type && a.type.toLowerCase().includes('interval')));
    let intervalsPct = Math.min(100, Math.round(intervals.length/4*100));
    const easyRides = period.filter(a => (a.distance||0) < 20000 && (a.average_speed||0)*3.6 < 20);
    let easyPct = Math.min(100, Math.round(easyRides.length/4*100));
    const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, intervalsPct, easyPct];
    const avg = Math.round(all.reduce((a,b)=>a+b,0)/all.length);
    return {avg, all, start: period[period.length-1]?.start_date, end: period[0]?.start_date};
  }
  const summary = periods.map(percentForPeriod);
  let html = `<table class='plan-table'><thead><tr><th>Период</th><th>Средний % выполнения</th><th>Детализация</th></tr></thead><tbody>`;
  summary.forEach((s,i) => {
    const start = s.start ? new Date(s.start).toLocaleDateString() : '';
    const end = s.end ? new Date(s.end).toLocaleDateString() : '';
    html += `<tr><td>${start} – ${end}</td><td style='font-weight:700;color:#ff6600;'>${s.avg}%</td><td>${s.all.join('% / ')}%</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('period-summary-title').textContent = 'Прогресс по 4-недельным периодам';
  document.getElementById('period-summary').innerHTML = html;
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggle-period-summary');
  const content = document.getElementById('period-summary');
  content.style.display = 'none';
  btn.textContent = '►';
  btn.onclick = function() {
    if (content.style.display === 'none') {
      content.style.display = '';
      btn.textContent = '▼';
    } else {
      content.style.display = 'none';
      btn.textContent = '►';
    }
  };
}); 