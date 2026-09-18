import React, {useMemo, useCallback} from 'react';
import {getDateLocale} from '../i18n/dateLocale';
import {View, Text, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useChartOverlay} from '../hooks/useChartOverlay';
import {MetricAnalysisSection} from './analysis/MetricAnalysisSection';
import {StatCardRow} from './analysis/StatCardRow';
import {TrendLineChart, RichChartDetail} from './analysis/TrendLineChart';
import {ActivityMetricList} from './analysis/ActivityMetricList';
import type {StatCardConfig, ActivityMetricListItem} from './analysis/types';

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
//
// T-5.3 (audit A-24/A-28): the header/stat-cards/trend-chart/top-5-list
// layout itself now comes from `src/components/analysis/` — shared with
// Heart/Speed/Cadence's analysis components. See
// `src/components/analysis/README.md` for the full diff.
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
    const data = sortedByDate.map(d => d.total);
    return {data, activities: sortedByDate};
  }, [powerData]);

  const overlay = useChartOverlay();
  const activeActivity =
    chartData && overlay.activeIndex !== null ? chartData.activities[overlay.activeIndex] ?? null : null;

  const handleHelpPress = useCallback(() => onHelpPress?.('power_dynamics'), [onHelpPress]);

  if (!stats) {
    return null;
  }

  const cards: StatCardConfig[] = [
    {key: 'avg', value: stats.avgPower, label: t('powerAnalysis.avgPower'), trend},
    {key: 'max', value: stats.maxPower, label: t('powerAnalysis.maxPower')},
    {key: 'min', value: stats.minPower, label: t('powerAnalysis.minPower')},
    {key: 'total', value: stats.totalActivities, label: t('powerAnalysis.totalActivities')},
  ];
  if ((stats.activitiesWithWindData ?? 0) > 0) {
    cards.push({
      key: 'wind',
      value: stats.activitiesWithWindData!,
      label: t('powerAnalysis.withWind'),
      backgroundColor: '#1a4d2e',
    });
  }
  if ((stats.activitiesWithRealPower ?? 0) > 0) {
    cards.push({
      key: 'realPower',
      value: stats.activitiesWithRealPower!,
      label: t('powerAnalysis.powerMeter'),
      backgroundColor: '#0d5c3a',
    });
  }

  const topActivityItems: ActivityMetricListItem[] = topActivitiesByPower.map(activity => ({
    id: activity.id,
    name: activity.name,
    date: activity.date,
    valueLabel: `${activity.total}W`,
    badgeText: activity.hasRealPower ? t('powerAnalysis.meter') : undefined,
  }));

  return (
    <MetricAnalysisSection title={t('powerAnalysis.title')} subtitle={t('powerAnalysis.last50')} marginTop={32}>
      <StatCardRow
        cards={cards}
        cardWidth={140}
        cardPadding={12}
        valueFontWeight="800"
        valueMarginBottom={0}
        labelColor="#888"
        labelMarginTop={6}
        topSpacing={12}
        bottomSpacing={16}
      />

      <View style={styles.noteContainer}>
        <Text style={styles.noteText}>💡 {t('powerAnalysis.estimatedHint')}</Text>
      </View>

      {chartData && chartData.data.length > 0 && (
        <TrendLineChart
          title={t('powerAnalysis.dynamics')}
          onHelpPress={onHelpPress ? handleHelpPress : undefined}
          data={chartData.data}
          color="#7eaaff"
          height={240}
          pointerStripHeight={200}
          overlay={overlay}
          titleColor="#fff"
          titleMarginTop={16}
          titleMarginBottom={0}
          titleLetterSpacing={0.5}
          titleTextTransform="none"
          helpButtonMarginTop={12}
          blockZIndex={1000}
          blockMarginBottom={0}
          wrapperMarginTop={12}
          detail={
            activeActivity && (
              <RichChartDetail
                title={activeActivity.name}
                subtitle={
                  new Date(activeActivity.date).toLocaleDateString(getDateLocale(), {
                    month: 'short',
                    day: 'numeric',
                  }) + (activeActivity.hasRealPower ? '  ' + t('powerAnalysis.meter') : '')
                }
                value={activeActivity.total}
                unit={t('common.watts')}
                pills={[
                  ...(activeActivity.speed ? [{value: activeActivity.speed, label: t('common.kmh')}] : []),
                  ...(activeActivity.hasWind ? [{value: '✓', label: t('powerAnalysis.wind')}] : []),
                ]}
              />
            )
          }
        />
      )}

      <ActivityMetricList title={t('powerAnalysis.top5')} items={topActivityItems} />
    </MetricAnalysisSection>
  );
};

const styles = StyleSheet.create({
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
