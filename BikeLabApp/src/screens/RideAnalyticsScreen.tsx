import React, {useState, useEffect, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {apiFetch} from '../utils/api';
import {useAppData} from '../contexts/AppDataContext';
import {Cache, CACHE_TTL} from '../utils/cache';
import {getActivityStreams} from '../utils/streamsCache';
import {SparkleIcon} from '../assets/img/icons/SparkleIcon';
import {LineChart} from 'react-native-gifted-charts';

export const RideAnalyticsScreen = ({route, navigation}: any) => {
  const {t} = useTranslation();
  const {loadUserProfile} = useAppData();
  const {activity} = route.params;
  const insets = useSafeAreaInsets();
  const [metaGoals, setMetaGoals] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streams, setStreams] = useState<any>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [rideQuality, setRideQuality] = useState<number | null>(null);
  const [rideQualityLabel, setRideQualityLabel] = useState('');
  const [rideQualityAdvice, setRideQualityAdvice] = useState('');
  const [hrZoneDistribution, setHrZoneDistribution] = useState<
    {zone: string; minutes: number; percent: number; color: string; rangeMin: number; rangeMax: number}[]
  >([]);
  const [checkingExistingChat, setCheckingExistingChat] = useState(false);

  const rideDate = (() => {
    const d = new Date(activity.start_date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  })();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Cache.remove(`ride_meta_goals_${activity.id}`);

      const [goalsRes, streamsData] = await Promise.all([
        apiFetch(`/api/activities/${activity.id}/meta-goals-progress`).catch(() => null),
        getActivityStreams(activity.id).catch(() => null),
      ]);

      if (goalsRes) {
        setMetaGoals(goalsRes);
        await Cache.set(`ride_meta_goals_${activity.id}`, goalsRes, CACHE_TTL.WEEK);
      }
      if (streamsData) {
        setStreams(streamsData);
      }
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setRefreshing(false);
    }
  }, [activity.id]);

  // Загружаем streams для графиков (с кешированием)
  useEffect(() => {
    const loadStreams = async () => {
      setStreamsLoading(true);
      try {
        const streamsData = await getActivityStreams(activity.id);
        if (streamsData) {
          setStreams(streamsData);
          console.log('✅ Streams loaded for charts');
        }
      } catch (err) {
        console.error('Error loading streams:', err);
      } finally {
        setStreamsLoading(false);
      }
    };

    loadStreams();
  }, [activity.id]);

  // Загружаем Meta Goals (кеш на клиенте 7 дней + БД на сервере)
  // В БД хранится только последний просмотренный заезд для каждой мета-цели
  useEffect(() => {
    const loadMetaGoals = async () => {
      const cacheKey = `ride_meta_goals_${activity.id}`;
      
      // Проверяем кеш на клиенте (7 дней)
      const cached = await Cache.get<any[]>(cacheKey);
      if (cached) {
        console.log('✅ Using cached meta goals from client');
        setMetaGoals(cached);
        return;
      }

      try {
        // API проверит БД, если нет - вычислит и сохранит (перезапишет для этой мета-цели)
        const goals = await apiFetch(`/api/activities/${activity.id}/meta-goals-progress`);
        
        setMetaGoals(goals || []);
        
        // Кешируем на клиенте на 7 дней
        if (goals) {
          await Cache.set(cacheKey, goals, CACHE_TTL.WEEK);
        }

      } catch (err) {
        console.error('Error loading meta goals:', err);
      }
    };

    loadMetaGoals();
  }, [activity.id]);

  // Подготовка данных для мини-графиков
  const prepareChartData = (dataArray: number[]) => {
    if (!dataArray || dataArray.length === 0) return [];
    
    // Для небольших графиков показываем максимум 200 точек
    const maxPoints = 40;
    const step = Math.max(1, Math.floor(dataArray.length / maxPoints));
    const sampledData = dataArray.filter((_, index) => index % step === 0);
    
    return sampledData.map((value, index) => ({
      value,
      index,
      dataPointText: value.toFixed(0),
    }));
  };

  // Рендер мини-графика
  const renderMiniChart = (title: string, data: number[], color: string, unit: string, excludeZeros = false) => {
    if (!data || data.length === 0) return null;

    const chartData = prepareChartData(data);
    const maxValue = Math.max(...data) * 1.1;
    
    // Для каденса исключаем нули (когда не крутим педали)
    const filteredData = excludeZeros ? data.filter(v => v > 0) : data;
    const avgValue = filteredData.length > 0 
      ? filteredData.reduce((sum, v) => sum + v, 0) / filteredData.length 
      : 0;

    return (
      <View key={title} style={styles.miniChartCard}>
        <View style={styles.miniChartHeader}>
          <Text style={styles.miniChartTitle}>{title}</Text>
          <Text style={styles.miniChartAvg}>
            {avgValue.toFixed(0)} <Text style={styles.miniChartUnit}>{unit}</Text>
          </Text>
        </View>
         <View style={styles.miniChartContent}>
          <LineChart
            data={chartData}
            width={231}
            height={100}
            maxValue={maxValue}
            spacing={Math.max(1, Math.floor(250 / chartData.length))}
            curved
            areaChart
            startFillColor={color}
            startOpacity={0.2}
            endOpacity={0}
            color={color}
            thickness={2}
            hideDataPoints={true}
            hideRules
            hideYAxisText
            hideAxesAndRules
          pointerConfig={{
            pointerStripColor: color,
            pointerStripWidth: 2,
            pointerColor: color,
            radius: 4,
            pointerLabelWidth: 55,
            pointerLabelHeight: 30,
            pointerLabelComponent: (items: any) => {
              return (
                <View style={styles.tooltipContainer}>
                  <Text style={styles.tooltipText}>
                    {items[0].value.toFixed(0)} {unit}
                  </Text>
                </View>
              );
            },
          }}
        />
        </View>
      </View>
    );
  };

  // Load user profile for HR zones
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await loadUserProfile();
        setUserProfile(profile);
      } catch (err) {
        console.error('Error loading user profile:', err);
      }
    };
    loadProfile();
  }, [loadUserProfile]);

  // Compute Ride Score + HR Zone Distribution
  useEffect(() => {
    if (!streams?.heartrate?.data || !streams?.time?.data) return;

    const hrData = streams.heartrate.data;
    const timeData = streams.time.data;
    const maxHR = userProfile?.max_hr || activity.max_heartrate || 190;
    const restHR = userProfile?.resting_hr || 60;
    const hrReserve = maxHR - restHR;

    if (hrReserve <= 0) return;

    const zoneColors = ['#C5CEEF', '#9FB4FF', '#708EF7', '#4B6DE4', '#274DD3'];
    const lt = userProfile?.lactate_threshold || 0;

    // Same formula as OnboardingScreen: LT-based if available, otherwise Karvonen (HRR)
    let zones: {zone: string; min: number; max: number; color: string}[];
    if (lt) {
      zones = [
        {zone: 'Z1', min: Math.round(lt * 0.75), max: Math.round(lt * 0.85), color: zoneColors[0]},
        {zone: 'Z2', min: Math.round(lt * 0.85), max: Math.round(lt * 0.92), color: zoneColors[1]},
        {zone: 'Z3', min: Math.round(lt * 0.92), max: Math.round(lt * 0.97), color: zoneColors[2]},
        {zone: 'Z4', min: Math.round(lt * 0.97), max: Math.round(lt * 1.03), color: zoneColors[3]},
        {zone: 'Z5', min: Math.round(lt * 1.03), max: maxHR, color: zoneColors[4]},
      ];
    } else {
      zones = [
        {zone: 'Z1', min: Math.round(restHR + hrReserve * 0.5), max: Math.round(restHR + hrReserve * 0.6), color: zoneColors[0]},
        {zone: 'Z2', min: Math.round(restHR + hrReserve * 0.6), max: Math.round(restHR + hrReserve * 0.7), color: zoneColors[1]},
        {zone: 'Z3', min: Math.round(restHR + hrReserve * 0.7), max: Math.round(restHR + hrReserve * 0.8), color: zoneColors[2]},
        {zone: 'Z4', min: Math.round(restHR + hrReserve * 0.8), max: Math.round(restHR + hrReserve * 0.9), color: zoneColors[3]},
        {zone: 'Z5', min: Math.round(restHR + hrReserve * 0.9), max: maxHR, color: zoneColors[4]},
      ];
    }

    const zoneTimes = [0, 0, 0, 0, 0];
    for (let i = 1; i < hrData.length; i++) {
      const hr = hrData[i];
      const dt = timeData[i] - timeData[i - 1];
      for (let z = zones.length - 1; z >= 0; z--) {
        if (hr >= zones[z].min) {
          zoneTimes[z] += dt;
          break;
        }
      }
    }

    const totalTime = zoneTimes.reduce((a, b) => a + b, 0);
    if (totalTime === 0) return;

    setHrZoneDistribution(
      zones.map((z, i) => ({
        zone: z.zone,
        minutes: Math.round(zoneTimes[i] / 60),
        percent: Math.round((zoneTimes[i] / totalTime) * 100),
        color: z.color,
        rangeMin: Math.round(z.min),
        rangeMax: z.max === 999 ? Math.round(maxHR) : Math.round(z.max),
      })),
    );

    // Effort Score used to be computed here too (avgHR/duration-based) but
    // moved server-side into get_activity_analysis + the RideScoreCard rich
    // chat card — it no longer has a dashboard presence. `intensity` below
    // is still needed for the Ride Quality cardiac-efficiency term.
    const avgHR =
      hrData.reduce((a: number, b: number) => a + b, 0) / hrData.length;
    const intensity = Math.max(0, Math.min(1, (avgHR - restHR) / hrReserve));

    // Ride Quality calculation
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const speedKmh = (activity.average_speed || 0) * 3.6;
    const maxSpeedKmh = (activity.max_speed || 0) * 3.6;
    const hrIntensity = clamp(intensity, 0.01, 1);

    // A. Cardiac Efficiency (40%): speed per unit of HR effort
    const efficiencyRaw = speedKmh / (hrIntensity * 50);
    const cardiacScore = clamp(efficiencyRaw * 80, 0, 100);

    // B. Cadence Score (25%): peak at 87.5 rpm, penalty for deviation
    const cadenceData = streams.cadence?.data;
    let avgCadence = 0;
    if (cadenceData) {
      const nonZero = cadenceData.filter((c: number) => c > 0);
      avgCadence = nonZero.length > 0
        ? nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length
        : 0;
    }
    const cadenceScore = avgCadence > 0
      ? clamp(100 - Math.abs(avgCadence - 87.5) * 3, 0, 100)
      : 50;

    // C. Speed Performance (20%): avg + max speed bonus
    const avgSpeedScore = clamp(speedKmh / 35 * 100, 0, 100);
    const maxSpeedBonus = clamp(maxSpeedKmh / 55, 0, 1) * 20;
    const speedScore = clamp(avgSpeedScore + maxSpeedBonus, 0, 100);

    // D. HR Zone Efficiency (15%): time in productive zones (Z2-Z3)
    const productiveTime = zoneTimes[1] + zoneTimes[2];
    const overloadTime = zoneTimes[4];
    const zoneEfficiency = totalTime > 0
      ? clamp(((productiveTime / totalTime) * 120 - (overloadTime / totalTime) * 40), 0, 100)
      : 50;

    // Elevation correction multiplier
    const distKm = activity.distance / 1000;
    const gradient = distKm > 0 ? activity.total_elevation_gain / distKm : 0;
    const elevationMultiplier = clamp(1 + gradient * 0.02, 1.0, 1.4);

    const rawQuality = (cardiacScore * 0.4 + cadenceScore * 0.25 + speedScore * 0.20 + zoneEfficiency * 0.15) * elevationMultiplier;
    const quality = clamp(Math.round(rawQuality), 0, 100);

    setRideQuality(quality);
    if (quality <= 20) {
      setRideQualityLabel('Poor');
      setRideQualityAdvice('Something went wrong. Sleep more, try yoga.');
    } else if (quality <= 35) {
      setRideQualityLabel('Below Avg');
      setRideQualityAdvice('Take it easy. Maybe need recovery?');
    } else if (quality <= 50) {
      setRideQualityLabel('Average');
      setRideQualityAdvice('Room for improvement. Check your pacing.');
    } else if (quality <= 65) {
      setRideQualityLabel('Good');
      setRideQualityAdvice('Solid effort. Building consistency.');
    } else if (quality <= 75) {
      setRideQualityLabel('Well done');
      setRideQualityAdvice('Strong ride. Keep pushing!');
    } else if (quality <= 85) {
      setRideQualityLabel('Excellent');
      setRideQualityAdvice('Great efficiency. You\'re in form!');
    } else {
      setRideQualityLabel('Awesome!');
      setRideQualityAdvice('Peak performance. Machine mode!');
    }
  }, [streams, userProfile, activity]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('rideAnalytics.title')}</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          style={styles.refreshButton}
          disabled={refreshing}>
          <Text style={styles.refreshButtonText}>
            {refreshing ? 'p' : 'refresh'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#fff"
            colors={['#274dd3']}
          />
        }>

        {/* Ride Quality + Title */}
        <View style={styles.rideScoreSection}>
          {rideQuality !== null && (() => {
            const qualityColor =
              rideQuality <= 20 ? '#6A4CCF'
              : rideQuality <= 35 ? '#EF6C00'
              : rideQuality <= 50 ? '#F9A825'
              : rideQuality <= 65 ? '#7CB342'
              : rideQuality <= 75 ? '#2BB673'
              : rideQuality <= 85 ? '#5B8DEF'
              : '#6A4CCF';
            return (
              <View style={styles.rideScoreBlock}>
                <View style={styles.rideScoreHeaderRow}>
                  <View style={[styles.rideScoreDot, {backgroundColor: qualityColor}]} />
                  <Text style={[styles.rideScoreHeaderText, {color: qualityColor}]}>{rideQualityLabel}</Text>
                </View>
                <Text style={styles.rideScoreNumber}>{t('rideAnalytics.rideQuality')}{rideQuality}<Text style={styles.rideScoreOf}>{t('rideAnalytics.of100')}</Text></Text>
                <Text style={styles.rideQualityHeaderAdvice}>{rideQualityAdvice}</Text>
              </View>
            );
          })()}
          <Text style={styles.rideTitle}>{activity.name}</Text>
          <Text style={styles.rideDate}>{rideDate}</Text>
        </View>

        {/* Mini Charts */}
        {streams && !streamsLoading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.miniChartsContainer}
            style={{marginBottom: 16}}>
            {streams.velocity_smooth?.data && renderMiniChart(
              t('common.speed'),
              streams.velocity_smooth.data.map((v: number) => v * 3.6),
              '#10b981',
              t('common.kmh'),
            )}
            {streams.heartrate?.data && renderMiniChart(
              t('common.heartRate'),
              streams.heartrate.data,
              '#FF5E00',
              t('common.bpm'),
            )}
            {streams.cadence?.data && renderMiniChart(
              t('common.cadence'),
              streams.cadence.data,
              '#8B5CF6',
              t('common.rpm'),
              true,
            )}
            {streams.watts?.data && renderMiniChart(
              t('common.power'),
              streams.watts.data,
              '#f59e0b',
              t('common.watts'),
            )}
            {streams.altitude?.data && (() => {
              const altData = streams.altitude.data;
              const chartData = prepareChartData(altData);
              const maxVal = Math.max(...altData) * 1.1;
              const elevGain = Math.round(activity.total_elevation_gain);
              return (
                <View key="elevation" style={styles.miniChartCard}>
                  <View style={styles.miniChartHeader}>
                    <Text style={styles.miniChartTitle}>{t('common.elevation')}</Text>
                    <Text style={styles.miniChartAvg}>
                      {elevGain} <Text style={styles.miniChartUnit}>{t('rideAnalytics.mGain')}</Text>
                    </Text>
                  </View>
                  <View style={styles.miniChartContent}>
                    <LineChart
                      data={chartData}
                      width={231}
                      height={100}
                      maxValue={maxVal}
                      spacing={Math.max(1, Math.floor(250 / chartData.length))}
                      curved
                      areaChart
                      startFillColor="#6b7280"
                      startOpacity={0.2}
                      endOpacity={0}
                      color="#6b7280"
                      thickness={2}
                      hideDataPoints={true}
                      hideRules
                      hideYAxisText
                      hideAxesAndRules
                      pointerConfig={{
                        pointerStripColor: '#6b7280',
                        pointerStripWidth: 2,
                        pointerColor: '#6b7280',
                        radius: 4,
                        pointerLabelWidth: 55,
                        pointerLabelHeight: 30,
                        pointerLabelComponent: (items: any) => (
                          <View style={styles.tooltipContainer}>
                            <Text style={styles.tooltipText}>
                              {items[0].value.toFixed(0)} {t('common.m')}
                            </Text>
                          </View>
                        ),
                      }}
                    />
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        )}

        {/* Effort Score moved off the dashboard entirely — it now only
            appears as a rich card in the AI Coach chat (RideScoreCard),
            rendered alongside the coach's actual analysis text instead of
            floating here with no explanation. */}

        {/* HR Zone Distribution - Bar Charts */}
        {hrZoneDistribution.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('rideAnalytics.hrZones')}</Text>
            <View style={styles.hrZoneBarList}>
              {hrZoneDistribution.map(z => (
                <View key={z.zone} style={styles.hrZoneBarRow}>
                  <Text style={styles.hrZoneBarLabel}>
                    {z.zone} {z.rangeMin}-{z.rangeMax}
                  </Text>
                  <View style={styles.hrZoneBarTrack}>
                    <View
                      style={[
                        styles.hrZoneBarFill,
                        {width: `${Math.max(z.percent, 2)}%`, backgroundColor: z.color},
                      ]}
                    />
                  </View>
                  <Text style={styles.hrZoneBarPercent}>{z.percent}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

       


        {/* Impact on Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('rideAnalytics.impactOnGoals')}</Text>
          {metaGoals.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scrollViewContainer}>
              {metaGoals.map((goal: any) => (
                <View key={goal.id} style={styles.goalCard}>
                  <View style={styles.goalHeader}>
                    <Text style={styles.goalTitle} numberOfLines={1}>
                      {goal.title}
                    </Text>
                  </View>
                  <View style={styles.goalStatsRow}>
                    <Text style={styles.goalProgressLarge}>
                      {goal.progress}%
                    </Text>
                    {goal.progressGain > 0 && (
                      <View style={styles.goalBadge}>
                        <Text style={styles.goalBadgeText}>
                          +{goal.progressGain}%
                        </Text>
                      </View>
                    )}
                  </View>
                  {goal.contributions && goal.contributions.length > 0 && (
                    <View style={styles.contributionsContainer}>
                      {goal.contributions.map((contrib: any, idx: number) => (
                        <View key={idx} style={styles.contributionItem}>
                          <Text style={styles.contributionLabel}>
                            {contrib.label}:
                          </Text>
                          <Text style={styles.contributionValue}>
                            {contrib.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>{t('rideAnalytics.noActiveGoals')}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Discuss with Coach — floats over the scrolled content instead of
          sitting in its own opaque bar, but a top-transparent/bottom-dark
          gradient scrim behind it keeps whatever's scrolled underneath
          legible instead of the button looking like it's just stuck on top
          of random content. `pointerEvents="none"` so the scrim itself never
          intercepts touches meant for the content — only the button (a
          separate view on top of it) is actually tappable. Style/shadow on
          the button matches Garage's "Analyze ride" button exactly (see
          analyzeButton in GarageScreen.tsx) for consistency. Strava activity
          id goes as a separate `activityId` param, not baked into the
          visible prompt text — CoachChatScreen threads it through as hidden
          model context so it never shows up as a leaked-looking id in the
          chat bubble the user sees. */}
      <LinearGradient
        colors={['rgba(17, 18, 22, 0)', 'rgba(17, 18, 22, 0.9)', '#111216']}
        locations={[0, 0.55, 1]}
        style={styles.discussGradient}
        pointerEvents="none"
      />
      <View style={[styles.discussButtonWrap, {bottom: insets.bottom + 16}]}>
        <TouchableOpacity
          style={styles.discussButton}
          disabled={checkingExistingChat}
          onPress={async () => {
            // Tapping this repeatedly for the SAME ride used to spawn a
            // fresh "Analyse my ride ..." conversation every single time,
            // burying the coach's conversation list in duplicates. Check
            // first whether this activity was already tagged onto an
            // existing conversation (server sets that the first time
            // get_activity_analysis resolves it — see /api/coach/chat) and
            // reopen that thread instead of starting a new one.
            setCheckingExistingChat(true);
            try {
              const existing = await apiFetch(`/api/coach/conversations/by-activity/${activity.id}`);
              if (existing?.id) {
                navigation.navigate('Main', {
                  screen: 'GoalsTab',
                  params: {screen: 'CoachChat', params: {openConversationId: existing.id}},
                });
                return;
              }
            } catch (err) {
              // Fall through to starting a fresh analysis conversation —
              // worst case is a duplicate thread, not a broken button.
            } finally {
              setCheckingExistingChat(false);
            }
            const distKm = (activity.distance / 1000).toFixed(1);
            const elevM = Math.round(activity.total_elevation_gain);
            const prompt = `Analyse my ride "${activity.name}" from ${rideDate}: ${distKm}km, ${elevM}m elevation, ${Math.floor(activity.moving_time / 60)} min`;
            navigation.navigate('Main', {
              screen: 'GoalsTab',
              params: {screen: 'CoachChat', params: {initialPrompt: prompt, activityId: activity.id}},
            });
          }}>
            <View style={styles.sparkleIconContainer}>
              <SparkleIcon size={26} color="#fff" />
            </View>
          <Text style={styles.discussButtonText}>{t('rideAnalytics.discussWithCoach')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111216',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 55,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
    marginRight: 0,
  },
  backButtonText: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
  },
  refreshButton: {
    padding: 8,
  },
  refreshButtonText: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 0,
    // Clears the floating "Discuss with Coach" button (~90px incl. its
    // shadow + safe-area offset) so the last section never sits behind it.
    paddingBottom: 110,
  },
  rideScoreSection: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 16,
  },
  rideScoreBlock: {
    marginBottom: 32,
  },
  rideScoreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  rideScoreDot: {
    width: 12,
    height: 12,
    borderRadius: 20,
  },
  rideScoreHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rideScoreNumber: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  rideScoreOf: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.2)',
  },
  rideQualityHeaderAdvice: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 6,
  },
  rideTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
  },
  rideDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  discussGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
  },
  discussButtonWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  // Matches GarageScreen's analyzeButton exactly (same button, conceptually,
  // just relocated) — flat corners, brand-blue fill, blue-tinted shadow.
  discussButton: {
    flexDirection: 'row',
    backgroundColor: '#274dd3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 100,
    shadowColor: '#274dd3',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  sparkleIconContainer: {
    marginTop: -4,
  },
  discussButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  placeholderBox: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  placeholderText: {
    color: '#666',
    fontSize: 14,
  },
  hrZoneBarList: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    gap: 10,
  },
  hrZoneBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hrZoneBarLabel: {
    width: 70,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  hrZoneBarTrack: {
    flex: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderRadius: 0,
    overflow: 'hidden',
  },
  hrZoneBarFill: {
    height: '100%',
    borderRadius: 0,
  },
  hrZoneBarPercent: {
    width: 36,
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  scrollViewContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 16,
  },
  goalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 16,
    marginBottom: 12,
    marginTop: 16,
    borderRadius: 12,
    width: 212,
    height: 180,
    marginRight: 8,
    justifyContent: 'space-between',
  },
  goalHeader: {
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  goalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  goalProgressLarge: {
    fontSize: 30,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  goalBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  goalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  contributionsContainer: {
    gap: 8,
  },
  contributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contributionLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  contributionValue: {
    fontSize: 12,
    color: 'rgb(21, 143, 102)',
    fontWeight: '700',
  },
  miniChartsContainer: {
    flexDirection: 'row',
    gap: 0,
    paddingLeft: 16,
    paddingHorizontal: 0,
    marginBottom: 16,
    marginTop: 4,
  },
  miniChartCard: {
    width: 212,
    height: 180,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 0,
    marginRight: 8,
    borderRadius: 12,
  },
  miniChartContent: {
    position: 'relative',
    left: -30,
    top: 10,
  },
  miniChartHeader: {
    marginBottom: 8,
    padding: 16,
    paddingBottom: 0,
  },
  miniChartTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  miniChartAvg: {
    fontSize: 20,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  miniChartUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  tooltipContainer: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
    top: 25,
    alignItems: 'center',
    zIndex: 9999,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});
