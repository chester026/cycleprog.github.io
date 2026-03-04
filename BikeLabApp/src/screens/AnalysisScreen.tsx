import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Video from 'react-native-video';
import {BlurView} from '@react-native-community/blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {jwtDecode} from 'jwt-decode';
import {apiFetch} from '../utils/api';
import {cleanupOldStreams} from '../utils/streamsCache';
import type {Activity} from '../types/activity';
import {ProgressChart} from '../components/ProgressChart';
import SkillsRadarChart from '../components/SkillsRadarChart';
import {FTPAnalysis} from '../components/FTPAnalysis';
import {PowerAnalysis} from '../components/PowerAnalysis';
import {HeartAnalysis} from '../components/HeartAnalysis';
import {SpeedAnalysis} from '../components/SpeedAnalysis';
import {CadenceAnalysis} from '../components/CadenceAnalysis';
import {KnowledgeCenterModal} from '../components/KnowledgeCenter';

// Утилиты для работы с ISO неделями
const getISOWeekNumber = (date: Date): number => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
  return 1 + Math.ceil(dayDiff / 7);
};

const getISOYear = (date: Date): number => {
  const d = new Date(date);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  return d.getFullYear();
};

const getDateOfISOWeek = (week: number, year: number): Date => {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = new Date(simple);
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return ISOweekStart;
};

export const AnalysisScreen = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [powerStats, setPowerStats] = useState<any>(null);
  const [currentSkills, setCurrentSkills] = useState<any>(null);
  const [skillsTrend, setSkillsTrend] = useState<any>(null);
  const [knowledgeTopic, setKnowledgeTopic] = useState<string | null>(null);

  const handleHelpPress = useCallback((topicId: string) => {
    setKnowledgeTopic(topicId);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Стабильный callback для получения рассчитанных скиллов
  const handleSkillsCalculated = useCallback((skills: any) => {
    console.log('📊 Skills calculated:', skills);
    setCurrentSkills(skills);
  }, []);

  const loadData = async (forceRefresh: boolean = false) => {
    if (!forceRefresh) {
      setLoading(true);
    }
    
    try {
      // Загружаем activities с кешированием
      let activitiesData: Activity[] = [];
      
      // Проверяем кеш только если не принудительное обновление
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem('activities_cache');
        if (cached) {
          const {data, timestamp} = JSON.parse(cached);
          // Используем кеш если моложе 30 минут
          if (Date.now() - timestamp < 30 * 60 * 1000) {
            console.log('📦 Using cached activities');
            activitiesData = data;
          }
        }
      }
      
      // Загружаем из API если нет кеша или принудительное обновление
      if (activitiesData.length === 0 || forceRefresh) {
        console.log('🌐 Fetching activities from API' + (forceRefresh ? ' (force refresh)' : ''));
        activitiesData = await apiFetch('/api/activities');
        // Сохраняем в кеш
        await AsyncStorage.setItem('activities_cache', JSON.stringify({
          data: activitiesData,
          timestamp: Date.now()
        }));
      }
      
      const profileData = await apiFetch('/api/user-profile');
      
      console.log('👤 User profile loaded:');
      console.log(JSON.stringify(profileData, null, 2));
      console.log('   - id:', profileData?.id);
      console.log('   - user_id:', profileData?.user_id);
      console.log('   - email:', profileData?.email);
      
      // Получаем user_id из JWT токена
      const token = await AsyncStorage.getItem('token');
      if (token && !profileData?.id) {
        try {
          const decoded: any = jwtDecode(token);
          console.log('🔑 Decoded token:', decoded);
          console.log('   - userId:', decoded.userId);
          
          // Добавляем id из токена в профиль
          profileData.id = decoded.userId;
          console.log('✅ Added id to userProfile:', profileData.id);
        } catch (err) {
          console.error('❌ Error decoding token:', err);
        }
      }
      
      setActivities(activitiesData);
      setUserProfile(profileData);
      
      // Очищаем старые streams (>28 дней) в фоне
      cleanupOldStreams(28).catch(err => 
        console.error('Error cleaning up streams:', err)
      );
    } catch (error) {
      console.error('Error loading analysis data:', error);
    } finally {
      if (forceRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true); // Принудительное обновление с сервера
  }, []);

  // Утилиты для расчета прогресса
  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  const calculateUserHRZones = () => {
    const maxHR = userProfile?.max_heart_rate || 190;
    const lthr = userProfile?.lthr || maxHR * 0.85;

    return {
      zone1: {min: Math.round(maxHR * 0.5), max: Math.round(maxHR * 0.6)},
      zone2: {min: Math.round(maxHR * 0.6), max: Math.round(maxHR * 0.7)},
      zone3: {min: Math.round(maxHR * 0.7), max: Math.round(maxHR * 0.8)},
      zone4: {min: Math.round(maxHR * 0.8), max: Math.round(maxHR * 0.9)},
      zone5: {min: Math.round(maxHR * 0.9), max: maxHR},
    };
  };

  const getGoalOrFallback = (goalType: string): number => {
    const experienceLevel = userProfile?.experience_level || 'intermediate';

    if (goalType === 'speed_flat') {
      switch (experienceLevel) {
        case 'beginner':
          return 25;
        case 'intermediate':
          return 30;
        case 'advanced':
          return 35;
        default:
          return 30;
      }
    } else if (goalType === 'speed_hills') {
      switch (experienceLevel) {
        case 'beginner':
          return 15;
        case 'intermediate':
          return 17.5;
        case 'advanced':
          return 20;
        default:
          return 17.5;
      }
    } else if (goalType === 'easy_distance') {
      switch (experienceLevel) {
        case 'beginner':
          return 20;
        case 'intermediate':
          return 25;
        case 'advanced':
          return 30;
        default:
          return 25;
      }
    } else if (goalType === 'easy_speed') {
      switch (experienceLevel) {
        case 'beginner':
          return 18;
        case 'intermediate':
          return 20;
        case 'advanced':
          return 22;
        default:
          return 20;
      }
    } else if (goalType === 'easy_elevation') {
      switch (experienceLevel) {
        case 'beginner':
          return 200;
        case 'intermediate':
          return 300;
        case 'advanced':
          return 400;
        default:
          return 300;
      }
    }

    return goalType === 'speed_flat' ? 30 : 17.5;
  };

  // Функция для расчета процентов выполнения за период
  const percentForPeriod = (
    periodActivities: Activity[],
    startDate: Date,
    endDate: Date,
  ) => {
    const speedFlatGoal = getGoalOrFallback('speed_flat');
    const speedHillGoal = getGoalOrFallback('speed_hills');
    const easyDistanceGoal = getGoalOrFallback('easy_distance');
    const easySpeedGoal = getGoalOrFallback('easy_speed');
    const easyElevationGoal = getGoalOrFallback('easy_elevation');

    // Flat rides
    const flats = periodActivities.filter(
      a =>
        a.distance > 20000 &&
        a.total_elevation_gain < a.distance * 0.005 &&
        a.average_speed * 3.6 < 40,
    );
    const flatSpeeds = flats.map(a => a.average_speed * 3.6);
    const medianFlatSpeed = median(flatSpeeds);
    const flatSpeedPct = Math.round((medianFlatSpeed / speedFlatGoal) * 100);

    // Hill rides
    const hills = periodActivities.filter(
      a =>
        a.distance > 5000 &&
        (a.total_elevation_gain > a.distance * 0.015 ||
          a.total_elevation_gain > 500) &&
        a.average_speed * 3.6 < 25,
    );
    const hillSpeeds = hills.map(a => a.average_speed * 3.6);
    const medianHillSpeed = median(hillSpeeds);
    const hillSpeedPct = Math.floor((medianHillSpeed / speedHillGoal) * 100);

    // HR Zones
    const userHRZones = calculateUserHRZones();
    const flatsInZone = flats.filter(
      a =>
        a.average_heartrate &&
        a.average_heartrate >= userHRZones.zone1.min &&
        a.average_heartrate <= userHRZones.zone3.max,
    ).length;
    const flatZonePct = flats.length
      ? Math.round((flatsInZone / flats.length) * 100)
      : 0;

    const hillsInZone = hills.filter(
      a =>
        a.average_heartrate &&
        a.average_heartrate >= userHRZones.zone3.min &&
        a.average_heartrate <= userHRZones.zone4.max,
    ).length;
    const hillZonePct = hills.length
      ? Math.round((hillsInZone / hills.length) * 100)
      : 0;

    const pulseGoalPct =
      flats.length && hills.length
        ? Math.round((flatZonePct + hillZonePct) / 2)
        : flatZonePct || hillZonePct;

    // Long rides
    const longRides = periodActivities.filter(
      a => a.distance > 50000 || a.moving_time > 2.5 * 3600,
    );
    const longTarget = 4;
    const longRidePct = Math.round((longRides.length / longTarget) * 100);

    // Easy rides
    const easyRides = periodActivities.filter(
      a =>
        (a.distance < easyDistanceGoal * 1000 ||
          a.average_speed * 3.6 < easySpeedGoal) &&
        a.total_elevation_gain < easyElevationGoal,
    );
    const easyPct = Math.round((easyRides.length / 4) * 100);

    const all = [flatSpeedPct, hillSpeedPct, pulseGoalPct, longRidePct, easyPct];
    const avg = Math.round(all.reduce((sum, val) => sum + val, 0) / all.length);

    return {avg, all, start: startDate, end: endDate};
  };

  // Рассчитываем 4-недельные периоды (как на web)
  const calculate4WeekPeriods = useMemo(() => {
    if (activities.length === 0) return [];

    const sortedActivities = activities
      .slice()
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

    const periods: any[] = [];
    const activitiesByYear: Record<number, Activity[]> = {};

    // Группируем по ISO годам
    sortedActivities.forEach(activity => {
      const year = getISOYear(new Date(activity.start_date));
      if (!activitiesByYear[year]) {
        activitiesByYear[year] = [];
      }
      activitiesByYear[year].push(activity);
    });

    // Создаем 4-недельные циклы для каждого года
    Object.keys(activitiesByYear)
      .sort()
      .forEach(yearStr => {
        const year = parseInt(yearStr);
        const yearActivities = activitiesByYear[year];

        const weekNumbers = yearActivities.map(a =>
          getISOWeekNumber(new Date(a.start_date)),
        );
        const minWeek = Math.min(...weekNumbers);
        const maxWeek = Math.max(...weekNumbers);

        // Создаем циклы по 4 недели
        for (
          let cycleIndex = 0;
          minWeek + cycleIndex * 4 <= maxWeek;
          cycleIndex++
        ) {
          const startWeekInCycle = minWeek + cycleIndex * 4;

          const cycleStartDate = getDateOfISOWeek(startWeekInCycle, year);
          const cycleEndDate = getDateOfISOWeek(startWeekInCycle + 3, year);
          cycleEndDate.setDate(cycleEndDate.getDate() + 6); // Конец недели

          const cycleActivities = yearActivities.filter(a => {
            const activityDate = new Date(a.start_date);
            return activityDate >= cycleStartDate && activityDate <= cycleEndDate;
          });

          if (cycleActivities.length > 0) {
            periods.push({
              activities: cycleActivities,
              startDate: cycleStartDate,
              endDate: cycleEndDate,
            });
          }
        }
      });

    return periods;
  }, [activities]);

  // Берем текущий (последний) период
  const currentPeriod = useMemo(() => {
    if (calculate4WeekPeriods.length === 0) return null;
    return calculate4WeekPeriods[calculate4WeekPeriods.length - 1];
  }, [calculate4WeekPeriods]);

  const filteredActivities = currentPeriod ? currentPeriod.activities : [];

  // Функция расчета VO2max из активностей (портировано из server.js)
  const calculateVO2max = (acts: Activity[]): number | null => {
    if (!acts || acts.length === 0) return null;

    // Лучшая скорость и средний HR
    const bestSpeed = Math.max(...acts.map(a => (a.average_speed || 0) * 3.6));
    const activitiesWithHR = acts.filter(a => a.average_heartrate);
    const avgHR =
      activitiesWithHR.length > 0
        ? activitiesWithHR.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) /
          activitiesWithHR.length
        : 0;

    // Данные профиля
    const age = userProfile?.age || 35;
    const weight = userProfile?.weight || 75;
    const gender = userProfile?.gender || 'male';
    const restingHR = userProfile?.resting_heartrate || 60;
    const maxHR = userProfile?.max_heartrate || 220 - age;

    if (bestSpeed < 10) return null;

    // Базовый расчет VO₂max
    let vo2max: number;
    if (bestSpeed >= 40) {
      vo2max = 2.8 * bestSpeed - 25;
    } else {
      vo2max = 1.8 * bestSpeed + 10;
    }

    // Возрастная корректировка
    const ageAdjustment = Math.max(0.85, 1 - (age - 25) * 0.005);
    vo2max *= ageAdjustment;

    // Гендерная корректировка
    if (gender === 'female') {
      vo2max *= 0.88;
    }

    // HR корректировка
    if (avgHR && restingHR && maxHR) {
      const hrReserve = maxHR - restingHR;
      const avgHRPercent = (avgHR - restingHR) / hrReserve;

      if (avgHRPercent > 0.85 && bestSpeed < 35) {
        vo2max *= 0.92;
      } else if (avgHRPercent < 0.7 && bestSpeed > 30) {
        vo2max *= 1.05;
      }
    }

    // Бонус за тренированность
    const intervals = acts.filter(
      a =>
        (a.name || '').toLowerCase().includes('интервал') ||
        (a.name || '').toLowerCase().includes('interval'),
    );
    const longRides = acts.filter(
      a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600,
    ).length;
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentActs = acts.filter(a => new Date(a.start_date) > monthAgo);

    let fitnessBonus = 1;
    if (intervals.length >= 8) fitnessBonus += 0.08;
    else if (intervals.length >= 4) fitnessBonus += 0.05;
    else if (intervals.length >= 2) fitnessBonus += 0.02;

    if (longRides >= 4) fitnessBonus += 0.03;
    if (recentActs.length >= 12) fitnessBonus += 0.03;

    vo2max *= fitnessBonus;

    // Ограничения
    vo2max = Math.max(25, Math.min(80, vo2max));

    return Math.round(vo2max);
  };

  // Формируем summary для Skills (используем данные из userProfile и вычисляем VO2max)
  useEffect(() => {
    if (userProfile && activities.length > 0) {
      // Вычисляем VO2max из активностей (последние 4 недели)
      const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const recentActivities = activities.filter(
        a => new Date(a.start_date) > fourWeeksAgo,
      );
      const calculatedVO2max = calculateVO2max(recentActivities);

      const summaryData = {
        vo2max: calculatedVO2max,
        lthr: userProfile.lthr || null,
        totalDistance: activities.reduce(
          (sum, a) => sum + (a.distance || 0) / 1000,
          0,
        ),
      };
      
      setSummary(summaryData);
      // PowerStats обновляется через callback PowerAnalysis компонента
    }
  }, [userProfile, activities]);

  // Управление skills history (загрузка, сохранение, тренды)
  useEffect(() => {
    const manageSkillsHistory = async () => {
      console.log('🔄 manageSkillsHistory called:', {
        hasUserProfile: !!userProfile?.id,
        hasCurrentSkills: !!currentSkills,
        hasSummary: !!summary,
        userProfile: userProfile,
      });

      if (!userProfile?.id || !currentSkills || !summary) {
        console.log('⏳ Waiting for data...');
        console.log('   - userProfile:', JSON.stringify(userProfile));
        console.log('   - userProfile.id:', userProfile?.id);
        console.log('   - userProfile.user_id:', userProfile?.user_id);
        console.log('   - userProfile keys:', userProfile ? Object.keys(userProfile) : 'none');
        console.log('   - currentSkills:', currentSkills ? 'exists' : 'missing');
        console.log('   - summary:', summary ? 'exists' : 'missing');
        return;
      }

      console.log('✅ All data ready, fetching skills history...');
      console.log('💪 Current skills (just calculated):');
      console.log('   - climbing:', currentSkills.climbing);
      console.log('   - sprint:', currentSkills.sprint);
      console.log('   - endurance:', currentSkills.endurance);
      console.log('   - tempo:', currentSkills.tempo);
      console.log('   - power:', currentSkills.power, '← ТЕКУЩИЙ РАСЧЕТ');
      console.log('   - consistency:', currentSkills.consistency);

      try {
        // 1. Получаем последний снимок и последнюю активность из снимка
        const lastSnapshot = await apiFetch('/api/skills-history/last').catch(() => null);
        
        let shouldSave = false;
        let saveReason = '';

        if (!lastSnapshot) {
          // НЕТ СНИМКОВ ВООБЩЕ - сохраняем первый снимок
          shouldSave = true;
          saveReason = 'First snapshot';
          console.log('📸 First snapshot - will save');
        } else {
          // Проверяем, появилась ли новая тренировка с момента последнего снимка
          // Сравниваем ID последней активности
          
          const lastSnapshotActivityId = lastSnapshot.last_activity_id;
          const currentLastActivityId = activities.length > 0 ? activities[0].id : null;
          
          console.log('📅 Activity ID check:');
          console.log('   - Last snapshot activity ID:', lastSnapshotActivityId);
          console.log('   - Current last activity ID:', currentLastActivityId);
          
          if (currentLastActivityId && String(currentLastActivityId) !== String(lastSnapshotActivityId)) {
            // ID последней активности изменился - есть новая тренировка
            shouldSave = true;
            saveReason = `New activity ID: ${currentLastActivityId}`;
            console.log(`📸 Activity ID changed (${lastSnapshotActivityId} → ${currentLastActivityId}) - will save`);
          } else {
            console.log('⏭️ Activity ID unchanged - skip save');
          }
        }

        // 2. Если есть новые тренировки - сохраняем новый снимок
        if (shouldSave) {
          console.log(`💾 Saving snapshot: ${saveReason}`);
          
          // Фикс для power: если текущий power = 0, но в предыдущем снимке был > 0,
          // сохраняем предыдущее значение (чтобы избежать скачков 0 → 40 → 0)
          const skillsToSave = {...currentSkills};
          
          if (lastSnapshot && 
              Math.round(currentSkills.power) === 0 && 
              Math.round(lastSnapshot.power) > 0) {
            console.log(`⚠️ Power is 0, but was ${lastSnapshot.power} before - keeping previous value`);
            skillsToSave.power = lastSnapshot.power;
          }
          
          await apiFetch('/api/skills-history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: userProfile.id,
              last_activity_id: activities[0]?.id || null,
              ...skillsToSave,
            }),
          });
          console.log('✅ Snapshot saved');
        }

        // 3. Получаем последние 2 снимка для вычисления трендов
        const allSnapshots = await apiFetch('/api/skills-history/range?limit=2').catch(() => []);

        console.log('📊 Skills snapshots:', allSnapshots?.length || 0);

        if (allSnapshots && allSnapshots.length >= 2) {
          // Сравниваем ПОСЛЕДНИЙ и ПРЕДПОСЛЕДНИЙ снимки
          const latest = allSnapshots[0]; // Самый свежий
          const previous = allSnapshots[1]; // Предыдущий

          console.log('🔍 Latest snapshot:');
          console.log('   - climbing:', latest.climbing);
          console.log('   - sprint:', latest.sprint);
          console.log('   - endurance:', latest.endurance);
          console.log('   - tempo:', latest.tempo);
          console.log('   - power:', latest.power, '← ТЕКУЩИЙ');
          console.log('   - consistency:', latest.consistency);
          console.log('   - created_at:', latest.created_at);
          
          console.log('🔍 Previous snapshot:');
          console.log('   - climbing:', previous.climbing);
          console.log('   - sprint:', previous.sprint);
          console.log('   - endurance:', previous.endurance);
          console.log('   - tempo:', previous.tempo);
          console.log('   - power:', previous.power, '← ПРЕДЫДУЩИЙ');
          console.log('   - consistency:', previous.consistency);
          console.log('   - created_at:', previous.created_at);

          const trends = {
            climbing: Math.round(latest.climbing) - Math.round(previous.climbing),
            sprint: Math.round(latest.sprint) - Math.round(previous.sprint),
            endurance: Math.round(latest.endurance) - Math.round(previous.endurance),
            tempo: Math.round(latest.tempo) - Math.round(previous.tempo),
            power: Math.round(latest.power) - Math.round(previous.power),
            consistency: Math.round(latest.consistency) - Math.round(previous.consistency),
          };
          
          console.log('📈 Calculated trends:');
          console.log('   - power trend:', Math.round(latest.power), '-', Math.round(previous.power), '=', trends.power);
          console.log('   - full trends:', trends);
          setSkillsTrend(trends);
        } else {
          console.log('⚠️ Not enough snapshots for trends:', allSnapshots?.length || 0);
        }
      } catch (err) {
        console.error('Error managing skills history:', err);
        // Не показываем ошибку пользователю - это некритичная функция
      }
    };

    manageSkillsHistory();
  }, [userProfile, currentSkills, summary]);

  // Рассчитываем прогресс для каждого периода (для графика)
  // Берем только последние 14 периодов
  const progressData = useMemo(() => {
    if (!userProfile) return [];
    
    const allProgress = calculate4WeekPeriods.map(period => {
      return percentForPeriod(
        period.activities,
        period.startDate,
        period.endDate,
      );
    });

    // Ограничиваем до последних 14 периодов
    return allProgress.slice(-14);
  }, [calculate4WeekPeriods, userProfile]);

  // Рассчитываем hero summary
  const heroSummary = useMemo(() => {
    if (filteredActivities.length === 0) return null;

    const totalRides = filteredActivities.length;
    const totalKm = Math.round(
      filteredActivities.reduce(
        (sum: number, a: Activity) => sum + a.distance / 1000,
        0,
      ),
    );
    const totalTime = Math.round(
      filteredActivities.reduce(
        (sum: number, a: Activity) => sum + a.moving_time / 3600,
        0,
      ),
    );
    const totalElevation = Math.round(
      filteredActivities.reduce(
        (sum: number, a: Activity) => sum + a.total_elevation_gain,
        0,
      ),
    );

    // Long rides (>70km или >2h)
    const longRidesCount = filteredActivities.filter(
      (a: Activity) => a.distance / 1000 > 70 || a.moving_time / 3600 > 2,
    ).length;

    // План из профиля
    // workouts_per_week * 4 = rides per 4 weeks
    const ridesPerCycle = (userProfile?.workouts_per_week || 3) * 4;
    const kmPerCycle = (userProfile?.weekly_goal_km || 100) * 4;
    const longRidesPerCycle = 4; // стандартно 4 длинных заезда за 4 недели

    const plan = {
      rides: ridesPerCycle,
      km: kmPerCycle,
      long: longRidesPerCycle,
    };

    return {
      totalRides,
      totalKm,
      totalTime,
      totalElevation,
      longRidesCount,
      plan,
      progress: {
        rides: Math.min(Math.round((totalRides / plan.rides) * 100), 100),
        km: Math.min(Math.round((totalKm / plan.km) * 100), 100),
        long: Math.min(Math.round((longRidesCount / plan.long) * 100), 100),
      },
    };
  }, [filteredActivities, userProfile]);

  // Форматируем даты периода из текущего 4-недельного цикла
  const periodDates = useMemo(() => {
    if (!currentPeriod) return null;

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
      });
    };

    return {
      start: formatDate(currentPeriod.startDate),
      end: formatDate(currentPeriod.endDate),
    };
  }, [currentPeriod]);

  // Информация о плане пользователя
  const planInfo = useMemo(() => {
    if (!userProfile) return null;

    const description = userProfile.plan_description || 'Balanced intermediate plan';
    const timeAvailable = userProfile.time_available || 5;
    const ridesPerWeek = userProfile.workouts_per_week || 3;

    return {
      description,
      details: `${timeAvailable}h/week - ${ridesPerWeek} rides/week`,
    };
  }, [userProfile]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#274dd3" />
        <Text style={styles.loadingText}>Loading analysis...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#4CAF50"
          colors={['#4CAF50']}
        />
      }>
      {/* Video Header with Hero Cards */}
      <View style={styles.videoHeader}>
        {/* Background Video */}
        <Video
          source={require('../assets/bgvid.mp4')}
          style={styles.backgroundVideo}
          resizeMode="cover"
          repeat
          muted
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
        />

        {/* Blur Effect */}
        <BlurView
          blurType="dark"
          blurAmount={15}
          style={StyleSheet.absoluteFill}
          reducedTransparencyFallbackColor="rgba(10, 10, 10, 0.8)"
        />

        {/* Content */}
        <View style={styles.headerContent}>
          {/* Title */}
          <Text style={styles.title}>Analysis</Text>

         

          

          {/* Hero Cards */}
          {heroSummary ? (
            <View style={styles.heroCards}>
              <View style={styles.heroCard}>
                <View style={styles.cardStats}>
                <Text style={styles.cardLabel}>Workouts</Text>
                  <Text style={styles.cardPercentage}>
                    {heroSummary.progress.rides}%
                  </Text>
                  <Text style={styles.cardFraction}>
                    {heroSummary.totalRides} / {heroSummary.plan.rides} 
                  </Text>
                </View>
               
              </View>

              <View style={styles.heroCard}>
                <View style={styles.cardStats}>
                <Text style={styles.cardLabel}>Volume, km</Text>
                  <Text style={styles.cardPercentage}>
                    {heroSummary.progress.km}%
                  </Text>
                  <Text style={styles.cardFraction}>
                    {heroSummary.totalKm} / {heroSummary.plan.km}
                  </Text>
                </View>
               
              </View>

              <View style={styles.heroCard}>
                <View style={styles.cardStats}>
                <Text style={styles.cardLabel}>Long rides</Text>
                  <Text style={styles.cardPercentage}>
                    {heroSummary.progress.long}%
                  </Text>
                  <Text style={styles.cardFraction}>
                    {heroSummary.longRidesCount} / {heroSummary.plan.long}
                  </Text>
                </View>
               
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No Data</Text>
              <Text style={styles.emptyMessage}>
                Start riding to see your analysis
              </Text>
            </View>
          )}
          
        </View>
         {/* Plan Info */}
         {planInfo && (
            <View style={styles.planInfoContainer}>
              <Text style={styles.planDescription}>{planInfo.description}</Text>
              <Text style={styles.planDetails}>{planInfo.details}</Text>
            </View>
         )}
      </View>
       
      {/* Progress Chart */}
      {progressData.length > 0 && (
        <View style={styles.chartsContainer}>
          <ProgressChart data={progressData} onHelpPress={handleHelpPress} />
        </View>
      )}

      {/* Skills Radar Chart */}
      {activities.length > 0 && (() => {
        console.log('🎨 Rendering SkillsRadarChart, skillsTrend:', skillsTrend);
        return (
          <View style={styles.chartsContainer}>
            <SkillsRadarChart
              activities={activities}
              userProfile={userProfile}
              powerStats={powerStats}
              summary={summary}
              skillsTrend={skillsTrend}
              onSkillsCalculated={handleSkillsCalculated}
              onHelpPress={handleHelpPress}
            />
          </View>
        );
      })()}
    {/* FTP Analysis */}
    {activities.length > 0 && userProfile && summary?.vo2max && (
        <FTPAnalysis
          activities={activities}
          userProfile={userProfile}
          vo2max={summary.vo2max}
          onHelpPress={handleHelpPress}
        />
      )}
      {/* Power Analysis */}
      {activities.length > 0 && (
        <PowerAnalysis
          activities={activities}
          onStatsCalculated={(stats) => {
            setPowerStats(stats);
          }}
          onHelpPress={handleHelpPress}
        />
      )}

      {/* Heart Analysis */}
      {activities.length > 0 && userProfile && (
        <HeartAnalysis
          activities={activities}
          userProfile={userProfile}
          onHelpPress={handleHelpPress}
        />
      )}

      {/* Speed Analysis */}
      {activities.length > 0 && (
        <SpeedAnalysis
          activities={activities}
          onHelpPress={handleHelpPress}
        />
      )}

      {/* Cadence Analysis */}
      {activities.length > 0 && (
        <CadenceAnalysis
          activities={activities}
          onHelpPress={handleHelpPress}
        />
      )}

     
      <KnowledgeCenterModal
        visible={knowledgeTopic !== null}
        onClose={() => setKnowledgeTopic(null)}
        initialTopic={knowledgeTopic}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingBottom: 52
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#191b20',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888',
  },
  videoHeader: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 0,
  },
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 5, 0.015)',
  },
  headerContent: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 16,
    paddingTop: 75,
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#fff',
    marginBottom: 52,
  },
  planInfoContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  planDescription: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.9,
  },
  planDetails: {
    fontSize: 12,
    color: '#ccc',
    opacity: 0.7,
    fontWeight: '500',
  },
 
  heroCards: {
    flexDirection: 'row',
    gap: 8,
  },
  heroCard: {
    flex: 1
  },
  cardStats: {
    marginBottom: 16,
  },
  cardPercentage: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  cardFraction: {
    fontSize: 12,
    color: '#ccc',
    fontWeight: '500',
    opacity: 0.7,
  },
  cardLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#888',
  },
  chartsContainer: {
    
    backgroundColor: '#0a0a0a',
  },
});


