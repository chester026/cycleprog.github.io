import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {jwtDecode} from 'jwt-decode';
import {apiFetch, TokenStorage} from '../utils/api';
import type {Activity} from '../types/activity';
import {ProgressChart} from '../components/ProgressChart';
import SkillsRadarChart from '../components/SkillsRadarChart';
import {FTPAnalysis} from '../components/FTPAnalysis';
import {PowerAnalysis} from '../components/PowerAnalysis';
import {HeartAnalysis} from '../components/HeartAnalysis';
import {SpeedAnalysis} from '../components/SpeedAnalysis';
import {CadenceAnalysis} from '../components/CadenceAnalysis';
import {KnowledgeCenterModal} from '../components/KnowledgeCenter';
import {PulseIcon} from '../assets/img/icons/PulseIcon';
import {getDateLocaleShort} from '../i18n/dateLocale';
import {useAppData} from '../contexts/AppDataContext';
import {getSnapshotHistory, computeMetricTrend, MetricTrend} from '../utils/analyticsSnapshot';
import {logger} from '../lib/logger';
import {getDateOfISOWeek, getISOWeekNumber, getISOYear, median, computeHrZones} from '@bikelab/shared/calc';

// getISOWeekNumber/getISOYear/getDateOfISOWeek moved to @bikelab/shared/calc
// (T-2.4, reconciled with react-spa/src/pages/AnalysisPage.jsx's copies).

export const AnalysisScreen = () => {
  const {t} = useTranslation();
  const {loadActivities, loadUserProfile} = useAppData();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [powerStats, setPowerStats] = useState<any>(null);
  const [heartStats, setHeartStats] = useState<any>(null);
  const [speedStats, setSpeedStats] = useState<any>(null);
  const [cadenceStats, setCadenceStats] = useState<any>(null);
  const [apiSkills, setApiSkills] = useState<any>(null);
  const [riderProfile, setRiderProfile] = useState<any>(null);
  const [skillsTrend, setSkillsTrend] = useState<any>(null);
  const [metricsTrend, setMetricsTrend] = useState<MetricTrend | null>(null);
  const [knowledgeTopic, setKnowledgeTopic] = useState<string | null>(null);

  const handleHelpPress = useCallback((topicId: string) => {
    setKnowledgeTopic(topicId);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (forceRefresh: boolean = false) => {
    if (!forceRefresh) {
      setLoading(true);
    }
    
    try {
      const activitiesData = await loadActivities(forceRefresh);
      const profileData = await loadUserProfile(forceRefresh);

      // Получаем user_id из JWT токена
      const token = await TokenStorage.getToken();
      if (profileData && token && !profileData.id) {
        try {
          const decoded: any = jwtDecode(token);

          // Добавляем id из токена в профиль
          profileData.id = decoded.userId;
        } catch (err) {
          logger.error('❌ Error decoding token:', err);
        }
      }
      
      setActivities(activitiesData);
      setUserProfile(profileData);
      // Streams are no longer persisted to AsyncStorage (T-3.6, docs/audit/
      // layers/02-bikelabapp.md A-04) — utils/streamsCache.ts's in-memory
      // cache needs no periodic cleanup, so cleanupOldStreams() is gone.
    } catch (error) {
      logger.error('Error loading analysis data:', error);
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

  // HR zones for the current user (T-3.1): prefer the server-derived value
  // on the profile (`GET /api/user-profile` always sets it); fall back to
  // computing it locally if the profile hasn't loaded yet. Returns the
  // 5-band array (index 0 = zone 1 … index 4 = zone 5).
  const calculateUserHRZones = () => {
    if (userProfile?.hr_zones?.zones) return userProfile.hr_zones.zones;
    return computeHrZones(userProfile || {}).zones;
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

    // HR Zones (userHRZones is an array, index 0 = zone 1 … index 4 = zone 5)
    const userHRZones = calculateUserHRZones();
    const flatsInZone = flats.filter(
      a =>
        a.average_heartrate &&
        a.average_heartrate >= userHRZones[0].min &&
        a.average_heartrate <= (userHRZones[2].max ?? Infinity),
    ).length;
    const flatZonePct = flats.length
      ? Math.round((flatsInZone / flats.length) * 100)
      : 0;

    const hillsInZone = hills.filter(
      a =>
        a.average_heartrate &&
        a.average_heartrate >= userHRZones[2].min &&
        a.average_heartrate <= (userHRZones[3].max ?? Infinity),
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

  // VO2max used to be computed here from raw activities (ported from an
  // inline server.js copy). T-3.2 (docs/audit/00-AUDIT-AND-PLAN.md,
  // docs/audit/layers/04-cross-layer.md §4.3): the server is now the single
  // source of truth for the estimated VO2max (via `@bikelab/shared/calc`'s
  // `estimateVO2maxFromActivities`), same as react-spa's AnalysisPage —
  // this screen just reads `summary.vo2max` from `GET /api/analytics/summary`
  // instead of recomputing it locally.

  // Формируем summary для Skills (берём vo2max с сервера, остальное — из
  // локальных активностей/профиля, как раньше)
  useEffect(() => {
    if (!userProfile || activities.length === 0) return;
    let cancelled = false;

    (async () => {
      let vo2max: number | null = null;
      let power = null;
      try {
        const res = await apiFetch('/api/analytics/summary?period=4w');
        vo2max = res?.summary?.vo2max ?? null;
        // T-3.5: server-computed power stats (avg/best/worst/counts) built
        // from each activity's persisted `estimated_power` — PowerAnalysis
        // reads this instead of computing its own estimate.
        power = res?.summary?.power ?? null;
      } catch (err) {
        logger.error('Error loading analytics summary for VO2max:', err);
      }
      if (cancelled) return;

      const summaryData = {
        vo2max,
        power,
        lthr: userProfile.lactate_threshold || null,
        totalDistance: activities.reduce(
          (sum, a) => sum + (a.distance || 0) / 1000,
          0,
        ),
      };

      setSummary(summaryData);
      // PowerStats обновляется через callback PowerAnalysis компонента
    })();

    return () => {
      cancelled = true;
    };
  }, [userProfile, activities]);

  // Skills radar + trend (T-3.3, docs/audit/00-AUDIT-AND-PLAN.md T-3.3,
  // docs/audit/layers/02-bikelabapp.md A-07): the server now computes skills
  // and snapshots skills_history/analytics_snapshots itself
  // (routes/skills.js) — this screen just reads the result. Removes the
  // A-07 race (a client-side snapshot could be POSTed with `power = 0`
  // before PowerAnalysis's wind-adjusted estimate was ready) and the double-
  // POST W-44 describes, since both clients used to write these tables with
  // their own (drifted) formulas.
  useEffect(() => {
    if (!userProfile?.id || !activities.length) return;
    let alive = true;
    apiFetch('/api/skills')
      .then(res => {
        if (!alive || !res) return;
        setApiSkills(res.skills);
        setRiderProfile(res.riderProfile);
        setSkillsTrend(res.trend);
      })
      .catch(err => logger.warn('Failed to load /api/skills:', err));
    return () => {
      alive = false;
    };
  }, [userProfile, activities]);

  // +/- badge next to Avg Power/HR/Cadence, same idea as skillsTrend above —
  // just diffing the two most recent analytics_snapshots rows instead of
  // skills_history. Read-only, so it's fine for this to re-fire.
  useEffect(() => {
    if (!activities.length) return;
    let alive = true;
    getSnapshotHistory(2).then(history => {
      if (alive) setMetricsTrend(computeMetricTrend(history));
    });
    return () => {
      alive = false;
    };
  }, [activities]);

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
      return date.toLocaleDateString(getDateLocaleShort(), {
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

    const description = userProfile.plan_description || t('analysis.balancedPlan');
    const timeAvailable = userProfile.time_available || 5;
    const ridesPerWeek = userProfile.workouts_per_week || 3;

    return {
      description,
      details: `${timeAvailable}${t('analysis.hWeek')}${ridesPerWeek}${t('analysis.ridesWeek')}`,
    };
  }, [userProfile, t]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#274dd3" />
        <Text style={styles.loadingText}>{t('analysis.loading')}</Text>
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
      {/* Header — solid dark card (video background removed), giant faded
          "ANALYSIS" watermark instead of a normal title, 3-column metric
          row each with its own progress bar, plan info below a divider. */}
      <View style={styles.analysisHeader}>
        <Text style={styles.watermarkTitle} numberOfLines={1} pointerEvents="none">
          {t('analysis.title')}
        </Text>

        <View style={styles.headerContent}>
          {heroSummary ? (
            <View style={styles.heroCards}>
              <View style={styles.heroCard}>
                <Text style={styles.cardLabel}>{t('analysis.workouts')}</Text>
                <Text style={styles.cardPercentage}>{heroSummary.progress.rides}%</Text>
                <Text style={styles.cardFraction}>
                  {heroSummary.totalRides} / {heroSummary.plan.rides}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {width: `${Math.min(Math.max(heroSummary.progress.rides, 0), 100)}%`},
                    ]}
                  />
                </View>
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroCard}>
                <Text style={styles.cardLabel}>{t('analysis.volume')}</Text>
                <Text style={styles.cardPercentage}>{heroSummary.progress.km}%</Text>
                <Text style={styles.cardFraction}>
                  {heroSummary.totalKm} / {heroSummary.plan.km}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {width: `${Math.min(Math.max(heroSummary.progress.km, 0), 100)}%`},
                    ]}
                  />
                </View>
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroCard}>
                <Text style={styles.cardLabel}>{t('analysis.longRides')}</Text>
                <Text style={styles.cardPercentage}>{heroSummary.progress.long}%</Text>
                <Text style={styles.cardFraction}>
                  {heroSummary.longRidesCount} / {heroSummary.plan.long}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {width: `${Math.min(Math.max(heroSummary.progress.long, 0), 100)}%`},
                    ]}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t('analysis.noData')}</Text>
              <Text style={styles.emptyMessage}>
                {t('analysis.startRiding')}
              </Text>
            </View>
          )}
        </View>

        {/* Plan Info */}
        {planInfo && (
          <>
            <View style={styles.headerDivider} />
            <View style={styles.planInfoContainer}>
              <View style={styles.planInfoLeft}>
                <PulseIcon size={16} color="#274dd3" />
                <Text style={styles.planDescription}>{planInfo.description}</Text>
              </View>
              <Text style={styles.planDetails}>{planInfo.details}</Text>
            </View>
          </>
        )}
      </View>
       
      {/* Progress Chart */}
      {progressData.length > 0 && (
        <View style={styles.chartsContainer}>
          <ProgressChart data={progressData} onHelpPress={handleHelpPress} />
        </View>
      )}

      {/* Skills Radar Chart */}
      {activities.length > 0 && (
        <View style={styles.chartsContainer}>
          <SkillsRadarChart
            skills={apiSkills}
            riderProfile={riderProfile}
            skillsTrend={skillsTrend}
            onHelpPress={handleHelpPress}
          />
        </View>
      )}
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
          summary={summary?.power}
          onStatsCalculated={(stats) => {
            setPowerStats(stats);
          }}
          onHelpPress={handleHelpPress}
          trend={metricsTrend?.avg_power}
        />
      )}

      {/* Heart Analysis */}
      {activities.length > 0 && userProfile && (
        <HeartAnalysis
          activities={activities}
          userProfile={userProfile}
          onStatsCalculated={setHeartStats}
          onHelpPress={handleHelpPress}
          trend={metricsTrend?.avg_hr}
        />
      )}

      {/* Speed Analysis */}
      {activities.length > 0 && (
        <SpeedAnalysis
          activities={activities}
          onStatsCalculated={setSpeedStats}
          onHelpPress={handleHelpPress}
        />
      )}

      {/* Cadence Analysis */}
      {activities.length > 0 && (
        <CadenceAnalysis
          activities={activities}
          onStatsCalculated={setCadenceStats}
          onHelpPress={handleHelpPress}
          trend={metricsTrend?.avg_cadence}
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
    backgroundColor: '#1A1A1A',
    paddingBottom: 52
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#888',
  },
  // Solid dark card replacing the old video+blur header. Rounded bottom
  // corners only (screen edge clips the top), background a touch darker
  // than the page (#1a1a1a) so the rounding actually reads against it.
  analysisHeader: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    paddingTop: 72,
   
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  // Giant low-opacity title standing in for a normal heading — same text
  // as before (t('analysis.title')), just rendered huge/faded as a
  // background watermark instead of a small solid-white line.
  watermarkTitle: {
    fontSize: 55,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    marginLeft: 16,
    color: '#d6d6d6',
   
  },
  headerContent: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 36,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginHorizontal: 16,
  },
  planInfoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
    marginBottom: 4,
  },
  planInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planDescription: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  planDetails: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  heroCards: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroCard: {
    flex: 1,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginTop: 6,
    marginHorizontal: 12,
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
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#274dd3',
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
    backgroundColor: '#1A1A1A',
    
  },
});


