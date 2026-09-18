// Analytics domain business logic (T-4.1): `/api/analytics/summary`'s
// aggregation and the VO2max-for-period helper. Extracted out of server.js
// — both functions here are also still called directly (in-process) by
// code that stayed in server.js (goals/meta-goals/`updateUserGoals`), which
// is exactly why they were pulled out of the route handler in the first
// place (T-3.4, S-26): so those callers don't need to make an HTTP request
// back to this same server for data already available in-process (the old
// `axios.get('http://localhost:${PORT}/api/analytics/summary', ...)`
// self-call, with its own auth-header threading and network round trip,
// was removed then — nothing in this module makes that call).
const { pool } = require('../db');
const logger = require('../lib/logger');
const stravaTokens = require('../services/strava/tokens');
const stravaActivities = require('../services/strava/activities');
const { estimateVO2maxFromActivities, powerStatsForActivities } = require('@bikelab/shared/calc');
const { getPlanFromProfile } = require('../trainingPlans');

// Computes the /api/analytics/summary payload. `query` is the same shape as
// `req.query` (year/period/userId), defaulting to none of those set.
async function computeAnalyticsSummary(userId, query = {}) {
    const filterYear = query.year ? parseInt(query.year) : null;
    let periodParam = query.period || '4w';
    // Получаем все поездки: Strava + ручные
    let activities = [];
    // Strava
    try {
      const stravaActivitiesList = await stravaActivities.getActivities(userId);
      activities = activities.concat(stravaActivitiesList);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('[analytics/summary] could not load Strava activities:', err.message);
      }
    }
    // Ручные
    const manualResult = await pool.query('SELECT * FROM rides WHERE user_id = $1', [userId]);
    activities = activities.concat(manualResult.rows);

    // ВАЖНО: Фильтрация только велосипедных активностей (Ride и VirtualRide)
    // Strava активности уже отфильтрованы при загрузке, но ручные могут быть любого типа
    activities = activities.filter(a => !a.type || ['Ride', 'VirtualRide'].includes(a.type));

    // Фильтрация по userId, если есть
    if (query.userId) {
      activities = activities.filter(a => !a.userId || a.userId == query.userId);
    }
    // --- Новое: фильтрация по году ---
    let isAllYears = false;
    let yearOnly = false;
    if (query.year === 'all') {
      isAllYears = true;
      // не фильтруем по году
      if (!query.period) {
        // Если выбран все годы и не указан период — вернуть все активности
        periodParam = 'all';
      }
    } else if (filterYear) {
      activities = activities.filter(a => a.start_date && new Date(a.start_date).getFullYear() === filterYear);
      // Если явно НЕ передан period, то это запрос на весь год
      if (!query.period) yearOnly = true;
    }

    // Activities loaded from cache
    if (!activities.length) return { summary: null };

    // --- Новое: фильтрация по period ---
    let filtered = activities;
    const now = new Date();
    let periodStart = null, periodEnd = null;
    if (yearOnly) {
      // Только год, без периода — весь год
      periodStart = new Date(filterYear, 0, 1);
      periodEnd = new Date(filterYear, 11, 31, 23, 59, 59, 999);
      filtered = activities; // уже отфильтрованы по году
    } else if (periodParam === '4w') {
      // === Новый расчёт календарного 4-недельного блока ===
      // 1. Найти ближайший прошедший понедельник (или сегодня, если сегодня понедельник)
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = nowDate.getDay(); // 0=вс, 1=пн, ...
      const daysSinceMonday = (dayOfWeek + 6) % 7; // 0=пн, 6=вс
      // 2. Найти номер недели в году (ISO week)
      function getISOWeek(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
      }
      const isoWeek = getISOWeek(nowDate);
      // 3. Определить номер 4-недельного блока (1,2,3...)
      const blockNum = Math.floor((isoWeek - 1) / 4);
      // 4. Найти первый понедельник этого блока
      const firstMonday = new Date(nowDate);
      firstMonday.setDate(firstMonday.getDate() - daysSinceMonday - ((isoWeek - 1) % 4) * 7);
      // 5. Начало периода — этот понедельник, конец — через 28 дней (воскресенье включительно)
      periodStart = new Date(firstMonday);
      periodEnd = new Date(firstMonday);
      periodEnd.setDate(periodEnd.getDate() + 27); // 28 дней
      // 6. Фильтруем активности по этому периоду
      filtered = activities.filter(a => {
        const d = new Date(a.start_date);
        return d >= periodStart && d <= periodEnd;
      });
      // Period calculation for plan-fact-hero
      // Filtered activities for current period
    } else if (periodParam === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
      periodStart = threeMonthsAgo;
      periodEnd = now;
    } else if (periodParam === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > yearAgo);
      periodStart = yearAgo;
      periodEnd = now;
    } else if (periodParam === 'all') {
      filtered = activities;
      if (filtered.length) {
        periodStart = new Date(Math.min(...filtered.map(a => new Date(a.start_date))));
        periodEnd = new Date(Math.max(...filtered.map(a => new Date(a.start_date))));
      }
    }



    // Аналитика по filtered (аналогично текущей логике)
    const totalRides = filtered.length;
    const totalTimeH = filtered.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
    const totalCalories = filtered.reduce((sum, a) => {
      const hr = a.average_heartrate || 0;
      const t = (a.moving_time || 0) / 3600;
      return sum + t * (hr >= 140 ? 850 : 600);
    }, 0);
    const carbsPerHour = 35;
    const totalCarbs = totalTimeH * carbsPerHour;
    const totalWater = totalTimeH * 0.6;
    const totalElev = filtered.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
    const totalMovingSec = filtered.reduce((sum, a) => sum + (a.moving_time || 0), 0);
    const totalKm = filtered.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const avgSpeed = totalMovingSec > 0 ? (totalKm / (totalMovingSec / 3600)) : null;
    let longest = null;
    filtered.forEach(a => {
      if (!longest || (a.distance || 0) > (longest.distance || 0)) longest = a;
    });
    let longestStats = null;
    if (longest) {
      const distKm = (longest.distance || 0) / 1000;
      const timeH = (longest.moving_time || 0) / 3600;
      const hr = longest.average_heartrate || 0;
      const cal = timeH * (hr >= 140 ? 850 : 600);
      const carbs = timeH * carbsPerHour;
      const water = timeH * 0.6;
      const gels = Math.ceil((carbs * 0.7) / 25);
      const bars = Math.ceil((carbs * 0.7) / 40);
      longestStats = { distKm, timeH, cal, carbs, water, gels, bars, name: longest.name, date: longest.start_date };
    }
    // Среднее число тренировок в неделю (за период)
    let avgPerWeek = 0;
    if (periodParam === 'year' || periodParam === 'all') {
      avgPerWeek = +(totalRides / 52).toFixed(2);
    } else if (periodParam === '3m') {
      avgPerWeek = +(totalRides / 13).toFixed(2);
    } else {
      avgPerWeek = +(totalRides / 4).toFixed(2);
    }
    // Количество длинных поездок (>50км или >2.5ч)
    const longRidesCount = filtered.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
    // Количество интервальных тренировок (по названию/type)
    const intervalsCount = filtered.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval'))).length;

    // Анализ высокоинтенсивного времени (≥160 BPM ≥120 сек подряд)
    let highIntensityTimeMin = 0;
    let highIntensityIntervals = 0;
    let highIntensitySessions = 0;

    // Простой анализ по среднему пульсу (так как streams данные недоступны на сервере)
    for (const act of filtered) {
      if (act.average_heartrate && act.average_heartrate >= 160 && act.moving_time && act.moving_time >= 120) {
        // Если средний пульс ≥160 и время ≥2 минуты, считаем это интервалом
        highIntensityTimeMin += Math.round(act.moving_time / 60);
        highIntensityIntervals++;
        highIntensitySessions++;
      }
    }

    // Получаем профиль пользователя для персонализации плана
    let userProfile = null;
    try {
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      if (profileResult.rows.length > 0) {
        userProfile = profileResult.rows[0];
      }
    } catch (error) {
      logger.warn('Could not fetch user profile for plan calculation:', error);
    }

    // Получаем персонализированный план
    const plan = getPlanFromProfile(userProfile);
    const progress = {
      rides: Math.round(totalRides / plan.rides * 100),
      km: Math.round(totalKm / plan.km * 100),
      long: Math.round(longRidesCount / plan.long * 100),
      intervals: Math.round(intervalsCount / plan.intervals * 100)
    };
    // Время по пульсовым зонам (Z2, Z3, Z4, другое)
    let z2 = 0, z3 = 0, z4 = 0, other = 0;
    filtered.forEach(a => {
      if (!a.average_heartrate || !a.moving_time) return;
      const hr = a.average_heartrate;
      const t = a.moving_time / 60; // минуты
      if (hr >= 109 && hr < 127) z2 += t;
      else if (hr >= 127 && hr < 145) z3 += t;
      else if (hr >= 145 && hr < 163) z4 += t;
      else other += t;
    });
    const zones = { z2: Math.round(z2), z3: Math.round(z3), z4: Math.round(z4), other: Math.round(other) };
    function estimateFTP(acts) { return null; }
    // Для VO2max используем плавающие периоды, как в goals cache
    let vo2maxActivities = filtered;
    if (periodParam === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
      // Rolling 28 days VO2max calculation
    } else if (periodParam === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
      // Rolling 3 months VO2max calculation
    } else if (periodParam === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
      // Rolling year VO2max calculation
    }

    // Single shared VO2max implementation (T-3.2) — `windowDays: null` since
    // `vo2maxActivities` above is already period-filtered by this route.
    const vo2max = estimateVO2maxFromActivities(vo2maxActivities, userProfile, { windowDays: null }).vo2max;
    // VO2max calculated for analytics summary
    // User profile loaded for calculations
    const ftp = estimateFTP(filtered);

    // T-3.5: power stats over the same `filtered` (period-scoped) activity
    // set, reusing each activity's persisted `estimated_power` (set by
    // services/power.js during getActivities()) rather than recomputing —
    // no extra weather calls happen here.
    const power = powerStatsForActivities(filtered, {
      riderWeightKg: parseFloat(userProfile?.weight) || 75,
      bikeWeightKg: parseFloat(userProfile?.bike_weight) || 8,
    });

    return {
      summary: {
        totalCalories: Math.round(totalCalories),
        totalTimeH: +totalTimeH.toFixed(1),
        totalCarbs: Math.round(totalCarbs),
        totalWater: +totalWater.toFixed(1),
        totalRides,
        longestRide: longestStats,
        avgPerWeek,
        longRidesCount,
        intervalsCount,
        highIntensityTimeMin,
        highIntensityIntervals,
        highIntensitySessions,
        progress,
        plan, // Добавляем план в ответ
        zones,
        totalKm: Math.round(totalKm),
        totalElev: Math.round(totalElev),
        totalMovingHours: +(totalMovingSec / 3600).toFixed(1),
        avgSpeed: avgSpeed !== null ? +avgSpeed.toFixed(1) : null,
        vo2max,
        ftp,
        power: {
          avg: power.avg,
          best: power.best,
          worst: power.worst,
          trend: power.trend,
          totalActivities: power.totalActivities,
          activitiesWithRealPower: power.activitiesWithRealPower,
          activitiesWithWindData: power.activitiesWithWindData,
        }
      },
      period: {
        start: periodStart,
        end: periodEnd
      }
    };
}

// Функция для вычисления VO2max для конкретного периода
async function calculateVO2maxForPeriod(userId, period) {
  try {


    // Получаем активности через общий сервис (кэш/БД/Strava) — раньше эта
    // функция при промахе кэша делала свой собственный, нефильтрованный по
    // типу и обрезанный до 100 штук запрос к Strava и писала его ПРЯМО в
    // activitiesCache, тем самым отравляя кэш для goals/bike-health/
    // achievements неполными данными (S-23). Теперь единственный писатель в
    // activitiesCache — services/strava/activities.js.
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('Could not load activities for VO2max calculation:', err.message);
      }
    }
    if (activities.length === 0) {
      logger.error(`❌ No activities available for VO₂max calculation for user ${userId}`);
      return null;
    }

    // Получаем профиль пользователя
    let userProfile = null;
    try {
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      if (profileResult.rows.length > 0) {
        userProfile = profileResult.rows[0];
      } else {
        logger.warn(`⚠️ No user profile found for user ${userId}`);
      }
    } catch (error) {
      logger.warn('Could not fetch user profile for VO2max calculation:', error);
    }

    // Фильтруем по периоду
    let filteredActivities = activities;
    const now = new Date();

    if (period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }

    if (filteredActivities.length === 0) {
      logger.warn(`⚠️ No activities found for period ${period}, returning null`);
      return null;
    }



    // Single shared VO2max implementation (T-3.2, docs/audit/00-AUDIT-AND-PLAN.md
    // T-3.2) — `windowDays: null` since `filteredActivities` above is already
    // period-filtered by this function.
    const vo2max = estimateVO2maxFromActivities(filteredActivities, userProfile, { windowDays: null }).vo2max;


    // VO2max calculation completed
    return vo2max;
  } catch (error) {
    // pino's `err` serializer already includes message + stack, so this
    // replaces both the old summary log and the separate "Error details" one.
    logger.error({ err: error }, '❌ Error calculating VO2max for period:');
    return null;
  }
}

module.exports = { computeAnalyticsSummary, calculateVO2maxForPeriod };
