import React, {useMemo} from 'react';
import {getDateLocale} from '../i18n/dateLocale';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {LineChart} from 'react-native-gifted-charts';
import {TrendBadge} from './TrendBadge';
import {useChartOverlay} from '../hooks/useChartOverlay';

const screenWidth = Dimensions.get('window').width;

// T-3.5 (docs/audit/00-AUDIT-AND-PLAN.md T-3.5, docs/audit/layers/04-cross-
// layer.md §4.5, docs/audit/layers/02-bikelabapp.md A-14): this component no
// longer computes power itself. The physics estimate (rider/bike weight,
// Crr, wind) now lives once, server-side, in
// `@bikelab/shared/calc/power.ts` + `server/services/power.js`, and is
// attached to every activity as `activity.estimated_power` (`GET
// /api/activities` — see `services/strava/activities.js`'s
// `getActivities()`). This removed:
//  - the up-to-50-activity loop with a 100ms sleep + `/api/weather/wind`
//    call per ride (A-14) — the server now fetches wind itself, once,
//    budgeted per request, and caches the result in the DB;
//  - the `powerAnalysis_windCache`/`powerAnalysis_powerCache` AsyncStorage
//    caches (also dropped from `src/auth/session.ts`'s
//    `USER_SCOPED_KEYS`, since there's nothing left to clear on logout);
//  - the component's own `GET /api/user-profile` call (rider/bike weight
//    now only matter server-side, for the estimate `activities[]` already
//    carries).
// `summary` is `GET /api/analytics/summary`'s `power` field — when present
// its aggregate numbers are used for the stat cards (identical to what
// every other screen reading the same summary sees); the per-activity
// values for the chart/top-5 always come straight from `activities`.
interface PowerAnalysisProps {
  activities: any[];
  summary?: PowerSummary | null;
  onStatsCalculated?: (stats: PowerStats) => void;
  onHelpPress?: (topicId: string) => void;
  trend?: number | null;
}

interface PowerSummary {
  avg: number | null;
  best: number | null;
  worst: number | null;
  totalActivities: number;
  activitiesWithRealPower: number;
  activitiesWithWindData: number;
}

interface PowerStats {
  avgPower: number;
  maxPower: number;
  minPower: number;
  totalActivities: number;
  activitiesWithWindData?: number;
  activitiesWithRealPower?: number;
}

interface PowerDataItem {
  id: string;
  name: string;
  date: string;
  total: number;
  hasRealPower: boolean;
  hasWind: boolean;
  speed?: string;
}

export const PowerAnalysis: React.FC<PowerAnalysisProps> = ({activities, summary, onStatsCalculated, onHelpPress, trend}) => {
  const {t} = useTranslation();

  // Last 50 activities that have an estimate yet (the server fills this in
  // lazily/bounded — see services/power.js — so a handful of the very
  // newest rides may not have one on the first load after a sync).
  const powerData: PowerDataItem[] = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    return activities
      .slice(0, 50)
      .filter(a => a && a.estimated_power && a.estimated_power.avgWatts != null)
      .map(a => {
        const speedMs = a.distance && a.moving_time ? a.distance / a.moving_time : null;
        return {
          id: String(a.id),
          name: a.name,
          date: a.start_date,
          total: Math.round(a.estimated_power.avgWatts),
          hasRealPower: a.estimated_power.method === 'measured',
          hasWind: !!a.estimated_power.hasWind,
          speed: speedMs != null ? (speedMs * 3.6).toFixed(1) : undefined,
        };
      });
  }, [activities]);

  const stats: PowerStats | null = useMemo(() => {
    // The cards describe "Last 50 activities" — compute from the activities
    // this screen already holds (their persisted server-side estimates).
    // `summary.power` is period-scoped (e.g. 4 weeks) and only a fallback
    // when no activities are available.
    if (summary && powerData.length === 0) {
      if (summary.avg == null) return null;
      return {
        avgPower: summary.avg,
        maxPower: summary.best ?? summary.avg,
        minPower: summary.worst ?? summary.avg,
        totalActivities: summary.totalActivities,
        activitiesWithWindData: summary.activitiesWithWindData,
        activitiesWithRealPower: summary.activitiesWithRealPower,
      };
    }
    if (powerData.length === 0) return null;
    const powers = powerData.map(d => d.total);
    return {
      avgPower: Math.round(powers.reduce((a, b) => a + b, 0) / powers.length),
      maxPower: Math.max(...powers),
      minPower: Math.min(...powers),
      totalActivities: powerData.length,
      activitiesWithWindData: powerData.filter(d => d.hasWind).length,
      activitiesWithRealPower: powerData.filter(d => d.hasRealPower).length,
    };
  }, [summary, powerData]);

  React.useEffect(() => {
    if (onStatsCalculated && stats) {
      onStatsCalculated(stats);
    }
  }, [stats, onStatsCalculated]);

  const topActivitiesByPower = useMemo(() => {
    return [...powerData].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [powerData]);

  const chartData = useMemo(() => {
    if (!powerData || powerData.length === 0) return null;
    const sortedByDate = [...powerData]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30);
    const labels = sortedByDate.map(d => {
      const date = new Date(d.date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    });
    const data = sortedByDate.map(d => d.total);
    return {labels, data, activities: sortedByDate};
  }, [powerData]);

  const {
    activeIndex: activeChartIndex,
    isInteracting: isChartInteracting,
    onTouchStart: handleChartTouchStart,
    clear: clearChartInteraction,
    getPointerConfig,
  } = useChartOverlay();

  const activeActivity = chartData && activeChartIndex !== null ? chartData.activities[activeChartIndex] ?? null : null;

  if (!stats) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('powerAnalysis.title')}</Text>
      <Text style={styles.subtitle}>{t('powerAnalysis.last50')}</Text>

      {/* Stats Cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsScrollContent}
        style={styles.statsScroll}>
        <View style={styles.statCard}>
          <View style={styles.statValueRow}>
            <Text style={styles.statValue}>{stats.avgPower}</Text>
            <TrendBadge value={trend} />
          </View>
          <Text style={styles.statLabel}>{t('powerAnalysis.avgPower')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.maxPower}</Text>
          <Text style={styles.statLabel}>{t('powerAnalysis.maxPower')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.minPower}</Text>
          <Text style={styles.statLabel}>{t('powerAnalysis.minPower')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalActivities}</Text>
          <Text style={styles.statLabel}>{t('powerAnalysis.totalActivities')}</Text>
        </View>
        {(stats.activitiesWithWindData ?? 0) > 0 && (
          <View style={[styles.statCard, {backgroundColor: '#1a4d2e'}]}>
            <Text style={styles.statValue}>{stats.activitiesWithWindData}</Text>
            <Text style={styles.statLabel}>{t('powerAnalysis.withWind')}</Text>
          </View>
        )}
        {(stats.activitiesWithRealPower ?? 0) > 0 && (
          <View style={[styles.statCard, {backgroundColor: '#0d5c3a'}]}>
            <Text style={styles.statValue}>{stats.activitiesWithRealPower}</Text>
            <Text style={styles.statLabel}>{t('powerAnalysis.powerMeter')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Info Note */}
      <View style={styles.noteContainer}>
        <Text style={styles.noteText}>💡 {t('powerAnalysis.estimatedHint')}</Text>
      </View>

      {/* Power Chart */}
      {chartData && chartData.data.length > 0 && (
        <View
          style={styles.chartSection}
          onTouchStart={handleChartTouchStart}
          onTouchEnd={clearChartInteraction}
          onTouchCancel={clearChartInteraction}>
          <View style={styles.titleRow}>
            <Text style={styles.sectionTitle}>{t('powerAnalysis.dynamics')}</Text>
            {onHelpPress && (
              <TouchableOpacity
                style={styles.helpButton}
                onPress={() => onHelpPress('power_dynamics')}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Text style={styles.helpIcon}>?</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.chartWrapper}>
            {/* Detail overlay — appears on scrub */}
            {isChartInteracting && activeActivity && (
              <View style={styles.detailOverlay}>
                <View style={styles.detailHeader}>
                  <View style={styles.detailLeft}>
                    <Text style={styles.detailName} numberOfLines={1}>
                      {activeActivity.name}
                    </Text>
                    <Text style={styles.detailDate}>
                      {new Date(activeActivity.date).toLocaleDateString(getDateLocale(), {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {activeActivity.hasRealPower && '  ' + t('powerAnalysis.meter')}
                    </Text>
                  </View>
                  <View style={styles.detailRight}>
                    <Text style={styles.detailPower}>{activeActivity.total}</Text>
                    <Text style={styles.detailPowerUnit}>{t('common.watts')}</Text>
                  </View>
                </View>
                <View style={styles.detailBreakdown}>
                  {activeActivity.speed && (
                    <View style={styles.detailPill}>
                      <Text style={styles.detailPillValue}>{activeActivity.speed}</Text>
                      <Text style={styles.detailPillLabel}>{t('common.kmh')}</Text>
                    </View>
                  )}
                  {activeActivity.hasWind && (
                    <View style={styles.detailPill}>
                      <Text style={styles.detailPillValue}>✓</Text>
                      <Text style={styles.detailPillLabel}>{t('powerAnalysis.wind')}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.chartContainer}>
              <LineChart
                data={chartData.data.map((value: number, index: number) => ({
                  value: value,
                  index: index,
                }))}
                width={screenWidth - 2}
                height={240}
                maxValue={Math.max(...chartData.data) * 1.1}
                noOfSections={4}
                curved
                areaChart
                startFillColor="#7eaaff"
                startOpacity={0.2}
                endOpacity={0}
                spacing={Math.floor((screenWidth - 65) / Math.max(chartData.data.length - 1, 1))}
                color="#7eaaff"
                thickness={3}
                hideDataPoints={false}
                dataPointsColor="#7eaaff"
                dataPointsRadius={1}
                textColor1="#888"
                textFontSize={11}
                xAxisColor="#333"
                yAxisColor="transparent"
                xAxisThickness={1}
                yAxisThickness={0}
                rulesColor="#333"
                rulesThickness={1}
                yAxisTextStyle={{color: '#888', fontSize: 11}}
                xAxisLabelTextStyle={{color: '#888', fontSize: 11}}
                hideRules={false}
                showVerticalLines={false}
                verticalLinesColor="transparent"
                initialSpacing={10}
                endSpacing={10}
                pointerConfig={getPointerConfig('#7eaaff', 200)}
              />
            </View>
          </View>
        </View>
      )}

      {/* Top Activities */}
      {topActivitiesByPower.length > 0 && (
        <View style={styles.topActivitiesSection}>
          <View style={styles.titleRow}>
            <Text style={styles.sectionTitle}>{t('powerAnalysis.top5')}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topActivitiesScrollContent}
            style={styles.topActivitiesScroll}>
            {topActivitiesByPower.map((activity, index) => (
              <View key={activity.id} style={styles.activityCard}>
                <View style={styles.activityCardHeader}>
                  <Text style={styles.powerValue}>{activity.total}W</Text>
                  <View style={styles.activityRank}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.activityName} numberOfLines={2}>
                  {activity.name}
                </Text>
                <Text style={styles.activityDate}>
                  {new Date(activity.date).toLocaleDateString(getDateLocale(), {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                {activity.hasRealPower && (
                  <View style={styles.realPowerBadge}>
                    <Text style={styles.realPowerText}>{t('powerAnalysis.meter')}</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 12,
  },
  helpIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 32,
    marginHorizontal: 16,
  },
  title: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: '#d6d6d6',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  statsScroll: {
    marginBottom: 16,
  },
  statsScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
    marginTop: 12,
    zIndex: 1,
  },
  statCard: {
    width: 140,
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  chartSection: {
    marginBottom: 0,
    overflow: 'visible',
    zIndex: 1000,

  },
  chartWrapper: {
    position: 'relative',
    marginTop: 12,
  },
  detailOverlay: {
    position: 'absolute',
    top: -108,
    left: 0,
    right: 0,
    zIndex: 2000,
    backgroundColor: 'rgb(43, 43, 43)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#7eaaff',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLeft: {
    flex: 1,
    marginRight: 12,
  },
  detailRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  detailName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  detailDate: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  detailPower: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  detailPowerUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginLeft: 2,
  },
  detailBreakdown: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 0,
    flexWrap: 'wrap',
  },
  detailPill: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',

    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 48,
  },
  detailPillValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  detailPillLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  chartContainer: {
    marginTop: 4,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },
  topActivitiesSection: {
    marginBottom: 20,
  },
  topActivitiesScroll: {
    marginTop: 12,
  },
  topActivitiesScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 0,
    letterSpacing: 0.5,
    marginTop: 16,
  },
  activityCard: {
    width: 200,
    backgroundColor: '#222',
    padding: 16,
    borderRadius: 12,
  },
  activityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  activityRank: {
    width: 24,
    height: 24,
    borderRadius: 16,
    backgroundColor: '#274DD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  activityName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,

  },
  activityDate: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
  },
  powerValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  realPowerBadge: {
    backgroundColor: '#10b981',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  realPowerText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '600',
  },
  noteContainer: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 11,
    color: '#888',
    lineHeight: 16,
  },
});
