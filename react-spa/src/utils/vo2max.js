// Анализ времени в зоне >=160 подряд >=120 сек
export function analyzeHighIntensityTime(activities, periodDays = 28) {
  const now = new Date();
  const periodAgo = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const filtered = activities.filter(a => new Date(a.start_date) > periodAgo);

  let totalIntervals = 0;
  let totalTimeSec = 0;
  let highIntensitySessions = 0;

  for (const act of filtered) {
    let streams = null;
    const cacheKey = `streams_${act.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      streams = JSON.parse(cached);
    } else {
      // Нет данных — пропускаем
      continue;
    }
    const hr = streams.heartrate?.data || [];
    let intervals = 0;
    let inInt = false, startIdx = 0;
    let sessionHasInt = false;
    for (let i = 0; i < hr.length; i++) {
      const h = hr[i] || 0;
      if (h >= 160) {
        if (!inInt) { inInt = true; startIdx = i; }
      } else {
        if (inInt && (i - startIdx) >= 120) {
          intervals++;
          totalTimeSec += (i - startIdx);
          sessionHasInt = true;
        }
        inInt = false;
      }
    }
    if (inInt && (hr.length - startIdx) >= 120) {
      intervals++;
      totalTimeSec += (hr.length - startIdx);
      sessionHasInt = true;
    }
    totalIntervals += intervals;
    if (sessionHasInt) highIntensitySessions++;
  }
  const totalTimeMin = Math.round(totalTimeSec / 60);
  return { totalTimeMin, totalIntervals, highIntensitySessions };
} 