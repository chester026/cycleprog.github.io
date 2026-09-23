import React, {useState, useEffect} from 'react';
import {View, Text, ScrollView, ImageBackground, ActivityIndicator, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import LinearGradient from 'react-native-linear-gradient';
import {getFTPLevel} from '@bikelab/shared/calc';
import {api, analytics} from '../data/api';
import type {Activity} from '../types/activity';
import {logger} from '../lib/logger';
import {makeStyles, useTheme, withOpacity} from '../theme';

interface FTPAnalysisProps {
  activities: Activity[];
  userProfile: any;
  vo2max: number | null;
  onHelpPress?: (topicId: string) => void;
}

const FTP_ANALYSIS_PERIOD_DAYS = 28;

export const FTPAnalysis: React.FC<FTPAnalysisProps> = ({
  activities,
  userProfile,
  vo2max,
  onHelpPress,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [ftpData, setFtpData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // FTP / high-intensity-interval analysis now runs server-side (T-3.6,
  // docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/02-
  // bikelabapp.md A-04) — this used to download every ride's full stream
  // data on-device (see the now-deleted utils/ftpAnalysis.ts +
  // utils/streamsCache.ts's preloadStreamsForPeriod) and analyze it here.
  // `GET /api/analytics/ftp` computes and caches the same result per
  // activity (services/ftpAnalysis.js, `activity_analysis` table) — the
  // first Analysis-tab open after new rides sync warms that cache; every
  // later call for the same window is effectively free.
  useEffect(() => {
    const loadFtpAnalysis = async () => {
      if (!activities || activities.length === 0) {
        setFtpData({minutes: 0, intervals: 0, hrThreshold: 160});
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const result = await api.call(analytics.ftp, {query: {days: FTP_ANALYSIS_PERIOD_DAYS}});
        setFtpData({
          minutes: result.totalMinutes,
          intervals: result.totalIntervals,
          hrThreshold: result.hrThreshold,
          durationThreshold: 120,
        });
      } catch (error) {
        logger.error('Error loading FTP analysis:', error);
        setFtpData({
          minutes: 0,
          intervals: 0,
          hrThreshold: userProfile?.lactate_threshold || 160,
          durationThreshold: 120,
        });
      } finally {
        setLoading(false);
      }
    };

    loadFtpAnalysis();
  }, [activities, userProfile]);
  // VO2max зоны с границами и градиентами — each zone's gradient is a
  // consecutive pair from the shared vo2max scale (theme.colors.vo2max.
  // gradient), so adjacent bands blend into each other.
  const vo2maxStops = theme.colors.vo2max.gradient;
  const vo2maxZones = [
    {labelKey: 'levelBeginner', min: 10, max: 30, gradient: [vo2maxStops[0], vo2maxStops[1]]},
    {labelKey: 'levelAmateur', min: 30, max: 50, gradient: [vo2maxStops[1], vo2maxStops[2]]},
    {labelKey: 'levelAdvanced', min: 50, max: 75, gradient: [vo2maxStops[2], vo2maxStops[3]]},
    {labelKey: 'levelElite', min: 75, max: 85, gradient: [vo2maxStops[3], vo2maxStops[4]]},
    {labelKey: 'levelWorldClass', min: 85, max: 100, gradient: [vo2maxStops[4], vo2maxStops[5]]},
  ];

  const getVO2maxPosition = (vo2maxValue: number | null) => {
    if (!vo2maxValue) return 0;
    const minValue = 10;
    const maxValue = 100;
    const clampedValue = Math.max(minValue, Math.min(vo2maxValue, maxValue));
    return ((clampedValue - minValue) / (maxValue - minValue)) * 100;
  };

  const ftpLevel = ftpData
    ? getFTPLevel(ftpData.minutes)
    : {level: 'Low', color: theme.colors.danger, description: 'Loading...'};
  // T-5.3 (A-24/A-28): dropped the dead `currentZone`/`getVO2maxZone` pair
  // — computed but never read (the zone bands render straight from
  // `vo2maxZones` below; only `vo2maxPosition` is used to place the
  // indicator on the scale).
  const vo2maxPosition = getVO2maxPosition(vo2max);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.chart.series3} />
        <Text style={styles.loadingText}>{t('ftpAnalysis.analyzing')}</Text>
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
          <View style={styles.titleRow}>
            <Text style={styles.sectionTitle}>{t('ftpAnalysis.title')}</Text>
            {onHelpPress ? <TouchableOpacity
                style={styles.helpButton}
                onPress={() => onHelpPress('ftp_workload')}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Text style={styles.helpIcon}>?</Text>
              </TouchableOpacity> : null}
          </View>
          <Text style={styles.criterionText}>
            {t('ftpAnalysis.hrThreshold')}{ftpData.hrThreshold}{t('ftpAnalysis.forAtLeast')}{ftpData.durationThreshold}{t('ftpAnalysis.sConsecutively')}
          </Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ftpData.minutes}</Text>
              <Text style={styles.statLabel}>{t('ftpAnalysis.minutesThreshold')}</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ftpData.intervals}</Text>
              <Text style={styles.statLabel}>{t('ftpAnalysis.highIntensity')}</Text>
            </View>

           
        </View>
        <View style={[styles.statItem, styles.ftpLevelBadge, {backgroundColor: ftpLevel.color}]}>
              <Text style={styles.ftpLevelLabel}>{t('ftpAnalysis.ftpWorkload')}</Text>
              <Text style={styles.ftpLevelValue}>{ftpLevel.level}</Text>
            </View>
          </View>
      </ImageBackground>
    <View style={styles.container}>
     

      {/* VO2MAX Section */}
      <Text style={styles.vo2maxTitle}>{t('ftpAnalysis.vo2max')}</Text>
      <Text style={styles.periodLabel}>{t('ftpAnalysis.last4Weeks')}</Text>

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
          {!!vo2max && (
            <View
              style={[
                styles.vo2maxIndicator,
                {left: `${vo2maxPosition}%`},
              ]}>
              <View style={styles.vo2maxIndicatorLine} />
              <View style={styles.vo2maxIndicatorBadge}>
                <Text style={styles.vo2maxIndicatorValue}>{vo2max}</Text>
                <Text style={styles.vo2maxIndicatorUnit}>{t('ftpAnalysis.mlKgMin')}</Text>
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
                <Text style={styles.vo2maxLabel}>{t(`ftpAnalysis.${zone.labelKey}`)}</Text>
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
          <Text style={styles.factLabel}>{t('ftpAnalysis.aboutVo2')}</Text>
          <Text style={styles.factValue}>
            {t('ftpAnalysis.vo2Desc')}
          </Text>
        </View>
        <View style={styles.factCard}>
          <Text style={styles.factLabel}>{t('ftpAnalysis.highestVo2')}</Text>
          <Text style={styles.factValue}>
            {t('ftpAnalysis.vo2Cyclist')}
          </Text>
          <Text style={styles.factValue}>
            {t('ftpAnalysis.vo2Runner')}
          </Text>
          <Text style={styles.factValue}>
            {t('ftpAnalysis.vo2Dog')}
          </Text>
        </View>
        <View style={styles.factCard}>
          <Text style={styles.factLabel}>{t('ftpAnalysis.fitnessIndicator')}</Text>
          <Text style={styles.factValue}>
            {t('ftpAnalysis.fitnessDesc')}
          </Text>
        </View>

        <View style={styles.factCard}>
          <Text style={styles.factLabel}>{t('ftpAnalysis.heartAssociation')}</Text>
          <Text style={styles.factValue}>
            {t('ftpAnalysis.heartQuote')}
          </Text>
        </View>
      </ScrollView>
    </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.15),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 0,
    marginTop: 6,
  },
  helpIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: withOpacity(theme.colors.text.inverse, 0.5),
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginTop: 20,
    marginHorizontal: 16,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.text.muted,
    marginTop: 16,
  },
  container: {
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.scrim,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.inverse,
    marginBottom: 8,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  criterionText: {
    fontSize: 12,
    color: withOpacity(theme.colors.text.inverse, 0.75),
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 40,
    fontWeight: '900',
    color: theme.colors.text.inverse,
  },
  statLabel: {
    fontSize: 11,
    color: withOpacity(theme.colors.text.inverse, 0.75),
    marginTop: 4,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.chart.axisLine,
  },
  ftpLevelBadge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    marginTop: 12,
  },
  ftpLevelLabel: {
    fontSize: 14,
    color: theme.colors.text.inverse,
    opacity: 0.9,
  },
  ftpLevelValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.inverse,
    marginTop: 0,
  },
  vo2maxTitle: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: theme.colors.analysis.bigTitle,
    marginBottom: 4,
  },
  periodLabel: {
    fontSize: 12,
    color: theme.colors.text.muted,
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
    color: theme.colors.text.muted,
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
    color: theme.colors.vo2max.labelText,
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
    backgroundColor: theme.colors.vo2max.indicatorLine,
    borderRadius: 2,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  vo2maxIndicatorBadge: {
    backgroundColor: theme.colors.vo2max.indicatorBadgeBg,
    paddingHorizontal: 6,
    paddingVertical: 8,
    height: 55,
    alignItems: 'center',
    marginTop: -60,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    transform: [{translateX: -28.5}],
  },
  vo2maxIndicatorValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  vo2maxIndicatorUnit: {
    fontSize: 9,
    color: theme.colors.text.secondary,
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
    backgroundColor: theme.colors.surfaceDark,
    borderRadius: 12,
    padding: 16,
    minHeight: 90,
  },
  factLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.inverse,
    marginBottom: 8,
  },
  factValue: {
    fontSize: 11,
    color: theme.colors.text.muted,
    lineHeight: 17,
    marginBottom: 4,
  },
}));

