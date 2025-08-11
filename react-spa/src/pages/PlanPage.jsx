import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import './PlanPage.css';
import HeartRateZonesChart from '../components/HeartRateZonesChart';
import '../components/HeartRateZonesChart.css';
import '../components/CadenceStandardsAnalysis.css';
import ProgressChart from '../components/ProgressChart';
import '../components/ProgressChart.css';
import PowerAnalysis from '../components/PowerAnalysis';
import '../components/PowerAnalysis.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
// Убираем импорт analyzeHighIntensityTime - теперь анализ происходит только в goalsCache
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';
import AverageHeartRateTrendChart from '../components/AverageHeartRateTrendChart';
import MinMaxHeartRateBarChart from '../components/MinMaxHeartRateBarChart';
import HeartRateVsSpeedChart from '../components/HeartRateVsSpeedChart';
import HeartRateVsElevationChart from '../components/HeartRateVsElevationChart';
import AverageCadenceTrendChart from '../components/AverageCadenceTrendChart';
import CadenceVsSpeedChart from '../components/CadenceVsSpeedChart';
import CadenceVsElevationChart from '../components/CadenceVsElevationChart';
import CadenceStandardsAnalysis from '../components/CadenceStandardsAnalysis';
import GoalsManager from '../components/GoalsManager';
import GoalCard from '../components/GoalCard';
import WeeklyTrainingCalendar from '../components/WeeklyTrainingCalendar';
import '../components/RecommendationsCollapsible.css';
import PageLoadingOverlay from '../components/PageLoadingOverlay';
import Footer from '../components/Footer';
import defaultHeroImage from '../assets/img/hero/bn.webp';
import rec_banner from '../assets/img/rec_banner.jpg';
import { updateGoalsWithCache, createActivitiesHash } from '../utils/goalsCache';
import { CACHE_TTL, CLEANUP_TTL } from '../utils/cacheConstants';
import { cacheCheckup } from '../utils/cacheCheckup';






// В начале компонента:
const PERIOD_OPTIONS = [
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' }
];

export default function PlanPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('4w');
  const [userProfile, setUserProfile] = useState(null);
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
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [personalGoals, setPersonalGoals] = useState([]);
  const [showPersonalGoals, setShowPersonalGoals] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [showRecommendationsCalendar, setShowRecommendationsCalendar] = useState(false);



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
      setSummary(null);
      setPeriod(null);
    }
    const loadData = async () => {
      setPageLoading(true);
    
      // Очищаем старые кэши
      cleanupOldStreamsCache();
      
      // Выполняем автоматический чек-ап кэша
      try {
        console.log('🔍 Запускаем автоматический чек-ап кэша...');
        await cacheCheckup.performFullCheckup();
        const recommendations = cacheCheckup.getOptimizationRecommendations();
        
        if (recommendations.length > 0) {
          console.log('⚠️ Обнаружены рекомендации по оптимизации:', recommendations.length);
          // Автоматически выполняем высокоприоритетные рекомендации
          const highPriorityRecs = recommendations.filter(rec => rec.priority === 'high');
          if (highPriorityRecs.length > 0) {
            console.log('🚀 Выполняем высокоприоритетные оптимизации...');
            await cacheCheckup.executeRecommendations();
          }
        } else {
          console.log('✅ Кэш в оптимальном состоянии');
        }
      } catch (error) {
        console.warn('⚠️ Ошибка автоматического чек-апа:', error);
      }
      
      await fetchActivities();
      await fetchHeroImage();
      
      // Загружаем персональные цели
      try {
        const goals = await apiFetch('/api/goals');
        setPersonalGoals(goals);
      } catch (e) {
        console.error('Error loading personal goals:', e);
      }
      
      // Загружаем профиль пользователя для управления видимостью календаря и HR зон
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
        setShowRecommendationsCalendar(profile.show_recommendations || false);
      } catch (e) {
        console.error('Error loading user profile:', e);
      }
      
      // Загружаем аналитику с сервера
      try {
        setAnalyticsLoading(true);
        const data = await apiFetch('/api/analytics/summary');
        console.log('📊 Analytics summary data:', {
          hasSummary: !!data.summary,
          totalRides: data.summary?.totalRides,
          totalKm: data.summary?.totalKm,
          longRidesCount: data.summary?.longRidesCount,
          plan: data.summary?.plan,
          progress: data.summary?.progress,
          period: data.period,
          selectedPeriod: selectedPeriod
        });
        setSummary(data.summary);
        setPeriod(data.period);
      } finally {
        setAnalyticsLoading(false);
      }
      
      
      setPageLoading(false);
    };
    
    loadData();
  }, [selectedPeriod]);



  useEffect(() => {
    let isMounted = true;
    
    if (activities.length > 0) {
      // Отключаем анализ интервалов для plan-fact-hero
      // const loadIntervals = async () => {
      //   if (!isMounted) return;
      //   const intervals = await analyzeIntervals(activities);
      //   if (isMounted) {
      //     setLastRealIntervals(intervals);
      //   }
      // };
      // loadIntervals();
      
      // Устанавливаем дефолтные значения
      if (isMounted) {
        setLastRealIntervals({ count: 0, min: 0, label: 'Low', color: '#bdbdbd' });
      }
      // Отключаем автоматический расчет VO2max
      // if (isMounted) {
      //   calculateAutoVO2max();
      // }
    }
    
    return () => {
      isMounted = false;
    };
  }, [activities]);

  // Пересчитываем цели только при изменении активностей (появлении новых тренировок)
  useEffect(() => {
    if (activities.length > 0 && personalGoals.length > 0) {
      // Проверяем, изменились ли активности с последнего пересчета
      const activitiesHash = createActivitiesHash(activities);
      
      if (updateGoalsOnActivitiesChange.lastHash !== activitiesHash) {
        console.log('🔍 Hash comparison:', {
          previous: updateGoalsOnActivitiesChange.lastHash ? 'exists' : 'none',
          current: activitiesHash ? 'exists' : 'none',
          activitiesCount: activities.length,
          goalsCount: personalGoals.length
        });
        updateGoalsOnActivitiesChange.lastHash = activitiesHash;
        updateGoalsOnActivitiesChange(activities);
      } else {
        console.log('✅ Activities hash unchanged, skipping goals recalculation');
      }
    }
  }, [activities, personalGoals.length]);

  // VO2max теперь загружается автоматически вместе с целями из базы данных

  // Функция для обновления целей из GoalsManager
  const refreshGoals = async () => {
    try {
      const goals = await apiFetch('/api/goals');
      setPersonalGoals(goals);
      console.log('✅ PlanPage: обновлено', goals.length, 'целей из базы данных');
    } catch (e) {
      console.error('Error refreshing goals:', e);
    }
  };

  // VO2max теперь сохраняется в базе данных и загружается вместе с целями
  const refreshVO2max = async (period = null) => {
    // Функция оставлена для совместимости, но VO2max теперь автоматически обновляется
    console.log('ℹ️ VO2max теперь сохраняется в базе данных - обновление не требуется');
  };

  // Убираем автоматическое обновление при закрытии модального окна
  // Теперь обновление происходит только через onGoalsRefresh в GoalsManager

  // Отключаем автоматический расчёт VO2max на основе данных Strava
  // const calculateAutoVO2max = () => {
  //   if (!activities.length) return;
  //   
  //   // Берём последние 4 недели
  //   const now = new Date();
  //   const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  //   const recent = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  //   
  //   if (!recent.length) return;
  //   
  //   // Базовые показатели
  //   const bestSpeed = Math.max(...recent.map(a => (a.average_speed || 0) * 3.6));
  //   const avgHR = recent.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / recent.filter(a => a.average_heartrate).length;
  //   
  //   // Убираем анализ стримов из расчета VO2max
  //   // Используем только базовые показатели из активностей
  //   const totalTimeMin = 0; // Пока не анализируем стримы
  //   const highIntensitySessions = 0;
  //   
  //   // Базовый VO2max
  //   let baseVO2max = (bestSpeed * 1.2) + (avgHR * 0.05);
  //   
  //   // Бонус за интервалы
  //   let intensityBonus = 0;
  //   if (totalTimeMin >= 120) intensityBonus = 4;
  //   else if (totalTimeMin >= 60) intensityBonus = 2.5;
  //   else if (totalTimeMin >= 30) intensityBonus = 1;
  //   if (highIntensitySessions >= 6) intensityBonus += 1.5;
  //   else if (highIntensitySessions >= 3) intensityBonus += 0.5;
  //   
  //   const estimatedVO2max = Math.min(80, Math.max(30, Math.round(baseVO2max + intensityBonus)));
  //   
  //   setVo2maxData(prev => ({
  //     ...prev,
  //     auto: estimatedVO2max,
  //     highIntensityData: {
  //       time: totalTimeMin,
  //       percent: null,
  //       sessions: highIntensitySessions
  //     }
  //   }));
  // };
  
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
    const userId = getUserId();
    const cacheKey = userId ? `activities_${userId}` : CACHE_KEYS.ACTIVITIES;
    
    try {
      // Сначала проверяем кэш
      const cachedActivities = cacheUtils.get(cacheKey);
      if (cachedActivities && cachedActivities.length > 0) {
        setActivities(cachedActivities);
        setLoading(false);
        return;
      }

      const data = await apiFetch('/api/activities');
      
      // Сохраняем в кэш на 30 минут
      cacheUtils.set(cacheKey, data, 30 * 60 * 1000);
      
      setActivities(data);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Функция для автоматического обновления целей при изменении активностей
  const updateGoalsOnActivitiesChange = async (newActivities) => {
    if (!newActivities || newActivities.length === 0) return;
    
    // Защита от повторных вызовов с теми же данными
    const activitiesHash = createActivitiesHash(newActivities);
    if (updateGoalsOnActivitiesChange.lastHash === activitiesHash) {
      return;
    }
    updateGoalsOnActivitiesChange.lastHash = activitiesHash;
    
    try {
      console.log('🔄 Обнаружены изменения в активностях, запускаем пересчет целей...');
      
      // Получаем все цели пользователя
      const goals = await apiFetch('/api/goals');

      if (goals.length === 0) return;
      
      // Используем общую утилиту для обновления целей с кэшированием
      const updatedGoals = await updateGoalsWithCache(newActivities, goals, userProfile);
      
      // Обновляем цели в базе данных только если есть изменения
      const hasChanges = updatedGoals.some((updatedGoal, index) => {
        const originalGoal = goals[index];
        
        // Для FTP/VO2max целей проверяем и target_value, и current_value
        if (updatedGoal.goal_type === 'ftp_vo2max') {
          return updatedGoal.target_value !== originalGoal.target_value || 
                 updatedGoal.current_value !== originalGoal.current_value;
        }
        
        // Для остальных целей проверяем только current_value
        return updatedGoal.current_value !== originalGoal.current_value;
      });
      
      if (hasChanges) {
        console.log('📊 Обнаружены изменения в целях, обновляем базу данных...');
        
        // Обновляем каждую цель в базе данных
        for (const goal of updatedGoals) {
          try {
            const updateData = {
              current_value: goal.current_value
            };
            
            // Для FTP/VO2max целей также обновляем target_value
            if (goal.goal_type === 'ftp_vo2max') {
              updateData.target_value = goal.target_value;
            }
            
            await apiFetch(`/api/goals/${goal.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updateData)
            });
          } catch (error) {
            console.error(`Error updating goal ${goal.id}:`, error);
          }
        }
        
        // Обновляем локальное состояние целей
        setPersonalGoals(updatedGoals);
        
        console.log('✅ Цели успешно обновлены в базе данных и localStorage');
      } else {
        console.log('ℹ️ Изменений в целях не обнаружено');
      }
    } catch (error) {
      console.error('Error updating goals on activities change:', error);
    }
  };

  // Функция для принудительного обновления целей (можно вызывать вручную)
  const forceUpdateGoals = async () => {
    if (activities.length > 0) {
      
      await updateGoalsOnActivitiesChange(activities);
    }
  };

  // Функции для управления видимостью календаря рекомендаций
  const toggleRecommendationsCalendar = async (show) => {
    try {
      await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_recommendations: show })
      });
      
      setShowRecommendationsCalendar(show);
    } catch (error) {
      console.error('Error updating recommendations visibility:', error);
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
    if (n === null || n === undefined) return '—';
    return n.toFixed(digits);
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

    const longRides = period.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600);
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

  // Calculate HR zones based on user profile
  const calculateUserHRZones = () => {
    if (!userProfile) {
      // Fallback to hardcoded zones if no profile
      return {
        zone1: { min: 100, max: 120 },
        zone2: { min: 120, max: 140 },
        zone3: { min: 140, max: 160 },
        zone4: { min: 160, max: 180 },
        zone5: { min: 180, max: 220 }
      };
    }

    const profileMaxHR = userProfile.max_hr ? parseInt(userProfile.max_hr) : (userProfile.age ? 220 - parseInt(userProfile.age) : 190);
    
    let restingHR = userProfile.resting_hr ? parseInt(userProfile.resting_hr) : null;
    if (!restingHR && userProfile.experience_level) {
      switch (userProfile.experience_level) {
        case 'beginner': restingHR = 75; break;
        case 'intermediate': restingHR = 65; break;
        case 'advanced': restingHR = 55; break;
        default: restingHR = 70;
      }
    }
    
    const lactateThreshold = userProfile.lactate_threshold ? parseInt(userProfile.lactate_threshold) : null;
    
    if (!profileMaxHR || !restingHR) {
      // Fallback if insufficient data
      return {
        zone1: { min: 100, max: 120 },
        zone2: { min: 120, max: 140 },
        zone3: { min: 140, max: 160 },
        zone4: { min: 160, max: 180 },
        zone5: { min: 180, max: 220 }
      };
    }
    
    if (lactateThreshold) {
      // Zone calculation based on lactate threshold HR
      return {
        zone1: { min: Math.round(lactateThreshold * 0.75), max: Math.round(lactateThreshold * 0.85) },
        zone2: { min: Math.round(lactateThreshold * 0.85), max: Math.round(lactateThreshold * 0.92) },
        zone3: { min: Math.round(lactateThreshold * 0.92), max: Math.round(lactateThreshold * 0.97) },
        zone4: { min: Math.round(lactateThreshold * 0.97), max: Math.round(lactateThreshold * 1.03) },
        zone5: { min: Math.round(lactateThreshold * 1.03), max: profileMaxHR }
      };
    } else {
      // Karvonen method
      const hrReserve = profileMaxHR - restingHR;
      return {
        zone1: { min: Math.round(restingHR + (hrReserve * 0.5)), max: Math.round(restingHR + (hrReserve * 0.6)) },
        zone2: { min: Math.round(restingHR + (hrReserve * 0.6)), max: Math.round(restingHR + (hrReserve * 0.7)) },
        zone3: { min: Math.round(restingHR + (hrReserve * 0.7)), max: Math.round(restingHR + (hrReserve * 0.8)) },
        zone4: { min: Math.round(restingHR + (hrReserve * 0.8)), max: Math.round(restingHR + (hrReserve * 0.9)) },
        zone5: { min: Math.round(restingHR + (hrReserve * 0.9)), max: profileMaxHR }
      };
    }
  };

  // Функция для рендера пульсовых зон
  const renderHRZones = () => {
    if (!activities.length) return null;

    // Берём только последние 8 недель
    const now = new Date();
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
    const recent = activities.filter(a => new Date(a.start_date) > eightWeeksAgo);

    // Get user's HR zones
    const zones = calculateUserHRZones();

    // Считаем суммарное время в зонах
    let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0, other = 0;
    recent.forEach(a => {
      if (!a.average_heartrate || !a.moving_time) return;
      const hr = a.average_heartrate;
      const t = a.moving_time / 60; // минуты
      
      if (hr >= zones.zone1.min && hr < zones.zone1.max) z1 += t;
      else if (hr >= zones.zone2.min && hr < zones.zone2.max) z2 += t;
      else if (hr >= zones.zone3.min && hr < zones.zone3.max) z3 += t;
      else if (hr >= zones.zone4.min && hr < zones.zone4.max) z4 += t;
      else if (hr >= zones.zone5.min && hr < zones.zone5.max) z5 += t;
      else other += t;
    });

    const total = z1 + z2 + z3 + z4 + z5 + other;
    const data = [z1, z2, z3, z4, z5, other];
    const labels = [
      `Z1 (${zones.zone1.min}-${zones.zone1.max})`, 
      `Z2 (${zones.zone2.min}-${zones.zone2.max})`, 
      `Z3 (${zones.zone3.min}-${zones.zone3.max})`, 
      `Z4 (${zones.zone4.min}-${zones.zone4.max})`, 
      `Z5 (${zones.zone5.min}-${zones.zone5.max})`,
      'Other'
    ];
    const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#bdbdbd'];

    return { data, labels, colors, total, z1, z2, z3, z4, z5 };
  };

  const periodSummary = useMemo(() => renderPeriodSummary(), [activities]);
  const hrZonesData = useMemo(() => renderHRZones(), [activities, userProfile]);







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
    const longRides = recent.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
    const plan = { rides: 12, km: 400, long: 4, intervals: 8 };
    let minDate = planCycleMinDate, maxDate = planCycleMaxDate;
    const data = [
      { label: 'Workouts', fact: count, plan: plan.rides, pct: Math.round(count / plan.rides * 100) },
      { label: 'Volume, km', fact: Math.round(totalKm), plan: plan.km, pct: Math.round(totalKm / plan.km * 100) },
      { label: 'Long rides', fact: longRides, plan: plan.long, pct: Math.round(longRides / plan.long * 100) },
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
  const [lastRealIntervals, setLastRealIntervals] = useState({ count: 0, min: 0, label: 'Low', color: '#bdbdbd' });

    // Отключаем функцию анализа интервалов
  // const analyzeIntervals = async (activities) => {
  //   const now = new Date();
  //   const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  //   const filtered = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
  //   
  //   let totalIntervals = 0;
  //   let analyzed = 0;
  //   let totalTimeSec = 0;
  //   let rateLimitExceeded = false;
  //   
  //   for (const act of filtered) {
  //     try {
  //       let streams = null;
  //       const cacheKey = `streams_${act.id}`;
  //       
  //       // Пробуем получить из кэша
  //       const cached = localStorage.getItem(cacheKey);
  //       if (cached) {
  //         try {
  //           const cacheData = JSON.parse(cached);
  //           // Проверяем TTL (7 дней для streams)
  //           const ttl = cacheData.ttl || CACHE_TTL.STREAMS;
  //           if (Date.now() - cacheData.timestamp < ttl) {
  //             streams = cacheData.data || cacheData; // Поддержка старого формата
  //           } else {
  //             // Кэш истек, удаляем его
  //             localStorage.removeItem(cacheKey);
  //           }
  //         } catch (e) {
  //           // Если кэш поврежден, удаляем его
  //           localStorage.removeItem(cacheKey);
  //         }
  //       }
  //       
  //       if (!streams) {
  //         const res = await apiFetch(`/api/activities/${act.id}/streams`);
  //         if (res.status === 429) { 
  //           rateLimitExceeded = true; 
  //           break; 
  //         }
  //         if (!res.ok) continue;
  //         streams = await res.json();
  //         
  //         // Сохраняем в кэш только если данные не слишком большие
  //         try {
  //           const streamSize = JSON.stringify(streams).length;
  //           if (streamSize < 500000) { // Ограничиваем размер кэша до 500KB
  //             const cacheData = {
  //               data: streams,
  //               timestamp: Date.now(),
  //               ttl: CACHE_TTL.STREAMS // 7 дней
  //             };
  //             localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  //           }
  //         } catch (e) {
  //           // Если не удается сохранить в localStorage, пропускаем
  //           console.warn('Failed to cache streams data:', e);
  //         }
  //       }
  //       
  //       const hr = streams.heartrate?.data || [];
  //       let intervals = 0;
  //       let inInt = false, startIdx = 0;
  //       
  //       for (let i = 0; i < hr.length; i++) {
  //         const h = hr[i] || 0;
  //         if (h >= 160) {
  //           if (!inInt) { inInt = true; startIdx = i; }
  //         } else {
  //           if (inInt && (i - startIdx) >= 120) { 
  //             intervals++; 
  //             totalTimeSec += (i - startIdx); 
  //           }
  //           inInt = false;
  //         }
  //       }
  //       if (inInt && (hr.length - startIdx) >= 120) { 
  //         intervals++; 
  //         totalTimeSec += (hr.length - startIdx); 
  //       }
  //       
  //       totalIntervals += intervals;
  //       analyzed++;
  //     } catch (e) {
  //       // Если ошибка и есть кэш — используем кэш
  //       const cacheKey = `streams_${act.id}`;
  //       const cached = localStorage.getItem(cacheKey);
  //       if (cached) {
  //                   try {
  //         const cacheData = JSON.parse(cached);
  //         const streams = cacheData.data || cacheData; // Поддержка старого формата
  //         const hr = streams.heartrate?.data || [];
  //         let intervals = 0;
  //         let inInt = false, startIdx = 0;
  //         
  //         for (let i = 0; i < hr.length; i++) {
  //           const h = hr[i] || 0;
  //           if (h >= 160) {
  //             if (!inInt) { inInt = true; startIdx = i; }
  //           } else {
  //             if (inInt && (i - startIdx) >= 120) { 
  //               intervals++; 
  //               totalTimeSec += (i - startIdx); 
  //             }
  //             inInt = false;
  //           }
  //         }
  //         if (inInt && (hr.length - startIdx) >= 120) { 
  //           intervals++; 
  //           totalTimeSec += (hr.length - startIdx); 
  //         }
  //         
  //         totalIntervals += intervals;
  //         analyzed++;
  //       } catch (e) {
  //         // Если кэш поврежден, удаляем его
  //         localStorage.removeItem(cacheKey);
  //         continue;
  //       }
  //       } else {
  //         continue;
  //       }
  //     }
  //   }
  //   
  //   const totalTimeMin = Math.round(totalTimeSec / 60);
  //   
  //   // Цветовая дифференциация
  //   let color = '#bdbdbd', label = 'Low';
  //   if (totalIntervals >= 15 && totalIntervals < 25) { 
  //     color = '#4caf50'; 
  //     label = 'Normal'; 
  //   }
  //   else if (totalIntervals >= 25 && totalIntervals < 35) { 
  //     color = '#ffeb3b'; 
  //     label = 'Many'; 
  //   }
  //   else if (totalIntervals >= 35 && totalIntervals < 45) { 
  //     color = '#e53935'; 
  //     label = 'Too many'; 
  //   }
  //   
     //   return { count: totalIntervals, min: totalTimeMin, label, color, rateLimitExceeded };
   // };

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


  const planFactHero = renderPlanFactHero(activities, lastRealIntervals);



  // Функция для рендера недельного плана
  const renderWeekPlan = () => {
    const days = [
      { day: 'Monday', type: 'Recovery', desc: 'Light ride 40–60 min, cadence 90–100, pulse Z1–Z2' },
      { day: 'Tuesday', type: 'Power', desc: 'Intervals: 4×4 min in Z5, rest 4 min, cadence 85–95' },
      { day: 'Thursday', type: 'Cadence/Technique', desc: '1–1.5 hours, high cadence exercises, one-sided pedaling, pulse Z2' },
      { day: 'Saturday', type: 'Endurance', desc: 'Long ride 2–4 hours, pulse Z2–Z3, elevation gain' }
    ];
    return days;
  };

  // Функция для рендера месячного плана
  const renderMonthPlan = () => {
    const weeks = [
      { week: '1', focus: 'Base endurance, technique', keyWorkouts: '3–4 workouts: 1× endurance, 1× power, 1× cadence, 1× recovery' },
      { week: '2', focus: 'Intervals, power development', keyWorkouts: '3–4 workouts: 2× intervals, 1× endurance, 1× recovery' },
      { week: '3', focus: 'Long rides, elevation gain', keyWorkouts: '3–4 workouts: 2× endurance, 1× power, 1× recovery' },
      { week: '4', focus: 'Mixed week, recovery', keyWorkouts: '2–3 workouts: 1× intervals, 1× endurance, 1× recovery' }
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
    const longRides = recent.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
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
    const longRides = recent.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600);

    return {
      myData: {
        flatSpeed: medianFlatSpeed ? medianFlatSpeed.toFixed(1) : '—',
        flatHR: medianFlatHR ? medianFlatHR.toFixed(0) : '—',
        volume: totalKm.toFixed(0),
        intervals: intervals.length,
        longRides: longRides.length
      },
      proData: {
        flatSpeed: '33–38 km/h',
        flatHR: 'Z3–Z4',
        volume: '1400–2000 km',
        intervals: '2–3/week',
        longRides: '1–2/week'
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
      if (last > prev) trend = '⬆️ Progress is accelerating!';
      else if (last < prev) trend = '⬇️ There is a decline, check recovery.';
      else trend = '→ Progress is stable.';
    }

    return { periodsCount: avgPercents.length, avgPercent: avgAll, trend };
  };

  const weekPlan = renderWeekPlan();
  const monthPlan = renderMonthPlan();
  const planFact = renderPlanFact();
  const recommendations = renderRecommendations();
  const summaryStats = renderSummary();

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

  // Функция для форматирования дат периода (дд.мм)
  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

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

  // Очистка старых кэшей streams
  const cleanupOldStreamsCache = () => {
    try {
      const keys = Object.keys(localStorage);
      const streamKeys = keys.filter(key => key.startsWith('streams_'));
      
      // Удаляем кэши старше времени очистки
      const cleanupTime = Date.now() - CLEANUP_TTL.STREAMS;
      
      streamKeys.forEach(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && data.timestamp && data.timestamp < cleanupTime) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          // Если данные повреждены, удаляем ключ
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Failed to cleanup streams cache:', e);
    }
  };



  return (
    <div className="main-layout">
      <PageLoadingOverlay isLoading={pageLoading} loadingText="Analyzing activities & Preparing charts..." />
      <Sidebar />
      <div className="main">
        {/* Hero блок */}
        {!pageLoading && (
          <div id="plan-hero-banner" className="plan-hero hero-banner" style={{
            backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})`
          }}>
          <h1 className="hero-title">Analysis and Recommendations</h1>
          <div className="hero-content">
           {/* Описание плана */}
           {summary?.plan && (
              <div style={{ 
                marginTop: '1.5em', 
                padding: '7px 88px', 
                background: 'rgba(255, 255, 255, 0.1)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                position: 'absolute',
                left: '0',
                bottom: '0',
                width: '90%'
              }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: '16px', flex: 1 }}>
                  {/* Период */}
                  {period && period.start && period.end && (
                    <div style={{ display: 'inline-block', color: '#fff', fontSize: '0.75em', opacity: 0.8 }}>
                      Period: <b>{formatDate(period.start)}</b> — <b>{formatDate(period.end)}</b>
                    </div>
                  )}
                  
                  {/* Описание плана */}
                  <div style={{ 
                    fontSize: '0.75em', 
                    color: '#fff', 
                    opacity: 0.9,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>
                      <strong>{summary.plan.description}</strong>
                      {summary.plan.experienceLevel && summary.plan.timeAvailable && (
                        <span style={{ opacity: 0.7, marginLeft: '8px', fontWeight: '600' }}>
                           {summary.plan.timeAvailable}h/week - {Math.round(summary.plan.rides/4)} rides/week
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                
                {/* Кнопки действий */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => navigate('/profile?tab=training')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8em',
                      background: 'transparent',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent';
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    Change plan
                  </button>
                </div>
              </div>
            )}
            {summary && (
            <div className="plan-fact-hero">
                <div className="plan-fact-hero-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '0.15em' }}>
                    <span style={{ fontSize: '45px', fontWeight: '800', color: '#fff', lineHeight: '1' }}>{summary.progress.rides}%</span>
                    <span style={{ fontSize: '1.1em', opacity: '0.7', color: '#fff' }}>{summary.totalRides} / {summary.plan?.rides || 12}</span>
                  </div>
                  <div style={{ fontSize: '1em', color: '#fff', opacity: 0.5 }}>Workouts</div>
                  </div>
                <div className="plan-fact-hero-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '0.15em' }}>
                    <span style={{ fontSize: '45px', fontWeight: '800', color: '#fff', lineHeight: '1' }}>{summary.progress.km}%</span>
                    <span style={{ fontSize: '1.1em', opacity: '0.7', color: '#fff' }}>{summary.totalKm} / {summary.plan?.km || 400}</span>
                </div>
                  <div style={{ fontSize: '1em', color: '#fff', opacity: 0.5 }}>Volume, km</div>
            </div>
                <div className="plan-fact-hero-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '0.15em' }}>
                    <span style={{ fontSize: '45px', fontWeight: '800', color: '#fff', lineHeight: '1' }}>{summary.progress.long}%</span>
                    <span style={{ fontSize: '1.1em', opacity: '0.7', color: '#fff' }}>{summary.longRidesCount} / {summary.plan?.long || 4}</span>
          </div>
                  <div style={{ fontSize: '1em', color: '#fff', opacity: 0.5 }}>Long rides</div>
                </div>

              </div>
            )}
            
            
          </div>
        </div>
        )}

     
        {/* Прогресс по 4-недельным периодам — сразу под hero */}
        {!pageLoading && (
          <div style={{ width: '100%', margin: '0em 0 0px 2em' }}>
            <ProgressChart data={periodSummary} />
          </div>
        )}
        
       
       
        {/* Основной контент */}
        <div className="plan-content">
          {loading && <div className="content-loader"><div></div></div>}
          
          {!loading && !error && (
            <>
              {/* Персональные цели */}
              <div className="goals-manager" style={{ marginBottom: '2em' }}>
                <br />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1em' }}>
                  <h2 style={{ margin: 0 }}>Personal Goals</h2>
                  <button 
                    onClick={() => setShowPersonalGoals(!showPersonalGoals)}
                    style={{
                      background: 'none',
                      color: '#274DD3',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.7em 1.5em',
                      fontSize: '1em',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                  >
                    {showPersonalGoals ? 'Hide Goals' : 'Manage Goals'}
                  </button>
                </div>
                
                        {showPersonalGoals ? (
          <GoalsManager
            activities={activities}
            onGoalsUpdate={setPersonalGoals}
            isOpen={showPersonalGoals}
            onClose={() => {
              setShowPersonalGoals(false);
              // Обновляем goals и VO2max при закрытии модалки
              setTimeout(async () => {
                await refreshGoals();
                await refreshVO2max();
              }, 100);
            }}
            initialGoals={personalGoals}
            onGoalsRefresh={refreshGoals}
            onVO2maxRefresh={refreshVO2max}
          />
        ) : personalGoals.length > 0 ? (
                  <div className="goals-grid" id="goal-view">
                    {personalGoals
                      .sort((a, b) => {
                        // FTP/VO₂max цели всегда первые
                        if (a.goal_type === 'ftp_vo2max' && b.goal_type !== 'ftp_vo2max') return -1;
                        if (a.goal_type !== 'ftp_vo2max' && b.goal_type === 'ftp_vo2max') return 1;
                        // Остальные цели сортируются по ID (сохраняем порядок)
                        return a.id - b.id;
                      })
                      .map(goal => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          showActions={false}
                        />
                      ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '48px 24px', 
                    background: '#f9fafb', 
                    border: '2px dashed #d1d5db', 
                    borderRadius: '8px', 
                    color: '#6b7280' 
                  }}>
                    <p>No personal goals set yet. Click "Manage Goals" to create your first goal!</p>
                  </div>
                )}
              </div>

              {/* Управление календарем тренировочных рекомендаций */}
              {showRecommendationsCalendar ? (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '20px',
                    padding: '0 32px',
                   
                  }}>
                   
                    
                  </div>
                  <div style={{ marginLeft: '32px' }}>
                    <br />
                    <br />
                   <h2 className="goals-heading">Training Recommendations</h2>
                   <p style={{ color: '#888', fontSize: '0.85em', lineHeight: '1.6' }}>
                     <b>It automatically updates based on your activities, so it's always up to date.</b> <br /> 
                     You can switch to the manual mode to create your own plan.
                   </p>
                   

                   

                   </div>
                  
                  <br />
                 
                  <WeeklyTrainingCalendar showProfileSettingsProp={false} />
                
                
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => toggleRecommendationsCalendar(false)}
                        style={{
                          background: 'none',
                          color: '#000',
                          textDecoration: 'underline',
                          border: 'none',
                          padding: '16px 32px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: '700',
                          marginBottom: '2em'
                        }}
                      >
                                                  I don't want training recommendations
                      </button>
                    </div>
                    <br />
                    <br />
                </div>
              ) : (
                <div className="plan-default-block" style={{ 
                  textAlign: 'left', 
                  padding: '26.5px 72px', 
                  background: `url(${rec_banner}) no-repeat center center`, 
                  backgroundSize: '105%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  position: 'relative',
                  zIndex: 100

                }}>
                  <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.3rem', color: '#fff', zIndex: 100, position: 'relative' }}>
                    Personalized Training Recommendations
                  </h3>
                  <p style={{ margin: '0 0 0px 0', color: '#fff', fontSize: '1rem', opacity: 0.6 }}>
                    Get an individual training plan based on your goals and progress
                  </p>
                  </div>
                  <button 
                    onClick={() => toggleRecommendationsCalendar(true)}
                    style={{
                      background: '#fff',
                      color: '#000',
                      border: 'none',
                      padding: '12px 24px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 500,
                      zIndex: 100
                    }}
                  >
                                              I want recommendations
                  </button>
                </div>
              )}

            
             
              <h2 className="analitycs-heading">Heart rate analysis</h2>
               {/* График сравнения среднего пульса и средней скорости */}
               <HeartRateVsSpeedChart activities={activities} />

              
                {/* Новый график динамики среднего пульса */}
                <AverageHeartRateTrendChart activities={activities} />

                {/* График максимального и минимального пульса */}
                <MinMaxHeartRateBarChart activities={activities} />

               
               
                {/* График зависимости пульса от набора высоты */}
                <HeartRateVsElevationChart activities={activities} />

                {/* График по пульсовым зонам (line chart) */}
                <HeartRateZonesChart activities={activities} />
              {/* Power Analysis */}
       
              <h2 className="analitycs-heading">Power analysis</h2>
          <PowerAnalysis activities={activities} />
       

              <h2 className="analitycs-heading">Cadence analysis</h2>
               {/* Анализ каденса по профессиональным стандартам */}
               <CadenceStandardsAnalysis activities={activities} />

               {/* График сравнения среднего каденса и средней скорости */}
               <CadenceVsSpeedChart activities={activities} />


                              {/* График тренда среднего каденса по неделям */}
                <AverageCadenceTrendChart activities={activities} />

                {/* График зависимости каденса от набора высоты */}
                <CadenceVsElevationChart activities={activities} />

               


    {/* Калькулятор VO2max */}
    <div id="vo2max-calculator" style={{ marginTop: '2.5em', background: '#fff', border: '1px solid #e5e7eb', padding: '2.5em 2em', marginBottom: '2.5em' }}>
        <h2 style={{ fontWeight: 700, fontSize: '2em', margin: '0 0 1.2em 0', letterSpacing: '-1px' }}>VO₂max Calculation</h2>
        <div style={{ display: 'flex', gap: '2.5em', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Автоматический расчёт */}
          <div style={{ flex: 1, minWidth: 260 }}>
           
            <p style={{ color: '#888', fontSize: '0.95em', margin: '0.5em 0 1.2em 0' }}>
              Based on your Strava data for the last 4 weeks
            </p>
            {vo2maxData.auto ? (
              <div style={{ textAlign: 'left', margin: '1.5em 0 0.5em 0' }}>
                <span style={{ fontSize: '6.2em', fontWeight: 800, color: '#000', lineHeight: 1 }}>{vo2maxData.auto}</span>
                <span style={{ fontSize: '1.3em', color: '#222', marginLeft: 12, fontWeight: 500 }}>ml/kg/min</span>
              
                <div style={{ fontSize: '1em', color: '#888', marginTop: '0.7em' }}>
                  {vo2maxData.auto < 30 ? 'Beginner' :
                  vo2maxData.auto < 50 ? 'Amateur' :
                  vo2maxData.auto < 75 ? 'Advanced' :
                  vo2maxData.auto < 85 ? 'Elite road cyclist' :
                  'Best cyclist'} level
              </div>
                {vo2maxData.highIntensityData && (
                  <div style={{ marginTop: '1.2em', fontSize: '0.98em', color: '#555', display: 'flex', gap: '2.5em' }}>
                    <div><b>{vo2maxData.highIntensityData.time}</b> min<br /><span style={{ color: '#aaa', fontWeight: 400 }}>in zone ≥160</span></div>
                    <div><b>{vo2maxData.highIntensityData.sessions}</b> sessions<br /><span style={{ color: '#aaa', fontWeight: 400 }}>interval workouts</span></div>
                  </div>
          )}
              </div>
            ) : (
              <div style={{ color: '#bbb', fontSize: '1.1em', margin: '2.5em 0' }}>Not enough data to calculate</div>
            )}
          </div>
          {/* Ручной тест по Куперу */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ color: '#888', fontSize: '0.95em', margin: '0.5em 0 1.2em 0' }}>
              By Cooper's formula (12-minute test: maximum distance in 12 minutes)
            </p>
            <div style={{ marginBottom: '1.2em' }}>
              <input type="number" value={vo2maxData.testDistance} onChange={e => handleVO2maxInput('testDistance', e.target.value)} placeholder="Distance in 12 min (m)" style={{ fontSize: '1em', padding: '0.7em', border: '1px solid #e5e7eb', background: '#fafbfc', outline: 'none', boxShadow: 'none', borderRadius: 0, width: '100%' }} />
            </div>
            <button onClick={() => {
              const dist = parseFloat(vo2maxData.testDistance);
              if (!dist) return;
              // Cooper's formula: VO2max = (distance × 0.02241) – 11.288
              const vo2max = dist * 0.02241 - 11.288;
              setVo2maxData(prev => ({ ...prev, manual: Math.round(vo2max) }));
            }} style={{ background: '#274DD3', color: '#fff', border: 'none', borderRadius: 0, padding: '0.9em 0', fontSize: '1.1em', fontWeight: 600, width: '100%', cursor: 'pointer', marginBottom: '1.2em', letterSpacing: '0.5px', boxShadow: 'none' }}>Calculate</button>
            {vo2maxData.manual && (
              <div style={{ textAlign: 'left', marginTop: '1.2em' }}>
                <span style={{ fontSize: '2.8em', fontWeight: 800, color: '#274DD3', lineHeight: 1 }}>{vo2maxData.manual}</span>
                <span style={{ fontSize: '1.1em', color: '#222', marginLeft: 10, fontWeight: 500 }}>ml/kg/min</span>
              </div>
            )}
            <div style={{ color: '#888', fontSize: '0.95em', marginTop: '1.2em' }}>
              <b>How to conduct the test:</b><br />
              Ride or run as far as possible in 12 minutes. Enter the result in meters.<br />
              Formula: <code>VO₂max = (distance × 0.02241) – 11.288</code>
            </div>
          </div>
        </div>
        {/* Интерпретация */}
        <br />
        <br />
        <div style={{ marginTop: '2.5em', background: '#fafbfc', border: '1px solid #e5e7eb', padding: '1.5em 1em', fontSize: '0.9em', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.2em' }}>
          <div><b style={{ color: '#dc3545' }}>Beginner (10–30):</b><br />Basic level. Gradual increase in load is recommended.</div>
          <div><b style={{ color: '#ffc107' }}>Amateur (30–50):</b><br />Good base for development and maintaining form.</div>
          <div><b style={{ color: '#28a745' }}>Advanced (50–75):</b><br />Sports results, high level of endurance.</div>
          <div><b style={{ color: '#007bff' }}>Elite road cyclists (75–85+):</b><br />Professional athletes, top level.</div>
          <div><b style={{ color: '#6f42c1' }}>Best cyclists (85–90+):</b><br />World elite: Pogachar, Wingeor and others.</div>
        </div>
      </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}
          
       
        </div>
      </div>
      
      <Footer />
    </div>
  );
} 