import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './AnalysisPage.css';
import HeartRateZonesChart from '../components/HeartRateZonesChart';
import '../components/HeartRateZonesChart.css';
import '../components/CadenceStandardsAnalysis.css';
import ProgressChart from '../components/ProgressChart';
import '../components/ProgressChart.css';
import FTPAnalysis from '../components/FTPAnalysis';
import '../components/FTPAnalysis.css';
import PowerAnalysis from '../components/PowerAnalysis';
import '../components/PowerAnalysis.css';
import { cacheUtils, CACHE_KEYS } from '../utils/cache';
import { heroImagesUtils } from '../utils/heroImages';
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
import PageLoadingOverlay from '../components/PageLoadingOverlay';
import Footer from '../components/Footer';
import StravaLogo from '../components/StravaLogo';
import PartnersLogo from '../components/PartnersLogo';
import garminLogoSvg from '../assets/img/logo/garmin_tag_black.png';
import defaultHeroImage from '../assets/img/hero/bn.webp';
import BGVid from '../assets/img/bgvid.mp4';
import { CACHE_TTL, CLEANUP_TTL } from '../utils/cacheConstants';
import { getPlanFromProfile } from '../utils/trainingPlans';
import { cacheCheckup } from '../utils/cacheCheckup';

const PERIOD_OPTIONS = [
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' }
];

export default function AnalysisPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('4w');
  const [userProfile, setUserProfile] = useState(null);
  const [heroImage, setHeroImage] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [lastRealIntervals, setLastRealIntervals] = useState({ count: 0, min: 0, label: 'Low', color: '#bdbdbd' });

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
    }
    const loadData = async () => {
      setPageLoading(true);
    
      // Очищаем старые кэши
      cleanupOldStreamsCache();
      
      // Выполняем автоматический чек-ап кэша
      try {
        await cacheCheckup.performFullCheckup();
        const recommendations = cacheCheckup.getOptimizationRecommendations();
        
        if (recommendations.length > 0) {
          const highPriorityRecs = recommendations.filter(rec => rec.priority === 'high');
          if (highPriorityRecs.length > 0) {
            await cacheCheckup.executeRecommendations();
          }
        }
      } catch (error) {
        console.warn('⚠️ Ошибка автоматического чек-апа:', error);
      }
      
      await fetchActivities();
      await fetchHeroImage();
      
      // Загружаем профиль пользователя
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
      } catch (e) {
        console.error('Error loading user profile:', e);
      }
      
      // Загружаем аналитику с сервера
      try {
        setAnalyticsLoading(true);
        const data = await apiFetch('/api/analytics/summary');
        setSummary(data.summary);
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
      if (isMounted) {
        setLastRealIntervals({ count: 0, min: 0, label: 'Low', color: '#bdbdbd' });
      }
    }
    
    return () => {
      isMounted = false;
    };
  }, [activities]);

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

  // Calculate HR zones based on user profile
  const calculateUserHRZones = () => {
    if (!userProfile) {
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
      return {
        zone1: { min: 100, max: 120 },
        zone2: { min: 120, max: 140 },
        zone3: { min: 140, max: 160 },
        zone4: { min: 160, max: 180 },
        zone5: { min: 180, max: 220 }
      };
    }
    
    if (lactateThreshold) {
      return {
        zone1: { min: Math.round(lactateThreshold * 0.75), max: Math.round(lactateThreshold * 0.85) },
        zone2: { min: Math.round(lactateThreshold * 0.85), max: Math.round(lactateThreshold * 0.92) },
        zone3: { min: Math.round(lactateThreshold * 0.92), max: Math.round(lactateThreshold * 0.97) },
        zone4: { min: Math.round(lactateThreshold * 0.97), max: Math.round(lactateThreshold * 1.03) },
        zone5: { min: Math.round(lactateThreshold * 1.03), max: profileMaxHR }
      };
    } else {
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

  // Функция для получения цели скорости/дистанции из goals или fallback на уровень опыта
  const getGoalOrFallback = (goalType, goals, userProfile) => {
    const goal = goals.find(g => g.goal_type === goalType);
    if (goal && goal.target_value) {
      return parseFloat(goal.target_value);
    }

    const experienceLevel = userProfile?.experience_level || 'intermediate';
    
    if (goalType === 'speed_flat') {
      switch (experienceLevel) {
        case 'beginner': return 25;
        case 'intermediate': return 30;
        case 'advanced': return 35;
        default: return 30;
      }
    } else if (goalType === 'speed_hills') {
      switch (experienceLevel) {
        case 'beginner': return 15;
        case 'intermediate': return 17.5;
        case 'advanced': return 20;
        default: return 17.5;
      }
    } else if (goalType === 'easy_distance') {
      switch (experienceLevel) {
        case 'beginner': return 20;
        case 'intermediate': return 25;
        case 'advanced': return 30;
        default: return 25;
      }
    } else if (goalType === 'easy_speed') {
      switch (experienceLevel) {
        case 'beginner': return 18;
        case 'intermediate': return 20;
        case 'advanced': return 22;
        default: return 20;
      }
    } else if (goalType === 'easy_elevation') {
      switch (experienceLevel) {
        case 'beginner': return 200;
        case 'intermediate': return 300;
        case 'advanced': return 400;
        default: return 300;
      }
    }
    
    return goalType === 'speed_flat' ? 30 : 17.5;
  };

  // Функция для расчета процентов выполнения за период
  const percentForPeriod = (period, userPlan = null, goals = [], blockStartDate = null, blockEndDate = null) => {
    const speedFlatGoal = getGoalOrFallback('speed_flat', goals, userProfile);
    const speedHillGoal = getGoalOrFallback('speed_hills', goals, userProfile);
    const easyDistanceGoal = getGoalOrFallback('easy_distance', goals, userProfile);
    const easySpeedGoal = getGoalOrFallback('easy_speed', goals, userProfile);
    const easyElevationGoal = getGoalOrFallback('easy_elevation', goals, userProfile);
    
    const flats = period.filter(a => (a.distance || 0) > 20000 && (a.total_elevation_gain || 0) < (a.distance || 0) * 0.005 && (a.average_speed || 0) * 3.6 < 40);
    const flatSpeeds = flats.map(a => (a.average_speed || 0) * 3.6);
    const medianFlatSpeed = median(flatSpeeds);
    let flatSpeedPct = Math.round(medianFlatSpeed / speedFlatGoal * 100);

    const hills = period.filter(a => (a.distance || 0) > 5000 && ((a.total_elevation_gain || 0) > (a.distance || 0) * 0.015 || (a.total_elevation_gain || 0) > 500) && (a.average_speed || 0) * 3.6 < 25);
    const hillSpeeds = hills.map(a => (a.average_speed || 0) * 3.6);
    const medianHillSpeed = median(hillSpeeds);
    let hillSpeedPct = Math.floor(medianHillSpeed / speedHillGoal * 100);

    const userHRZones = calculateUserHRZones();
    
    const flatHRs = flats.map(a => a.average_heartrate).filter(Boolean);
    const medianFlatHR = median(flatHRs);
    
    const flatsInZone = flats.filter(a => 
      a.average_heartrate && 
      a.average_heartrate >= userHRZones.zone1.min && 
      a.average_heartrate <= userHRZones.zone3.max
    ).length;
    const flatZonePct = flats.length ? Math.round(flatsInZone / flats.length * 100) : 0;
    
    const hillsInZone = hills.filter(a => 
      a.average_heartrate && 
      a.average_heartrate >= userHRZones.zone3.min && 
      a.average_heartrate <= userHRZones.zone4.max
    ).length;
    const hillZonePct = hills.length ? Math.round(hillsInZone / hills.length * 100) : 0;
    
    const pulseGoalPct = flats.length && hills.length ? Math.round((flatZonePct + hillZonePct) / 2) : (flatZonePct || hillZonePct);

    const longRides = period.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600);
    const longTarget = userPlan?.long || 4;
    let longRidePct = Math.round(longRides.length / longTarget * 100);

    const intervals = period.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval')));
    const intervalTarget = userPlan?.intervals || 4;
    let intervalsPct = Math.round(intervals.length / intervalTarget * 100);

    const easyRides = period.filter(a => 
      ((a.distance || 0) < easyDistanceGoal * 1000 || 
       (a.average_speed || 0) * 3.6 < easySpeedGoal) &&
      (a.total_elevation_gain || 0) < easyElevationGoal
    );
    let easyPct = Math.round(easyRides.length / 4 * 100);

    const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, easyPct];
    const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
    
    let start, end;
    if (blockStartDate && blockEndDate) {
      start = blockStartDate;
      end = blockEndDate;
    } else {
      const dates = period.map(a => new Date(a.start_date)).sort((a, b) => a - b);
      start = dates[0];
      end = dates[dates.length - 1];
    }
    
    return { avg, all, start, end };
  };

  // Единая функция для расчета всех 4-недельных периодов
  const calculatePeriods = (activities) => {
    if (!activities.length) return [];

    const acts = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const periods = [];
    
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

    if (acts.length) {
      const allActivitiesWeeks = acts.map(a => getISOWeekNumber(a.start_date));
      const globalMinWeek = Math.min(...allActivitiesWeeks);
      const nowWeek = getISOWeekNumber(new Date());
      const currentYear = new Date().getFullYear();
      
      const activitiesByYear = {};
      acts.forEach(a => {
        const year = new Date(a.start_date).getFullYear();
        if (!activitiesByYear[year]) activitiesByYear[year] = [];
        activitiesByYear[year].push(a);
      });

      Object.keys(activitiesByYear).sort().forEach(year => {
        const yearActivities = activitiesByYear[year];
        
        if (parseInt(year) === currentYear) {
          const n = Math.floor((nowWeek - globalMinWeek) / 4);
          
          for (let cycleIndex = 0; cycleIndex <= n; cycleIndex++) {
            const startWeekInCycle = globalMinWeek + cycleIndex * 4;
            
            const planCycleMinDate = getDateOfISOWeek(startWeekInCycle, parseInt(year));
            const planCycleMaxDate = getDateOfISOWeek(startWeekInCycle + 3, parseInt(year));
            planCycleMaxDate.setDate(planCycleMaxDate.getDate() + 6);
            
            const cycleActivities = yearActivities.filter(a => {
              const d = new Date(a.start_date);
              return d >= planCycleMinDate && d <= planCycleMaxDate;
            });

            if (cycleActivities.length > 0) {
              periods.push({
                activities: cycleActivities,
                startDate: planCycleMinDate,
                endDate: planCycleMaxDate,
                year: parseInt(year),
                cycleIndex
              });
            }
          }
        } else {
          const weekNumbers = yearActivities.map(a => getISOWeekNumber(a.start_date));
          const minWeek = Math.min(...weekNumbers);
          const maxWeek = Math.max(...weekNumbers);
          
          for (let cycleIndex = 0; minWeek + cycleIndex * 4 <= maxWeek; cycleIndex++) {
            const startWeekInCycle = minWeek + cycleIndex * 4;
            
            const planCycleMinDate = getDateOfISOWeek(startWeekInCycle, parseInt(year));
            const planCycleMaxDate = getDateOfISOWeek(startWeekInCycle + 3, parseInt(year));
            planCycleMaxDate.setDate(planCycleMaxDate.getDate() + 6);
            
            const cycleActivities = yearActivities.filter(a => {
              const d = new Date(a.start_date);
              return d >= planCycleMinDate && d <= planCycleMaxDate;
            });

            if (cycleActivities.length > 0) {
              periods.push({
                activities: cycleActivities,
                startDate: planCycleMinDate,
                endDate: planCycleMaxDate,
                year: parseInt(year),
                cycleIndex
              });
            }
          }
        }
      });
    }

    periods.sort((a, b) => new Date(a.activities[0]?.start_date) - new Date(b.activities[0]?.start_date));
    
    return periods;
  };

  // Функция для рендера прогресса по периодам
  const renderPeriodSummary = () => {
    if (!activities.length) return null;

    const userPlan = getPlanFromProfile(userProfile);
    const allPeriods = calculatePeriods(activities);
    
    const summary = allPeriods
      .slice(-14)
      .map((periodData, index) => {
        const result = percentForPeriod(
          periodData.activities, 
          userPlan, 
          [], 
          periodData.startDate, 
          periodData.endDate
        );
        
        return result;
      });

    return summary;
  };

  const periodSummary = useMemo(() => renderPeriodSummary(), [activities, userProfile]);

  // Функция для рендера карточек plan-fact-hero
  const renderPlanFactHero = (activities, lastRealIntervals) => {
    const allPeriods = calculatePeriods(activities);
    const currentPeriod = allPeriods.slice(-1)[0];
    
    const recent = currentPeriod ? currentPeriod.activities : [];
    const planCycleMinDate = currentPeriod ? currentPeriod.startDate : null;
    const planCycleMaxDate = currentPeriod ? currentPeriod.endDate : null;
    const totalKm = recent.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const count = recent.length;
    const longRides = recent.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
    
    const userPlan = getPlanFromProfile(userProfile);
    const plan = { 
      rides: userPlan.rides, 
      km: userPlan.km, 
      long: userPlan.long, 
      intervals: userPlan.intervals 
    };
    let minDate = planCycleMinDate, maxDate = planCycleMaxDate;
    const data = [
      { label: 'Workouts', fact: count, plan: plan.rides, pct: Math.round(count / plan.rides * 100) },
      { label: 'Volume, km', fact: Math.round(totalKm), plan: plan.km, pct: Math.round(totalKm / plan.km * 100) },
      { label: 'Long rides', fact: longRides, plan: plan.long, pct: Math.round(longRides / plan.long * 100) },
      { label: 'FTP/VO₂max', fact: lastRealIntervals.count, min: lastRealIntervals.min, plan: lastRealIntervals.label, pct: '', color: lastRealIntervals.color },
    ];
    const formatDate = d => d ? d.toLocaleDateString('ru-RU') : '';
    return { 
      data, 
      minDate: planCycleMinDate, 
      maxDate: planCycleMaxDate, 
      formatDate 
    };
  };

  // Функция для расчета номера недели (ISO week number)
  function getISOWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // Функция для форматирования дат периода
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
      
      const cleanupTime = Date.now() - CLEANUP_TTL.STREAMS;
      
      streamKeys.forEach(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && data.timestamp && data.timestamp < cleanupTime) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Failed to cleanup streams cache:', e);
    }
  };

  const planFactHero = renderPlanFactHero(activities, lastRealIntervals);
  
  const period = planFactHero.minDate && planFactHero.maxDate ? {
    start: planFactHero.minDate,
    end: planFactHero.maxDate
  } : null;

  // Функция для проверки есть ли данные в текущем периоде
  const isEmptyPeriod = (summary) => {
    if (!summary) return true;
    
    const hasRides = summary.totalRides > 0;
    const hasKm = summary.totalKm > 0;
    const hasLongRides = summary.longRidesCount > 0;
    
    return !hasRides && !hasKm && !hasLongRides;
  };

  return (
    <div className="main-layout">
      <PageLoadingOverlay isLoading={pageLoading} loadingText="Analyzing activities & Preparing charts..." />
      <div className="main">
        {/* Hero блок */}
        {!pageLoading && (
          <div id="plan-hero-banner" className="plan-hero hero-banner" style={{
            backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})`,
            position: 'relative'
          }}>
            <video className="bg-video" src={BGVid} autoPlay loop muted playsInline />
            <PartnersLogo
              logoSrc={garminLogoSvg}
              alt="Powered by Garmin"
              height="32px"
              position="absolute"
              top="57px"
              right="auto"
              style={{ right: '8px' }}
              opacity={1}
              hoverOpacity={1}
              activities={activities}
              showOnlyForBrands={['Garmin']}
            />
            <StravaLogo />
          <h1 className="hero-title">Analysis & Recommendations</h1>
          <div className="hero-content">
           {summary?.plan && (
              <div className="plan-info-container">
                <div className="plan-info-content">
                  {period && period.start && period.end && (
                    <div className="period-info">
                      Period: <b>{formatDate(period.start)}</b> — <b>{formatDate(period.end)}</b>
                    </div>
                  )}
                  
                  <div className="plan-description">
                    <span>
                      <strong>{summary.plan.description}</strong>
                      {summary.plan.experienceLevel && summary.plan.timeAvailable && (
                        <span className="plan-details">
                           {summary.plan.timeAvailable}h/week - {Math.round(summary.plan.rides/4)} rides/week
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                
                <div className="plan-actions">
                  <button
                    onClick={() => navigate('/profile?tab=training')}
                    className="change-plan-btn"
                  >
                    Change plan
                  </button>
                </div>
              </div>
            )}
            {summary && (
              <>
                {isEmptyPeriod(summary) ? (
                  <div className="empty-period-message">
                    <h3>No Data. Rides are waiting for you!</h3>
                    <b>Start doing rides to commit progress for current period</b>
                  </div>
                ) : (
                  <div className="plan-fact-hero">
                    <div className="plan-fact-hero-card">
                      <div className="card-stats">
                        <span className="card-percentage">{summary.progress.rides}%</span>
                        <span className="card-fraction">{summary.totalRides} / {summary.plan?.rides || 12}</span>
                      </div>
                      <div className="card-label">Workouts</div>
                    </div>
                    <div className="plan-fact-hero-card">
                      <div className="card-stats">
                        <span className="card-percentage">{summary.progress.km}%</span>
                        <span className="card-fraction">{summary.totalKm} / {summary.plan?.km || 400}</span>
                      </div>
                      <div className="card-label">Volume, km</div>
                    </div>
                    <div className="plan-fact-hero-card">
                      <div className="card-stats">
                        <span className="card-percentage">{summary.progress.long}%</span>
                        <span className="card-fraction">{summary.longRidesCount} / {summary.plan?.long || 4}</span>
                      </div>
                      <div className="card-label">Long rides</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )}

        {/* Прогресс по 4-недельным периодам */}
        {!pageLoading && (
          <div>
            <ProgressChart data={periodSummary} />
          </div>
        )}

        {/* FTP & VO2max Analysis */}
        {!pageLoading && activities.length > 0 && (
          <FTPAnalysis 
            activities={activities}
            selectedPeriod={selectedPeriod}
            userProfile={userProfile}
            summary={summary}
          />
        )}
        
        {/* Основной контент */}
        <div className="plan-content">
          {loading && <div className="content-loader"><div></div></div>}
          
          {!loading && !error && (
            <>
            <div className='charts-container'>
            <h2 className="analitycs-heading">Power</h2>
            <PowerAnalysis activities={activities} />
            <h2 className="analitycs-heading">Heart</h2>
               <HeartRateVsSpeedChart activities={activities} />
               <AverageHeartRateTrendChart activities={activities} />
               <MinMaxHeartRateBarChart activities={activities} />
               <HeartRateVsElevationChart activities={activities} />
               <HeartRateZonesChart activities={activities} />
              
             

              <h2 className="analitycs-heading">Cadence</h2>
               <CadenceStandardsAnalysis activities={activities} />
               <CadenceVsSpeedChart activities={activities} />
               <AverageCadenceTrendChart activities={activities} />
               <CadenceVsElevationChart activities={activities} />
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
