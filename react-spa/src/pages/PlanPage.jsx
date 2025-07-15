import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import './PlanPage.css';
import HeartRateZonesChart from '../components/HeartRateZonesChart';
import '../components/HeartRateZonesChart.css';
import ProgressChart from '../components/ProgressChart';
import '../components/ProgressChart.css';
import HRZonesChart from '../components/HRZonesChart';
import '../components/HRZonesChart.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
import { analyzeHighIntensityTime } from '../utils/vo2max';


export default function PlanPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('4w');
  const [heroImage, setHeroImage] = useState(null);
  const [vo2maxData, setVo2maxData] = useState({
    auto: null,
    manual: null,
    testTime: '',
    testHR: '',
    weight: '',
    age: '',
    gender: 'male',
    highIntensityData: null
  });

  useEffect(() => {
    const loadData = async () => {
      await fetchActivities();
      await fetchHeroImage();
    };
    loadData();
  }, []);

  useEffect(() => {
    if (activities.length > 0) {
      // Анализируем интервалы
      const loadIntervals = async () => {
        const intervals = await analyzeIntervals(activities);
        setLastRealIntervals(intervals);
      };
      loadIntervals();
      // Рассчитываем VO2max автоматически
      calculateAutoVO2max();
    }
  }, [activities]);

  // Автоматический расчёт VO2max на основе данных Strava
  const calculateAutoVO2max = () => {
    if (!activities.length) return;
    
    // Берём последние 4 недели
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    
    if (!recent.length) return;
    
    // Базовые показатели
    const bestSpeed = Math.max(...recent.map(a => (a.average_speed || 0) * 3.6));
    const avgHR = recent.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / recent.filter(a => a.average_heartrate).length;
    
    // Новый анализ по секундным данным
    const { totalTimeMin, highIntensitySessions } = analyzeHighIntensityTime(activities, 28);
    
    // Базовый VO2max
    let baseVO2max = (bestSpeed * 1.2) + (avgHR * 0.05);
    
    // Бонус за интервалы
    let intensityBonus = 0;
    if (totalTimeMin >= 120) intensityBonus = 4;
    else if (totalTimeMin >= 60) intensityBonus = 2.5;
    else if (totalTimeMin >= 30) intensityBonus = 1;
    if (highIntensitySessions >= 6) intensityBonus += 1.5;
    else if (highIntensitySessions >= 3) intensityBonus += 0.5;
    
    const estimatedVO2max = Math.min(80, Math.max(30, Math.round(baseVO2max + intensityBonus)));
    
    setVo2maxData(prev => ({
      ...prev,
      auto: estimatedVO2max,
      highIntensityData: {
        time: totalTimeMin,
        percent: null,
        sessions: highIntensitySessions
      }
    }));
  };
  
  // Ручной расчёт VO2max по формуле Джексона-Поллока
  const calculateManualVO2max = () => {
    const { testTime, testHR, weight, age, gender } = vo2maxData;
    
    if (!testTime || !testHR || !weight || !age) return;
    
    const time = parseFloat(testTime);
    const hr = parseFloat(testHR);
    const w = parseFloat(weight);
    const a = parseFloat(age);
    const g = gender === 'male' ? 1 : 0;
    
    // Формула Джексона-Поллока
    const vo2max = 132.853 - (0.0769 * w) - (0.3877 * a) + (6.315 * g) - (3.2649 * time) - (0.1565 * hr);
    
    setVo2maxData(prev => ({
      ...prev,
      manual: Math.round(vo2max)
    }));
  };
  
  const handleVO2maxInput = (field, value) => {
    setVo2maxData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const fetchActivities = async () => {
    try {
      // Сначала проверяем кэш
      const cachedActivities = cacheUtils.get(CACHE_KEYS.ACTIVITIES);
      if (cachedActivities && cachedActivities.length > 0) {
        setActivities(cachedActivities);
        setLoading(false);
        return;
      }

      const response = await fetch('/activities');
      
      if (response.status === 429) {
        console.warn('Rate limit exceeded, using cached data if available');
        setError('Слишком много запросов. Попробуйте позже.');
        setLoading(false);
        return;
      }
      
      if (!response.ok) throw new Error('Failed to fetch activities');
      
      const data = await response.json();
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(CACHE_KEYS.ACTIVITIES, data, 30 * 60 * 1000);
      
      setActivities(data);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHeroImage = async () => {
    try {
      const imageFilename = await heroImagesUtils.getHeroImage('plan');
      if (imageFilename) {
        setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
      }
    } catch (error) {
      console.error('Error loading hero image:', error);
    }
  };

  const handlePeriodChange = (e) => {
    setSelectedPeriod(e.target.value);
  };

  // Функция для расчета медианы
  const median = (arr) => {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // Функция для форматирования чисел
  const formatNumber = (n, digits = 1) => {
    return n ? n.toFixed(digits).replace(/\.0+$/, '') : '—';
  };

  // Функция для расчета процентов выполнения за период
  const percentForPeriod = (period) => {
    const flats = period.filter(a => (a.distance || 0) > 20000 && (a.total_elevation_gain || 0) < (a.distance || 0) * 0.005 && (a.average_speed || 0) * 3.6 < 40);
    const flatSpeeds = flats.map(a => (a.average_speed || 0) * 3.6);
    const medianFlatSpeed = median(flatSpeeds);
    const flatSpeedGoal = 30;
    let flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed / flatSpeedGoal * 100));

    const hills = period.filter(a => (a.distance || 0) > 5000 && (a.total_elevation_gain || 0) > (a.distance || 0) * 0.02 && (a.average_speed || 0) * 3.6 < 20);
    const hillSpeeds = hills.map(a => (a.average_speed || 0) * 3.6);
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

    const longRides = period.filter(a => (a.distance || 0) > 60000 || (a.moving_time || 0) > 2.5 * 3600);
    let longRidePct = Math.min(100, Math.round(longRides.length / 4 * 100));

    const intervals = period.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
    let intervalsPct = Math.min(100, Math.round(intervals.length / 4 * 100));

    const easyRides = period.filter(a => (a.distance || 0) < 20000 && (a.average_speed || 0) * 3.6 < 20);
    let easyPct = Math.min(100, Math.round(easyRides.length / 4 * 100));

    const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, intervalsPct, easyPct];
    const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
    return { avg, all, start: period[period.length - 1]?.start_date, end: period[0]?.start_date };
  };

  // Функция для рендера прогресса по периодам
  const renderPeriodSummary = () => {
    if (!activities.length) return null;

    // Сортируем по дате (от новых к старым)
    const acts = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const periods = [];
    let period = [];
    let periodStart = acts[0] ? new Date(acts[0].start_date) : null;

    for (let i = 0; i < acts.length; ++i) {
      const d = new Date(acts[i].start_date);
      if (period.length && (period.length >= 28 || (periodStart - d) > 27 * 24 * 60 * 60 * 1000)) {
        periods.push(period);
        period = [];
        periodStart = d;
      }
      period.push(acts[i]);
    }
    if (period.length) periods.push(period);

    // Берём только последние 12 периодов (за год)
    const summary = periods
      .map(percentForPeriod)
      .slice(0, 12)
      .reverse(); // чтобы на графике шли от старых к новым

    return summary;
  };

  // Функция для рендера пульсовых зон
  const renderHRZones = () => {
    if (!activities.length) return null;

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

    return { data, labels, colors, total, z2, z3, z4 };
  };

  const periodSummary = renderPeriodSummary();
  const hrZonesData = renderHRZones();



  // Функция для рендера прогресса целей
  const renderGoalProgress = (activities, period = '4w') => {
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

    // 1. Средняя скорость на равнине
    const flats = filtered.filter(a => 
      (a.distance || 0) > 20000 && 
      (a.total_elevation_gain || 0) < (a.distance || 0) * 0.005 && 
      (a.average_speed || 0) * 3.6 < 40
    );
    const flatSpeeds = flats.map(a => (a.average_speed || 0) * 3.6);
    const medianFlatSpeed = median(flatSpeeds);
    const flatSpeedGoal = 30;
    const flatSpeedPct = Math.min(100, Math.round(medianFlatSpeed / flatSpeedGoal * 100));

    // 2. Средняя скорость на подъёмах
    const hills = filtered.filter(a => 
      (a.distance || 0) > 5000 && 
      (a.total_elevation_gain || 0) > (a.distance || 0) * 0.02 && 
      (a.average_speed || 0) * 3.6 < 20
    );
    const hillSpeeds = hills.map(a => (a.average_speed || 0) * 3.6);
    const medianHillSpeed = median(hillSpeeds);
    const hillSpeedGoal = 17.5;
    const hillSpeedPct = Math.floor(Math.min(100, medianHillSpeed / hillSpeedGoal * 100));

    // 3. Пульс
    const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
    const medianFlatHR = median(flatHRs);
    const hillHRs = hills.map(a => a.average_heartrate).filter(Boolean);
    const medianHillHR = median(hillHRs);

    const flatHRZone = medianFlatHR ? 
      (medianFlatHR < 127 ? 'Z2' : medianFlatHR < 145 ? 'Z3' : 'Z4+') : '—';
    const hillHRZone = medianHillHR ? 
      (medianHillHR < 127 ? 'Z2' : medianHillHR < 145 ? 'Z3' : medianHillHR < 163 ? 'Z4' : 'Z5') : '—';

    // Пульсовые зоны для целей
    const flatsInZone = flats.filter(a => 
      a.average_heartrate && a.average_heartrate >= 109 && a.average_heartrate < 145
    ).length;
    const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;
    
    const hillsInZone = hills.filter(a => 
      a.average_heartrate && a.average_heartrate >= 145 && a.average_heartrate < 163
    ).length;
    const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;
    
    const pulseGoalPct = flats.length && hills.length ? 
      Math.round((flatZonePct + hillZonePct) / 2) : (flatZonePct || hillZonePct);

    // 4. Длительные поездки
    const longRides = filtered.filter(a => 
      (a.distance || 0) > 60000 || (a.moving_time || 0) > 2.5 * 3600
    );
    const longRideGoal = 4;
    const longRidePct = Math.min(100, Math.round(longRides.length / longRideGoal * 100));
    
    let longRideLabel = '';
    if (period === 'all') {
      longRideLabel = `${longRides.length} за всё время`;
    } else if (period === '3m') {
      longRideLabel = `${longRides.length} за 3 месяца`;
    } else if (period === 'year') {
      longRideLabel = `${longRides.length} за год`;
    } else {
      longRideLabel = `${longRides.length} за 4 недели`;
    }

    // 5. Интервалы
    const intervals = filtered.filter(a => 
      (a.name || '').toLowerCase().includes('интервал') || 
      (a.name || '').toLowerCase().includes('interval') || 
      (a.type && a.type.toLowerCase().includes('interval'))
    );
    const intervalGoal = 8;
    const intervalPct = Math.min(100, Math.round(intervals.length / intervalGoal * 100));
    
    let intervalLabel = '';
    if (period === 'all') {
      intervalLabel = `${intervals.length} за всё время`;
    } else if (period === '3m') {
      intervalLabel = `${intervals.length} за 3 месяца`;
    } else if (period === 'year') {
      intervalLabel = `${intervals.length} за год`;
    } else {
      intervalLabel = `${intervals.length} за 4 недели`;
    }

    // 6. Восстановление
    const recoveryRides = filtered.filter(a => {
      const dist = (a.distance || 0);
      const speed = (a.average_speed || 0) * 3.6;
      const hr = a.average_heartrate || 0;
      return dist < 20000 || speed < 20 || (hr > 0 && hr < 125);
    });
    const recoveryGoal = 4;
    const recoveryPct = Math.min(100, Math.round(recoveryRides.length / recoveryGoal * 100));
    
    let recoveryLabel = '';
    if (period === 'all') {
      recoveryLabel = `${recoveryRides.length} за всё время`;
    } else if (period === '3m') {
      recoveryLabel = `${recoveryRides.length} за 3 месяца`;
    } else if (period === 'year') {
      recoveryLabel = `${recoveryRides.length} за год`;
    } else {
      recoveryLabel = `${recoveryRides.length} за 4 недели`;
    }

    return {
      flatSpeed: { 
        value: formatNumber(medianFlatSpeed), 
        pct: flatSpeedPct,
        hr: medianFlatHR,
        zone: flatHRZone,
        label: `${formatNumber(medianFlatSpeed)} км/ч, пульс: ${medianFlatHR ? medianFlatHR.toFixed(0) : '—'} (${flatHRZone})`
      },
      hillSpeed: { 
        value: formatNumber(medianHillSpeed), 
        pct: hillSpeedPct,
        hr: medianHillHR,
        count: hills.length,
        label: `${formatNumber(medianHillSpeed)} км/ч, пульс: ${medianHillHR ? medianHillHR.toFixed(0) : '—'}, тренировок: ${hills.length}`
      },
      hr: { 
        flatZone: flatHRZone, 
        hillZone: hillHRZone,
        pct: pulseGoalPct,
        flatZonePct,
        hillZonePct,
        label: `Равнина: ${flatZonePct}%, подъёмы: ${hillZonePct}% в целевых зонах`
      },
      longRide: { count: longRides.length, pct: longRidePct, label: longRideLabel },
      intervals: { count: intervals.length, pct: intervalPct, label: intervalLabel },
      recovery: { count: recoveryRides.length, pct: recoveryPct, label: recoveryLabel }
    };
  };

  const goalProgress = renderGoalProgress(activities, selectedPeriod);

  // Функция для расчета среднего количества тренировок в неделю
  const calculateAvgPerWeek = (activities) => {
    if (!activities.length) return { avg: 0, pct: 0 };
    
    const weeks = {};
    activities.forEach(a => {
      const week = weekNumber(a.start_date);
      if (!weeks[week]) weeks[week] = 0;
      weeks[week] += 1;
    });
    
    const weekKeys = Object.keys(weeks);
    if (weekKeys.length === 0) return { avg: 0, pct: 0 };
    
    const minWeek = Math.min(...weekKeys);
    const maxWeek = Math.max(...weekKeys);
    const avgPerWeek = activities.length / (maxWeek - minWeek + 1);
    const goal = 4;
    const pct = Math.round(Math.min(100, avgPerWeek / goal * 100));
    
    return { avg: avgPerWeek, pct };
  };

  // Функция для рендера карточек plan-fact-hero
  const renderPlanFactHero = (activities, lastRealIntervals) => {
    // Используем даты текущего 4-недельного цикла
    let planCycleMinDate = null, planCycleMaxDate = null;
    if (activities.length) {
      const weekNumbers = activities.map(a => getISOWeekNumber(a.start_date));
      const minWeek = Math.min(...weekNumbers);
      const nowWeek = getISOWeekNumber(new Date());
      const n = Math.floor((nowWeek - minWeek) / 4);
      const startWeekInCycle = minWeek + n * 4;
      const year = new Date().getFullYear();
      function getDateOfISOWeek(week, year) {
        const simple = new Date(year, 0, 1 + (week - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4)
          ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        else
          ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        return ISOweekStart;
      }
      planCycleMinDate = getDateOfISOWeek(startWeekInCycle, year);
      planCycleMaxDate = getDateOfISOWeek(startWeekInCycle + 3, year);
    }
    // Фильтруем тренировки по текущему циклу
    const recent = activities.filter(a => {
      const d = new Date(a.start_date);
      return planCycleMinDate && planCycleMaxDate && d >= planCycleMinDate && d <= planCycleMaxDate;
    });
    const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const count = recent.length;
    const longRides = recent.filter(a => (a.distance || 0) > 60000 || (a.moving_time || 0) > 2.5 * 3600).length;
    const plan = { rides: 12, km: 400, long: 4, intervals: 8 };
    let minDate = planCycleMinDate, maxDate = planCycleMaxDate;
    const data = [
      { label: 'Тренировки', fact: count, plan: plan.rides, pct: Math.round(count / plan.rides * 100) },
      { label: 'Объём, км', fact: Math.round(totalKm), plan: plan.km, pct: Math.round(totalKm / plan.km * 100) },
      { label: 'Длинные', fact: longRides, plan: plan.long, pct: Math.round(longRides / plan.long * 100) },
      { label: 'FTP/VO₂max', fact: lastRealIntervals.count, min: lastRealIntervals.min, plan: lastRealIntervals.label, pct: '', color: lastRealIntervals.color },
    ];
    const formatDate = d => d ? d.toLocaleDateString('ru-RU') : '';
    return { data, minDate, maxDate, formatDate };
  };

  // Функция для расчета номера недели
  const weekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  // Состояние для интервалов
  const [lastRealIntervals, setLastRealIntervals] = useState({ count: 0, min: 0, label: 'Мало', color: '#bdbdbd' });

  // Функция для анализа интервалов
  const analyzeIntervals = async (activities) => {
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const filtered = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    
    let totalIntervals = 0;
    let analyzed = 0;
    let totalTimeSec = 0;
    let rateLimitExceeded = false;
    
    for (const act of filtered) {
      try {
        let streams = null;
        const cacheKey = `streams_${act.id}`;
        
        // Пробуем получить из кэша
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          streams = JSON.parse(cached);
        } else {
          const res = await fetch(`/activities/${act.id}/streams`);
          if (res.status === 429) { 
            rateLimitExceeded = true; 
            break; 
          }
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
            if (inInt && (i - startIdx) >= 120) { 
              intervals++; 
              totalTimeSec += (i - startIdx); 
            }
            inInt = false;
          }
        }
        if (inInt && (hr.length - startIdx) >= 120) { 
          intervals++; 
          totalTimeSec += (hr.length - startIdx); 
        }
        
        totalIntervals += intervals;
        analyzed++;
      } catch (e) {
        // Если ошибка и есть кэш — используем кэш
        const cacheKey = `streams_${act.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const streams = JSON.parse(cached);
          const hr = streams.heartrate?.data || [];
          let intervals = 0;
          let inInt = false, startIdx = 0;
          
          for (let i = 0; i < hr.length; i++) {
            const h = hr[i] || 0;
            if (h >= 160) {
              if (!inInt) { inInt = true; startIdx = i; }
            } else {
              if (inInt && (i - startIdx) >= 120) { 
                intervals++; 
                totalTimeSec += (i - startIdx); 
              }
              inInt = false;
            }
          }
          if (inInt && (hr.length - startIdx) >= 120) { 
            intervals++; 
            totalTimeSec += (hr.length - startIdx); 
          }
          
          totalIntervals += intervals;
          analyzed++;
        } else {
          continue;
        }
      }
    }
    
    const totalTimeMin = Math.round(totalTimeSec / 60);
    
    // Цветовая дифференциация
    let color = '#bdbdbd', label = 'Мало';
    if (totalIntervals >= 15 && totalIntervals < 25) { 
      color = '#4caf50'; 
      label = 'Норма'; 
    }
    else if (totalIntervals >= 25 && totalIntervals < 35) { 
      color = '#ffeb3b'; 
      label = 'Много'; 
    }
    else if (totalIntervals >= 35 && totalIntervals < 45) { 
      color = '#e53935'; 
      label = 'Слишком много'; 
    }
    
    return { count: totalIntervals, min: totalTimeMin, label, color, rateLimitExceeded };
  };

  // Вычисление дат текущего 4-недельного цикла (вынести в начало компонента)
  const planCycleDates = React.useMemo(() => {
    if (!activities.length) return { min: null, max: null };
    const weekNumbers = activities.map(a => getISOWeekNumber(a.start_date));
    const minWeek = Math.min(...weekNumbers);
    const nowWeek = getISOWeekNumber(new Date());
    const n = Math.floor((nowWeek - minWeek) / 4);
    const startWeekInCycle = minWeek + n * 4;
    const year = new Date().getFullYear();
    function getDateOfISOWeek(week, year) {
      const simple = new Date(year, 0, 1 + (week - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = simple;
      if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
      else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
      return ISOweekStart;
    }
    return {
      min: getDateOfISOWeek(startWeekInCycle, year),
      max: getDateOfISOWeek(startWeekInCycle + 3, year)
    };
  }, [activities]);
  const planCycleMinDate = planCycleDates.min;
  const planCycleMaxDate = planCycleDates.max;

  // Новый расчёт среднего числа тренировок в неделю по текущему 4-недельному циклу
  let avgPerWeek = { avg: 0, pct: 0 };
  if (activities.length && planCycleMinDate && planCycleMaxDate) {
    const recent = activities.filter(a => {
      const d = new Date(a.start_date);
      return d >= planCycleMinDate && d <= planCycleMaxDate;
    });
    avgPerWeek.avg = +(recent.length / 4).toFixed(2);
    avgPerWeek.pct = Math.round(Math.min(100, avgPerWeek.avg / 4 * 100));
  }
  const planFactHero = renderPlanFactHero(activities, lastRealIntervals);

  // Функция для рендера прогресс-бара
  const progressBar = (pct, label) => {
    return (
      <>
        <div className="goal-progress-bar-outer">
          <div className="goal-progress-bar">
            <div 
              className="goal-progress-bar-inner" 
              style={{ width: `${pct}%` }}
            ></div>
          </div>
          <div className="goal-progress-bar-pct">
            {pct}%
          </div>
        </div>
        <div className="goal-progress-bar-label">
          {label}
        </div>
      </>
    );
  };

  // Функция для рендера недельного плана
  const renderWeekPlan = () => {
    const days = [
      { day: 'Понедельник', type: 'Восстановительная', desc: 'Лёгкая езда 40–60 мин, каденс 90–100, пульс Z1–Z2' },
      { day: 'Вторник', type: 'Мощность', desc: 'Интервалы: 4×4 мин в Z5, отдых 4 мин, каденс 85–95' },
      { day: 'Четверг', type: 'Каденс/техника', desc: '1–1.5 ч, упражнения на высокий каденс, одностороннее педалирование, пульс Z2' },
      { day: 'Суббота', type: 'Эндюранс', desc: 'Длительная поездка 2–4 ч, пульс Z2–Z3, набор высоты' }
    ];
    return days;
  };

  // Функция для рендера месячного плана
  const renderMonthPlan = () => {
    const weeks = [
      { week: '1', focus: 'Базовая выносливость, техника', keyWorkouts: '3–4 тренировки: 1× эндюранс, 1× мощность, 1× каденс, 1× восстановительная' },
      { week: '2', focus: 'Интервалы, развитие мощности', keyWorkouts: '3–4 тренировки: 2× интервалы, 1× эндюранс, 1× восстановительная' },
      { week: '3', focus: 'Длительные поездки, набор высоты', keyWorkouts: '3–4 тренировки: 2× эндюранс, 1× мощность, 1× восстановительная' },
      { week: '4', focus: 'Смешанная неделя, восстановление', keyWorkouts: '2–3 тренировки: 1× интервалы, 1× эндюранс, 1× восстановительная' }
    ];
    return weeks;
  };

  // Функция для рендера плана-факт анализа
  const renderPlanFact = () => {
    if (!activities.length) return null;

    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const count = recent.length;
    const longRides = recent.filter(a => (a.distance || 0) > 60000 || (a.moving_time || 0) > 2.5 * 3600).length;
    const intervals = recent.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval'))).length;
    
    // Плановые значения
    const plan = { weeks: 4, rides: 12, km: 400, long: 4, intervals: 8 };
    
    return {
      plan,
      fact: { rides: count, km: totalKm, long: longRides, intervals },
      pct: {
        rides: Math.round(count / plan.rides * 100),
        km: Math.round(totalKm / plan.km * 100),
        long: Math.round(longRides / plan.long * 100),
        intervals: Math.round(intervals / plan.intervals * 100)
      }
    };
  };

  // Функция для рендера рекомендаций
  const renderRecommendations = () => {
    if (!activities.length) return null;

    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const totalTime = recent.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
    const avgSpeed = totalTime > 0 ? totalKm / totalTime : 0;
    
    const flats = recent.filter(a => (a.distance || 0) > 20000 && (a.total_elevation_gain || 0) < (a.distance || 0) * 0.005 && (a.average_speed || 0) * 3.6 < 40);
    const flatSpeeds = flats.map(a => (a.average_speed || 0) * 3.6);
    const medianFlatSpeed = median(flatSpeeds);
    const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
    const medianFlatHR = median(flatHRs);
    
    const intervals = recent.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
    const longRides = recent.filter(a => (a.distance || 0) > 60000 || (a.moving_time || 0) > 2.5 * 3600);

    return {
      myData: {
        flatSpeed: medianFlatSpeed ? medianFlatSpeed.toFixed(1) : '—',
        flatHR: medianFlatHR ? medianFlatHR.toFixed(0) : '—',
        volume: totalKm.toFixed(0),
        intervals: intervals.length,
        longRides: longRides.length
      },
      proData: {
        flatSpeed: '33–38 км/ч',
        flatHR: 'Z3–Z4',
        volume: '1400–2000 км',
        intervals: '2–3/нед',
        longRides: '1–2/нед'
      }
    };
  };

  // Функция для рендера саммари
  const renderSummary = () => {
    if (!activities.length) return null;

    const now = new Date();
    const acts = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const periods = [];
    let period = [];
    let periodStart = acts[0] ? new Date(acts[0].start_date) : null;
    
    for (let i = 0; i < acts.length; ++i) {
      const d = new Date(acts[i].start_date);
      if (period.length && (period.length >= 28 || (periodStart - d) > 27 * 24 * 60 * 60 * 1000)) {
        periods.push(period);
        period = [];
        periodStart = d;
      }
      period.push(acts[i]);
    }
    if (period.length) periods.push(period);

    const avgPercents = periods.map(percentForPeriod).map(p => p.avg);
    const avgAll = avgPercents.length ? Math.round(avgPercents.reduce((a, b) => a + b, 0) / avgPercents.length) : 0;
    
    let trend = '';
    if (avgPercents.length > 1) {
      const last = avgPercents[0], prev = avgPercents[1];
      if (last > prev) trend = '⬆️ Прогресс ускоряется!';
      else if (last < prev) trend = '⬇️ Есть спад, проверьте восстановление.';
      else trend = '→ Прогресс стабилен.';
    }

    return { periodsCount: avgPercents.length, avgPercent: avgAll, trend };
  };

  const weekPlan = renderWeekPlan();
  const monthPlan = renderMonthPlan();
  const planFact = renderPlanFact();
  const recommendations = renderRecommendations();
  const summary = renderSummary();

  // Функция для расчета номера недели (ISO week number)
  function getISOWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
  // Логика для текущего 4-недельного цикла
  const getCurrentPlanWeekIdx = (activities) => {
    if (!activities.length) return 0;
    const weekNumbers = activities.map(a => getISOWeekNumber(a.start_date));
    const minWeek = Math.min(...weekNumbers);
    const nowWeek = getISOWeekNumber(new Date());
    const n = Math.floor((nowWeek - minWeek) / 4);
    const startWeekInCycle = minWeek + n * 4;
    let idx = nowWeek - startWeekInCycle;
    if (idx < 0) idx = 0;
    if (idx > 3) idx = 3;
    return idx;
  };
  const currentPlanWeekIdx = getCurrentPlanWeekIdx(activities);

  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main">
        {/* Hero блок */}
        <div id="plan-hero-banner" className="plan-hero hero-banner" style={{
          backgroundImage: heroImage ? `url(${heroImage})` : 'none'
        }}>
          <h1 className="hero-title">Анализ и рекомендации</h1>
          <div className="hero-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5em', marginBottom: '1em', flexWrap: 'wrap' }}>
            {planFactHero && (
                <div style={{ display: 'inline-block', color: '#fff', fontSize: '0.9em', opacity: 0.8, marginBottom:'1.2em' }}>
                  Период: <b>{planCycleMinDate ? planCycleMinDate.toLocaleDateString('ru-RU') : ''}</b> — <b>{planCycleMaxDate ? planCycleMaxDate.toLocaleDateString('ru-RU') : ''}</b>
                </div>
              )}
              <div className="avg-per-week" style={{ display: 'inline-block' }}>
                Среднее число тренировок в неделю: <b>{avgPerWeek.avg}</b> 
                <span style={{ color: '#888' }}> ({avgPerWeek.pct}%)</span> / <b>4</b>
              </div>
              
            </div>
            <div className="plan-fact-hero">
              {planFactHero && planFactHero.data.map((d, i) => (
                <div key={i} className="plan-fact-hero-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '0.15em' }}>
                    {i === 3 && (
                      <span style={{
                        display: 'inline-block',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: d.color,
                        border: '2px solid #fff'
                      }}></span>
                    )}
                    <span style={{ fontSize: '32px', fontWeight: '800', color: '#fff', lineHeight: '1' }}>
                      {i < 3 ? d.pct + '%' : d.min + ' мин'}
                    </span>
                    {i === 3 ? (
                      <span style={{ fontSize: '1.1em', opacity: '0.7', color: '#fff' }}>
                        / {d.fact} инт
                      </span>
                    ) : (
                      <span style={{ fontSize: '1.1em', opacity: '0.7', color: '#fff' }}>
                        {d.fact} / {d.plan}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '1em', color: '#fff', opacity: '0.5' }}>
                    {d.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Прогресс по 4-недельным периодам — сразу под hero */}
        <div style={{ width: '100%', margin: '0em 0 0px 2em' }}>
          <ProgressChart data={periodSummary} />
        </div>

        {/* Основной контент */}
        <div className="plan-content">
          {loading && <div className="content-loader"><div></div></div>}
          
          {!loading && !error && (
            <>
              <div className="goals-grid">
                <div className="goal-card">
                  <b>FTP/VO₂max</b><br /><br />
                  <span className="goal-progress" id="goal-real-intervals">
                    {lastRealIntervals.count > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: lastRealIntervals.color,
                          border: '2px solid #fff'
                        }}></span>
                        <span style={{ fontSize: '1.3em', fontWeight: '800', color: '#000' }}>
                          {lastRealIntervals.min} мин / {lastRealIntervals.count} инт
                        </span>
                        <span style={{ fontSize: '0.9em', opacity: '0.5', color: '#000', marginTop: '0.12em' }}>
                          {lastRealIntervals.label}
                        </span>
                      </div>
                    ) : (
                      'Нет данных'
                    )}
                    <div className="goal-progress-bar-label" style={{ marginTop: '0.5em' }}>
                      Критерий: пульс ≥160 не менее 120 сек подряд
                    </div>
                  </span>
                </div>
                <div className="goal-card">
                  <b>Средняя скорость на равнине</b><br />
                  ~30 км/ч<br />
                  <span className="goal-sub">Каденс: 85–95</span><br />
                  <span className="goal-progress">
                    {progressBar(goalProgress.flatSpeed.pct, goalProgress.flatSpeed.label)}
                  </span>
                </div>
                <div className="goal-card">
                  <b>Средняя скорость на подъёмах</b><br />
                  15–20 км/ч<br />
                  <span className="goal-sub">Каденс: 70–80</span><br />
                  <span className="goal-progress">
                    {progressBar(goalProgress.hillSpeed.pct, goalProgress.hillSpeed.label)}
                  </span>
                </div>
                <div className="goal-card">
                  <b>Пульс</b><br />
                  Равнина: Z2–Z3<br />
                  Подъёмы: Z3–Z4<br /><br />
                  <span className="goal-progress">
                    {progressBar(goalProgress.hr.pct, goalProgress.hr.label)}
                  </span>
                </div>
                <div className="goal-card">
                  <b>Длительные поездки</b><br />
                  Дистанция: 60+ км<br />
                  Время в движении: 2.5+ часа<br />
                  <span className="goal-progress">
                    {progressBar(goalProgress.longRide.pct, goalProgress.longRide.label)}
                  </span>
                </div>
                <div className="goal-card">
                  <b>Интервалы</b><br />
                  4×4 мин в Z5, 2×20 мин в Z4<br /><br />
                  <span className="goal-progress">
                    {progressBar(goalProgress.intervals.pct, goalProgress.intervals.label)}
                  </span>
                </div>
                <div className="goal-card">
                  <b>Восстановление</b><br />
                  1–2 лёгкие тренировки в неделю<br /><br />
                  <span className="goal-progress">
                    {progressBar(goalProgress.recovery.pct, goalProgress.recovery.label)}
                  </span>
                </div>
              </div>

              {/* Новые графики с Recharts */}
              <div className="analytics-row" style={{ display: 'flex', gap: '2em', alignItems: 'stretch', width: '100%' }}>
                <div style={{ flex: '0 1 70%', minWidth: 0 }}>
                  <HeartRateZonesChart activities={activities} />
                </div>
                <div style={{ flex: '0 1 30%', minWidth: 0 }}>
                  <HRZonesChart data={hrZonesData} />
                </div>
              </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}

          {/* Недельный план */}
          <h2 style={{ marginTop: '2em' }}>Недельный план</h2>
          <div id="week-plan">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Тип</th>
                  <th>Описание</th>
                </tr>
              </thead>
              <tbody>
                {weekPlan.map((day, i) => (
                  <tr key={i}>
                    <td>{day.day}</td>
                    <td>{day.type}</td>
                    <td>{day.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Месячный план */}
          <h2 style={{ marginTop: '2em' }}>Месячный план</h2>
          <div id="month-plan">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Неделя</th>
                  <th>Фокус</th>
                  <th>Ключевые тренировки</th>
                </tr>
              </thead>
              <tbody>
                {monthPlan.map((week, i) => (
                  <tr key={i}>
                    <td>{week.week}</td>
                    <td>{week.focus}</td>
                    <td>{week.keyWorkouts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* План-факт анализ */}
          <h2 style={{ marginTop: '2em' }}>План-факт анализ (4 недели)</h2>
          <div id="plan-fact-block">
            {planFact ? (
              <table className="styled-table" style={{ marginTop: '10px' }}>
                <thead>
                  <tr>
                    <th>Показатель</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>Выполнение</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Тренировки</td>
                    <td>{planFact.plan.rides}</td>
                    <td>{planFact.fact.rides}</td>
                    <td>{planFact.pct.rides}%</td>
                  </tr>
                  <tr>
                    <td>Объём (км)</td>
                    <td>{planFact.plan.km}</td>
                    <td>{planFact.fact.km.toFixed(0)}</td>
                    <td>{planFact.pct.km}%</td>
                  </tr>
                  <tr>
                    <td>Длинные поездки</td>
                    <td>{planFact.plan.long}</td>
                    <td>{planFact.fact.long}</td>
                    <td>{planFact.pct.long}%</td>
                  </tr>
                  <tr>
                    <td>Интервалы</td>
                    <td>{planFact.plan.intervals}</td>
                    <td>{planFact.fact.intervals}</td>
                    <td>{planFact.pct.intervals}%</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '1em', textAlign: 'center', color: '#888' }}>
                Нет данных для анализа
              </div>
            )}
          </div>

          {/* Рекомендации */}
          <div id="recommendations-block" style={{ marginTop: '2.5em' }}>
            {recommendations ? (
              <>
                <h2>Рекомендации</h2>
                <b>Сравнение с профи:</b><br />
                <table className="styled-table">
                  <thead>
                    <tr>
                      <th>Показатель</th>
                      <th>Мои данные</th>
                      <th>Профи</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Ср. скорость на равнине</td>
                      <td>{recommendations.myData.flatSpeed} км/ч</td>
                      <td>{recommendations.proData.flatSpeed}</td>
                    </tr>
                    <tr>
                      <td>Медианный пульс на равнине</td>
                      <td>{recommendations.myData.flatHR}</td>
                      <td>{recommendations.proData.flatHR}</td>
                    </tr>
                    <tr>
                      <td>Объём за 4 недели</td>
                      <td>{recommendations.myData.volume} км</td>
                      <td>{recommendations.proData.volume}</td>
                    </tr>
                    <tr>
                      <td>Интервальные тренировки</td>
                      <td>{recommendations.myData.intervals}</td>
                      <td>{recommendations.proData.intervals}</td>
                    </tr>
                    <tr>
                      <td>Длинные поездки (&gt;60км или &gt;2.5ч)</td>
                      <td>{recommendations.myData.longRides}</td>
                      <td>{recommendations.proData.longRides}</td>
                    </tr>
                  </tbody>
                </table>

                <br /><br />
                <b>Профессиональные рекомендации:</b><br />
                <ul style={{ margin: '0 0 0 1.2em', padding: '0', fontSize: '0.9em' }}>
                  <li>Планируйте тренировки по принципу периодизации: 3 недели наращивания нагрузки, 1 неделя восстановления.</li>
                  <li>Проводите регулярные тесты FTP/CP для отслеживания прогресса и корректировки зон.</li>
                  <li>Включайте в план тренировки на развитие слабых сторон (например, интервалы в гору, спринты, cadence drills).</li>
                  <li>Контролируйте восстановление: следите за пульсом покоя, качеством сна, используйте субъективную шкалу усталости.</li>
                  <li>Обращайте внимание на питание и гидратацию до, во время и после тренировок.</li>
                  <li>Регулярно анализируйте данные: ищите закономерности, отслеживайте динамику, корректируйте план.</li>
                  <li>Включайте в неделю хотя бы одну вариативную тренировку (новый маршрут, техника, групповой заезд).</li>
                  <li>Работайте над техникой педалирования и посадкой (bike fit).</li>
                </ul>
                <br /><br />
              </>
            ) : (
              <div style={{ padding: '1em', textAlign: 'center', color: '#888' }}>
                Нет данных для рекомендаций
              </div>
            )}
          </div>
         
         {/* Калькулятор VO2max */}
         <div id="vo2max-calculator" style={{ marginTop: '2.5em' }}>
           <h2>Калькулятор VO2max</h2>
           
           <div style={{ display: 'flex', gap: '2em', marginBottom: '2em' }}>
             {/* Автоматический расчёт */}
             <div style={{ flex: 1, padding: '1.5em', background: '#f8f9fa', border: '1px solid #e9ecef' }}>
               <h3 style={{ marginTop: 0, color: '#274DD3' }}>Автоматический расчёт</h3>
               <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '1em' }}>
                 На основе ваших данных Strava за последние 4 недели
               </p>
               {vo2maxData.auto ? (
                 <div style={{ textAlign: 'center' }}>
                   <div style={{ fontSize: '2.5em', fontWeight: 700, color: '#274DD3' }}>
                     {vo2maxData.auto}
                   </div>
                   <div style={{ fontSize: '1.1em', color: '#666' }}>мл/кг/мин</div>
                   <div style={{ marginTop: '1em', fontSize: '0.9em', color: '#888' }}>
                     {vo2maxData.auto < 30 ? 'Начинающий' :
                      vo2maxData.auto < 50 ? 'Любительский' :
                      vo2maxData.auto < 75 ? 'Продвинутый' :
                      vo2maxData.auto < 85 ? 'Элитный шоссейник' :
                      'Лучший гонщик'} уровень
                   </div>
                   {vo2maxData.highIntensityData && (
                     <div style={{ marginTop: '1em', padding: '1em', background: '#fff', borderRadius: '4px', fontSize: '0.85em' }}>
                       <div style={{ color: '#666', marginBottom: '0.5em' }}>Анализ интенсивности:</div>
                       <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '0.8em' }}>
                         <div>
                           <div style={{ fontWeight: 600, color: '#274DD3' }}>{vo2maxData.highIntensityData.time} мин</div>
                           <div style={{ color: '#888' }}>в зоне ≥160</div>
                         </div>
                         <div>
                           <div style={{ fontWeight: 600, color: '#274DD3' }}>{vo2maxData.highIntensityData.percent}%</div>
                           <div style={{ color: '#888' }}>от общего времени</div>
                         </div>
                         <div>
                           <div style={{ fontWeight: 600, color: '#274DD3' }}>{vo2maxData.highIntensityData.sessions}</div>
                           <div style={{ color: '#888' }}>высокоинтенсивных</div>
                         </div>
                       </div>
                     </div>
                   )}
                 </div>
               ) : (
                 <div style={{ textAlign: 'center', color: '#888', padding: '2em' }}>
                   Недостаточно данных для расчёта
                 </div>
               )}
             </div>
             
             {/* Ручной тест */}
             <div style={{ flex: 1, padding: '1.5em', background: '#f8f9fa', border: '1px solid #e9ecef' }}>
               <h3 style={{ marginTop: 0, color: '#274DD3' }}>Ручной тест</h3>
               <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '1em' }}>
                 По формуле Джексона-Поллока (12-минутный тест)
               </p>
               
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1em', marginBottom: '1em' }}>
                 <div>
                   <label style={{ display: 'block', marginBottom: '0.3em', fontSize: '0.9em' }}>
                     Время теста (мин):
                   </label>
                   <input
                     type="number"
                     value={vo2maxData.testTime}
                     onChange={(e) => handleVO2maxInput('testTime', e.target.value)}
                     placeholder="12"
                     style={{ width: '100%', padding: '0.5em', border: '1px solid #ddd' }}
                   />
                 </div>
                 <div>
                   <label style={{ display: 'block', marginBottom: '0.3em', fontSize: '0.9em' }}>
                     ЧСС в конце:
                   </label>
                   <input
                     type="number"
                     value={vo2maxData.testHR}
                     onChange={(e) => handleVO2maxInput('testHR', e.target.value)}
                     placeholder="180"
                     style={{ width: '100%', padding: '0.5em', border: '1px solid #ddd' }}
                   />
                 </div>
                 <div>
                   <label style={{ display: 'block', marginBottom: '0.3em', fontSize: '0.9em' }}>
                     Вес (кг):
                   </label>
                   <input
                     type="number"
                     value={vo2maxData.weight}
                     onChange={(e) => handleVO2maxInput('weight', e.target.value)}
                     placeholder="70"
                     style={{ width: '100%', padding: '0.5em', border: '1px solid #ddd' }}
                   />
                 </div>
                 <div>
                   <label style={{ display: 'block', marginBottom: '0.3em', fontSize: '0.9em' }}>
                     Возраст:
                   </label>
                   <input
                     type="number"
                     value={vo2maxData.age}
                     onChange={(e) => handleVO2maxInput('age', e.target.value)}
                     placeholder="30"
                     style={{ width: '100%', padding: '0.5em', border: '1px solid #ddd' }}
                   />
                 </div>
               </div>
               
               <div style={{ marginBottom: '1em' }}>
                 <label style={{ display: 'block', marginBottom: '0.3em', fontSize: '0.9em' }}>
                   Пол:
                 </label>
                 <select
                   value={vo2maxData.gender}
                   onChange={(e) => handleVO2maxInput('gender', e.target.value)}
                   style={{ width: '100%', padding: '0.5em', border: '1px solid #ddd' }}
                 >
                   <option value="male">Мужской</option>
                   <option value="female">Женский</option>
                 </select>
               </div>
               
               <button
                 onClick={calculateManualVO2max}
                 style={{
                   background: '#274DD3',
                   color: '#fff',
                   border: 'none',
                   padding: '0.8em 1.5em',
                   cursor: 'pointer',
                   width: '100%',
                   fontSize: '1em'
                 }}
               >
                 Рассчитать
               </button>
               
               {vo2maxData.manual && (
                 <div style={{ textAlign: 'center', marginTop: '1em' }}>
                   <div style={{ fontSize: '2em', fontWeight: 700, color: '#274DD3' }}>
                     {vo2maxData.manual}
                   </div>
                   <div style={{ fontSize: '1em', color: '#666' }}>мл/кг/мин</div>
                 </div>
               )}
             </div>
           </div>
           
           {/* Интерпретация */}
           <div style={{ background: '#f8f9fa', padding: '1.5em', border: '1px solid #e9ecef' }}>
             <h3 style={{ marginTop: 0, color: '#274DD3' }}>Интерпретация VO2max</h3>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1em' }}>
               <div style={{ padding: '1em', background: '#fff', border: '1px solid #e9ecef' }}>
                 <strong style={{ color: '#dc3545' }}>Начинающий (10–30):</strong><br />
                 Базовый уровень. Рекомендуется постепенное увеличение нагрузки.
               </div>
               <div style={{ padding: '1em', background: '#fff', border: '1px solid #e9ecef' }}>
                 <strong style={{ color: '#ffc107' }}>Любительский (30–50):</strong><br />
                 Хорошая база для развития и поддержания формы.
               </div>
               <div style={{ padding: '1em', background: '#fff', border: '1px solid #e9ecef' }}>
                 <strong style={{ color: '#28a745' }}>Продвинутый (50–75):</strong><br />
                 Спортивные результаты, высокий уровень выносливости.
               </div>
               <div style={{ padding: '1em', background: '#fff', border: '1px solid #e9ecef' }}>
                 <strong style={{ color: '#007bff' }}>Элитные шоссейники (75–85+):</strong><br />
                 Профессиональные спортсмены, топ-уровень.
               </div>
               <div style={{ padding: '1em', background: '#fff', border: '1px solid #e9ecef' }}>
                 <strong style={{ color: '#6f42c1' }}>Лучшие гонщики (85–90+):</strong><br />
                 Мировая элита: Погачар, Вингегор и др.
               </div>
             </div>
           </div>
         </div>
        </div>
      </div>
    </div>
  );
} 