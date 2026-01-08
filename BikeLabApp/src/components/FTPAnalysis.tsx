import React, {useMemo} from 'react';
import {View, Text, StyleSheet, Dimensions, ScrollView, ImageBackground} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const screenWidth = Dimensions.get('window').width;

interface FTPAnalysisProps {
  activities: any[];
  userProfile: any;
  vo2max: number | null;
}

export const FTPAnalysis: React.FC<FTPAnalysisProps> = ({
  activities,
  userProfile,
  vo2max,
}) => {
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

  // Вычисляем FTP данные (High-intensity intervals) - аналог web версии
  const ftpData = useMemo(() => {
    if (!activities || activities.length === 0) {
      return {minutes: 0, intervals: 0};
    }

    const hrThreshold = userProfile?.lactate_threshold || 160;
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const recentActivities = activities.filter(
      a => new Date(a.start_date) > fourWeeksAgo,
    );

    // Простая оценка: подсчитываем время при HR > threshold
    // В полной версии нужно анализировать stream data, но это требует API запросов
    let totalMinutes = 0;
    let intervals = 0;

    recentActivities.forEach(activity => {
      if (activity.average_heartrate && activity.average_heartrate >= hrThreshold) {
        // Если средний HR >= threshold, считаем ~50% времени как high-intensity
        const estimatedIntensityTime = (activity.moving_time || 0) * 0.5;
        totalMinutes += estimatedIntensityTime / 60;
        intervals += 1;
      }
    });

    return {
      minutes: Math.round(totalMinutes),
      intervals,
      hrThreshold,
    };
  }, [activities, userProfile]);

  const getFTPLevel = (minutes: number) => {
    if (minutes < 30)
      return {level: 'Low', color: '#ef4444', description: 'Increase intensity'};
    if (minutes < 60)
      return {level: 'Normal', color: '#f59e0b', description: 'Good baseline'};
    if (minutes < 120)
      return {level: 'Good', color: '#10b981', description: 'Strong fitness'};
    if (minutes < 180)
      return {level: 'Excellent', color: '#06b6d4', description: 'Very high fitness'};
    return {level: 'Outstanding', color: '#8b5cf6', description: 'Elite level'};
  };

  const ftpLevel = getFTPLevel(ftpData.minutes);
  const currentZone = getVO2maxZone(vo2max);
  const vo2maxPosition = getVO2maxPosition(vo2max);

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
            Heart rate ≥ {ftpData.hrThreshold} bpm for at least 120s consecutively
          </Text>

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
    marginBottom: 16,
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

