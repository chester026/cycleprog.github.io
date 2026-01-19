import React, {useMemo, useState, useEffect} from 'react';
import {View, Text, StyleSheet, Dimensions, ScrollView, ImageBackground, ActivityIndicator, TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {analyzeHighIntensityTime, getFTPLevel} from '../utils/ftpAnalysis';
import {Cache, CACHE_TTL} from '../utils/cache';
import {preloadStreamsForPeriod, getStreamsCacheStats} from '../utils/streamsCache';
import type {Activity} from '../types/activity';

const screenWidth = Dimensions.get('window').width;

interface FTPAnalysisProps {
  activities: Activity[];
  userProfile: any;
  vo2max: number | null;
}

export const FTPAnalysis: React.FC<FTPAnalysisProps> = ({
  activities,
  userProfile,
  vo2max,
}) => {
  const [ftpData, setFtpData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [preloading, setPreloading] = useState(false);
  const [recalcTrigger, setRecalcTrigger] = useState(0); // Триггер для принудительного пересчета

  // Принудительная загрузка streams
  const handleForcePreload = async () => {
    console.log('🔄 Force preload streams triggered by user');
    setPreloading(true);
    
    try {
      // Получаем статистику перед загрузкой
      const statsBefore = await getStreamsCacheStats();
      console.log('📊 Streams stats BEFORE preload:', statsBefore);
      
      await preloadStreamsForPeriod(activities, 28);
      
      // Получаем статистику после загрузки
      const statsAfter = await getStreamsCacheStats();
      console.log('📊 Streams stats AFTER preload:', statsAfter);
      
      // Сбрасываем FTP кеш для пересчета
      await Cache.remove('ftp_analysis_result');
      console.log('🔄 FTP cache cleared, triggering recalculation...');
      
      // Триггерим пересчет через изменение состояния
      setRecalcTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error in force preload:', error);
    } finally {
      setPreloading(false);
    }
  };

  // Рассчитываем FTP данные при изменении activities
  useEffect(() => {
    const calculateFTP = async () => {
      console.log('🔥 FTP Component: calculateFTP called');
      console.log('   Activities count:', activities?.length || 0);
      console.log('   User profile:', userProfile);
      
      if (!activities || activities.length === 0) {
        console.log('   ⏭️ No activities, setting default FTP data');
        setFtpData({minutes: 0, intervals: 0, hrThreshold: 160});
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const hrThreshold = userProfile?.lactate_threshold || 160;
        const durationThreshold = 120; // 2 минуты

        // Ключ для кеша FTP результатов
        const cacheKey = 'ftp_analysis_result';
        const lastActivityDate = activities[0]?.start_date; // Самая свежая активность

        console.log('   📅 Last activity date:', lastActivityDate);

        // Проверяем кеш
        const cached = await Cache.get<any>(cacheKey);
        console.log('   💾 FTP cache check:');
        console.log('      - Cache exists:', !!cached);
        console.log('      - Cached date:', cached?.lastActivityDate);
        console.log('      - Current date:', lastActivityDate);
        console.log('      - Dates match:', cached?.lastActivityDate === lastActivityDate);
        
        if (cached && cached.lastActivityDate === lastActivityDate) {
          console.log('   ✅ Using cached FTP data (no new activity)');
          console.log('      - Minutes:', cached.data.minutes);
          console.log('      - Intervals:', cached.data.intervals);
          console.log('      - With streams:', cached.data.activitiesWithStreams);
          console.log('      - Estimated:', cached.data.activitiesEstimated);
          setFtpData(cached.data);
          setLoading(false);
          return;
        }

        console.log('   🔄 Recalculating FTP (new activity detected or no cache)');
        console.log('      - HR threshold:', hrThreshold);
        console.log('      - Duration threshold:', durationThreshold);

        const result = await analyzeHighIntensityTime(
          activities,
          28, // 4 недели
          {
            hr_threshold: hrThreshold,
            duration_threshold: durationThreshold,
          },
          true, // skipAPILoad = true - только из кеша
        );

        console.log('   📊 FTP Analysis result:');
        console.log('      - Total minutes:', result.totalTimeMin);
        console.log('      - Total intervals:', result.totalIntervals);
        console.log('      - Activities analyzed:', result.activitiesAnalyzed);
        console.log('      - With streams:', result.activitiesWithStreams);
        console.log('      - Estimated:', result.activitiesEstimated);

        const ftpResult = {
          minutes: result.totalTimeMin,
          intervals: result.totalIntervals,
          hrThreshold,
          durationThreshold,
          activitiesWithStreams: result.activitiesWithStreams,
          activitiesEstimated: result.activitiesEstimated,
        };

        // Сохраняем в кеш с датой последней активности
        await Cache.set(
          cacheKey,
          {data: ftpResult, lastActivityDate},
          CACHE_TTL.HALF_HOUR,
        );
        console.log('   💾 FTP data cached with date:', lastActivityDate);

        setFtpData(ftpResult);
        
        // Фоновая загрузка streams для улучшения точности в будущем
        console.log('   📦 Starting background streams preload...');
        preloadStreamsForPeriod(activities, 28).catch(err =>
          console.error('   ❌ Error preloading streams:', err),
        );
      } catch (error) {
        console.error('   ❌ Error calculating FTP:', error);
        setFtpData({
          minutes: 0,
          intervals: 0,
          hrThreshold: userProfile?.lactate_threshold || 160,
          durationThreshold: 120,
        });
      } finally {
        setLoading(false);
        console.log('   ✅ FTP calculation completed');
      }
    };

    calculateFTP();
  }, [activities, userProfile, recalcTrigger]); // Добавляем recalcTrigger в зависимости
  // VO2max зоны с границами и градиентами
  const vo2maxZones = [
    {label: 'BEGINNER', min: 10, max: 30, gradient: ['#e77c31', '#f1c244']},
    {label: 'AMATEUR', min: 30, max: 50, gradient: ['#f1c244', '#b3e450']},
    {label: 'ADVANCED', min: 50, max: 75, gradient: ['#b3e450', '#7adb87']},
    {label: 'ELITE', min: 75, max: 85, gradient: ['#7adb87', '#55b3d1']},
    {label: 'WORLD CLASS', min: 85, max: 100, gradient: ['#55b3d1', '#4f80f0']},
  ];

  const getVO2maxZone = (vo2maxValue: number | null) => {
    if (!vo2maxValue) return null;
    if (vo2maxValue < vo2maxZones[0].min) return vo2maxZones[0];
    return (
      vo2maxZones.find(zone => vo2maxValue >= zone.min && vo2maxValue < zone.max) ||
      vo2maxZones[vo2maxZones.length - 1]
    );
  };

  const getVO2maxPosition = (vo2maxValue: number | null) => {
    if (!vo2maxValue) return 0;
    const minValue = 10;
    const maxValue = 100;
    const clampedValue = Math.max(minValue, Math.min(vo2maxValue, maxValue));
    return ((clampedValue - minValue) / (maxValue - minValue)) * 100;
  };

  const ftpLevel = ftpData ? getFTPLevel(ftpData.minutes) : {level: 'Low', color: '#ef4444', description: 'Loading...'};
  const currentZone = getVO2maxZone(vo2max);
  const vo2maxPosition = getVO2maxPosition(vo2max);

  // Показываем индикатор загрузки
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5E00" />
        <Text style={styles.loadingText}>Analyzing FTP workload...</Text>
      </View>
    );
  }

  if (!vo2max) {
    return null;
  }

  return (
    <View>
       {/* FTP Workload Block */}
       <ImageBackground
        source={require('../assets/img/mostrecomended.webp')}
        style={styles.ftpWorkoutsBlock}>
        <View style={styles.ftpOverlay}>
          <Text style={styles.sectionTitle}>FTP WORKLOAD FOR 4 WEEKS</Text>
          <Text style={styles.criterionText}>
            Heart rate ≥ {ftpData.hrThreshold} bpm for at least {ftpData.durationThreshold}s consecutively
          </Text>
          
          {/* Индикатор точности данных */}
          {ftpData.activitiesWithStreams > 0 && ftpData.activitiesEstimated > 0 && (
            <Text style={styles.accuracyIndicator}>
              📊 {ftpData.activitiesWithStreams} precise / {ftpData.activitiesEstimated} estimated
            </Text>
          )}
          {ftpData.activitiesEstimated > 0 && ftpData.activitiesWithStreams === 0 && (
            <>
              <Text style={styles.accuracyIndicator}>
                ⚠️ Using estimated data (no stream data available)
              </Text>
              <TouchableOpacity 
                style={styles.preloadButton} 
                onPress={handleForcePreload}
                disabled={preloading}
              >
                <Text style={styles.preloadButtonText}>
                  {preloading ? '⏳ Loading streams...' : '📥 Load precise data'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ftpData.minutes}</Text>
              <Text style={styles.statLabel}>Minutes at threshold</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ftpData.intervals}</Text>
              <Text style={styles.statLabel}>High-intensity intervals</Text>
            </View>

            <View style={[styles.statItem, styles.ftpLevelBadge, {backgroundColor: ftpLevel.color}]}>
              <Text style={styles.ftpLevelLabel}>FTP Workload:</Text>
              <Text style={styles.ftpLevelValue}>{ftpLevel.level}</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    <View style={styles.container}>
     

      {/* VO2MAX Section */}
      <Text style={styles.vo2maxTitle}>VO₂MAX</Text>
      <Text style={styles.periodLabel}>Last 4 weeks</Text>

      {/* VO2max Scale */}
      <View style={styles.vo2maxScaleContainer}>
        {/* Цветная шкала */}
        <View style={styles.vo2maxScale}>
          {vo2maxZones.map((zone, index) => {
            const totalRange = 90; // 10-100
            const widthPercent = ((zone.max - zone.min) / totalRange) * 100;

            return (
              <LinearGradient
                key={index}
                colors={zone.gradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
                style={[
                  styles.vo2maxZone,
                  {
                    width: `${widthPercent}%`,
                  },
                ]}
              />
            );
          })}

          {/* Indicator */}
          {vo2max && (
            <View
              style={[
                styles.vo2maxIndicator,
                {left: `${vo2maxPosition}%`},
              ]}>
              <View style={styles.vo2maxIndicatorLine} />
              <View style={styles.vo2maxIndicatorBadge}>
                <Text style={styles.vo2maxIndicatorValue}>{vo2max}</Text>
                <Text style={styles.vo2maxIndicatorUnit}>ml/kg/min</Text>
              </View>
            </View>
          )}
        </View>

        {/* Числа под шкалой */}
        <View style={styles.vo2maxNumbers}>
          {vo2maxZones.map((zone, index) => {
            const totalRange = 90;
            const widthPercent = ((zone.max - zone.min) / totalRange) * 100;
            
            return (
              <View
                key={`num-${index}`}
                style={[styles.vo2maxNumberZone, {width: `${widthPercent}%`}]}>
                <Text style={styles.vo2maxNumber}>{zone.min}</Text>
                {index === vo2maxZones.length - 1 && (
                  <Text style={styles.vo2maxNumber}>{zone.max}+</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Лейблы под числами */}
        <View style={styles.vo2maxLabels}>
          {vo2maxZones.map((zone, index) => {
            const totalRange = 90;
            const widthPercent = ((zone.max - zone.min) / totalRange) * 100;

            return (
              <View
                key={`label-${index}`}
                style={[styles.vo2maxLabelZone, {width: `${widthPercent}%`}]}>
                <Text style={styles.vo2maxLabel}>{zone.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Facts Section */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.factsScrollContent}
        style={styles.factsScroll}>
          <View style={styles.factCard}>
          <Text style={styles.factLabel}>About VO₂max:</Text>
          <Text style={styles.factValue}>
            Your body uses oxygen to burn fuel to produce energy. The more oxygen your body can
            use, the more energy you can produce.
          </Text>
        </View>
        <View style={styles.factCard}>
          <Text style={styles.factLabel}>Highest VO₂max:</Text>
          <Text style={styles.factValue}>
            97.5 - Oskar Svendsen (Cyclist)
          </Text>
          <Text style={styles.factValue}>
            78.6 - Joan Benoit (Runner)
          </Text>
          <Text style={styles.factValue}>
            240 - Sled-dog Huskies
          </Text>
        </View>
        <View style={styles.factCard}>
          <Text style={styles.factLabel}>Physical fitness indicator:</Text>
          <Text style={styles.factValue}>
            Your VO₂max is the single best indicator of physical fitness and cardiovascular health.
          </Text>
        </View>

        <View style={styles.factCard}>
          <Text style={styles.factLabel}>The Heart Association:</Text>
          <Text style={styles.factValue}>
            "The most important overall correlate of health...and the strongest predictor of all
            cause mortality"
          </Text>
        </View>
      </ScrollView>
    </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 20,
    marginHorizontal: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
    marginTop: 16,
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 20,
    marginHorizontal: 16,
  },
  ftpWorkoutsBlock: {
    marginBottom: 24,
    marginTop: 24,
    overflow: 'hidden',
  },
 
  ftpOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  criterionText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  accuracyIndicator: {
    fontSize: 10,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  preloadButton: {
    backgroundColor: '#FF5E00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  preloadButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  ftpLevelBadge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'column',
  },
  ftpLevelLabel: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.9,
  },
  ftpLevelValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 4,
  },
  vo2maxTitle: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: '#d6d6d6',
    marginBottom: 4,
  },
  periodLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  vo2maxScaleContainer: {
    marginBottom: 24,
    marginTop: 24,
  },
  vo2maxScale: {
    flexDirection: 'row',
    height: 55,
    position: 'relative',
  },
  vo2maxZone: {
    // Только цвет, без контента
  },
  vo2maxNumbers: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  vo2maxNumberZone: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  vo2maxNumber: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
  },
  vo2maxLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  vo2maxLabelZone: {
    alignItems: 'center',
   flexDirection: 'row',
  },
  vo2maxLabel: {
    fontSize: 9,
    color: '#aaa',
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vo2maxIndicator: {
    position: 'absolute',
    top: -8,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    transform: [{translateX: -25}], // Center the indicator
  },
  vo2maxIndicatorLine: {
    width: 3,
    height: 68,
    backgroundColor: '#565863',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  vo2maxIndicatorBadge: {
    backgroundColor: '#24272a',
    paddingHorizontal: 6,
    paddingVertical: 8,
    height: 55,
    alignItems: 'center',
    marginTop: -60,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    transform: [{translateX: -28.5}],
  },
  vo2maxIndicatorValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  vo2maxIndicatorUnit: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  factsScroll: {
    marginTop: 16,
  },
  factsScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  factCard: {
    width: 240,
    backgroundColor: '#222',
   
    padding: 12,
    minHeight: 90,
  },
  factLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  factValue: {
    fontSize: 11,
    color: '#888',
    lineHeight: 17,
    marginBottom: 4,
  },
});

