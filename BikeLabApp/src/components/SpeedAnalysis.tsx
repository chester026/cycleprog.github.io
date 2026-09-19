import React, {useMemo, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {useChartOverlay} from '../hooks/useChartOverlay';
import {MetricAnalysisSection} from './analysis/MetricAnalysisSection';
import {StatCardRow} from './analysis/StatCardRow';
import {TrendLineChart, TrendBarChart, SimpleChartDetail} from './analysis/TrendLineChart';
import {groupActivitiesByIsoWeek} from './analysis/types';
import type {StatCardConfig} from './analysis/types';
import {getISOWeekNumber} from '@bikelab/shared/calc';

// T-5.3 (audit A-24/A-28): header/stat-cards/trend-chart layout now comes
// from `src/components/analysis/` — shared with Power/Heart/Cadence's
// analysis components. See `src/components/analysis/README.md`.
export interface SpeedStats {
  avgSpeed: number;
  maxSpeed: number;
  minSpeed: number;
}

interface SpeedAnalysisProps {
  activities: any[];
  onStatsCalculated?: (stats: SpeedStats) => void;
  onHelpPress?: (topicId: string) => void;
}

export const SpeedAnalysis: React.FC<SpeedAnalysisProps> = ({activities, onStatsCalculated, onHelpPress}) => {
  const {t} = useTranslation();

  const rides = useMemo(() => {
    return activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
  }, [activities]);

  // 1. Статистика скорости
  const speedStats = useMemo(() => {
    const speedData = rides.filter(a => a.average_speed).map(a => parseFloat((a.average_speed * 3.6).toFixed(1)));
    if (speedData.length === 0) return null;
    const maxSpeedData = rides.filter(a => a.max_speed).map(a => parseFloat((a.max_speed * 3.6).toFixed(1)));
    return {
      avg: (speedData.reduce((sum, spd) => sum + spd, 0) / speedData.length).toFixed(1),
      min: Math.min(...speedData).toFixed(1),
      max: Math.max(...maxSpeedData).toFixed(1),
      total: speedData.length,
    };
  }, [rides]);

  React.useEffect(() => {
    if (onStatsCalculated && speedStats) {
      onStatsCalculated({
        avgSpeed: parseFloat(speedStats.avg),
        maxSpeed: parseFloat(speedStats.max),
        minSpeed: parseFloat(speedStats.min),
      });
    }
  }, [speedStats, onStatsCalculated]);

  // 2. Average/Max Speed Trend (Weekly, last 26 weeks). Both aggregates
  // come from the same activities in the same pass (average_speed feeds
  // the average, max_speed feeds the per-week max), same as the original.
  const avgSpeedTrendData = useMemo(() => {
    const weekMap: {[key: string]: {sum: number; count: number; max: number}} = {};
    rides.forEach(a => {
      if (!a.start_date || !a.average_speed) return;
      const d = new Date(a.start_date);
      const key = `${d.getFullYear()}-W${getISOWeekNumber(d).toString().padStart(2, '0')}`;
      if (!weekMap[key]) weekMap[key] = {sum: 0, count: 0, max: 0};
      weekMap[key].sum += a.average_speed * 3.6;
      weekMap[key].count += 1;
      if (a.max_speed) weekMap[key].max = Math.max(weekMap[key].max, a.max_speed * 3.6);
    });

    const sorted = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-26);

    return {
      labels: sorted.length > 0 ? sorted.map(([key]) => key.split('-W')[1]) : [''],
      avgData: sorted.length > 0 ? sorted.map(([, val]) => parseFloat((val.sum / val.count).toFixed(1))) : [0],
      maxData: sorted.length > 0 ? sorted.map(([, val]) => parseFloat(val.max.toFixed(1))) : [0],
    };
  }, [rides]);

  // 3. Speed on Flat vs Hills (last 16 weeks each)
  const speedTerrainData = useMemo(() => {
    const flatRides = rides.filter(a => a.average_speed && a.distance && a.total_elevation_gain && a.total_elevation_gain / (a.distance / 1000) < 10);
    const hillsRides = rides.filter(a => a.average_speed && a.distance && a.total_elevation_gain && a.total_elevation_gain / (a.distance / 1000) >= 10);

    const flatWeeks = groupActivitiesByIsoWeek(flatRides, a => a.start_date, a => a.average_speed * 3.6).slice(-16);
    const hillsWeeks = groupActivitiesByIsoWeek(hillsRides, a => a.start_date, a => a.average_speed * 3.6).slice(-16);

    return {
      flatLabels: flatWeeks.length > 0 ? flatWeeks.map(w => w.label) : [''],
      flatData: flatWeeks.length > 0 ? flatWeeks.map(w => parseFloat(w.avg.toFixed(1))) : [0],
      hillsLabels: hillsWeeks.length > 0 ? hillsWeeks.map(w => w.label) : [''],
      hillsData: hillsWeeks.length > 0 ? hillsWeeks.map(w => parseFloat(w.avg.toFixed(1))) : [0],
    };
  }, [rides]);

  const avgSpeedChart = useChartOverlay();
  const flatSpeedChart = useChartOverlay();
  const hillsSpeedChart = useChartOverlay();

  const handleAvgTrendHelp = useCallback(() => onHelpPress?.('speed_avg_trend'), [onHelpPress]);
  const handleMaxTrendHelp = useCallback(() => onHelpPress?.('speed_max_trend'), [onHelpPress]);
  const handleFlatHelp = useCallback(() => onHelpPress?.('speed_flat'), [onHelpPress]);
  const handleHillsHelp = useCallback(() => onHelpPress?.('speed_hills'), [onHelpPress]);

  if (!rides || rides.length === 0) {
    return <MetricAnalysisSection title={t('speedAnalysis.title')} isEmpty emptyText={t('speedAnalysis.noData')} />;
  }

  const cards: StatCardConfig[] | null = speedStats
    ? [
        {key: 'avg', value: speedStats.avg, label: t('speedAnalysis.avgSpeed')},
        {key: 'min', value: speedStats.min, label: t('speedAnalysis.minSpeed')},
        {key: 'max', value: speedStats.max, label: t('speedAnalysis.maxSpeed')},
        {key: 'total', value: speedStats.total, label: t('speedAnalysis.totalWorkouts')},
      ]
    : null;

  return (
    <MetricAnalysisSection title={t('speedAnalysis.title')}>
      {cards ? <StatCardRow cards={cards} /> : null}

      {avgSpeedTrendData.labels.length > 1 && (
        <TrendLineChart
          title={t('speedAnalysis.avgTrend')}
          onHelpPress={onHelpPress ? handleAvgTrendHelp : undefined}
          data={avgSpeedTrendData.avgData}
          color="#4CAF50"
          overlay={avgSpeedChart}
          detail={
            avgSpeedChart.activeIndex !== null && (
              <SimpleChartDetail
                color="#4CAF50"
                title={`${t('speedAnalysis.week')}${avgSpeedTrendData.labels[avgSpeedChart.activeIndex]}`}
                primaryValue={avgSpeedTrendData.avgData[avgSpeedChart.activeIndex]}
                primaryLabel={t('speedAnalysis.avgKmh')}
              />
            )
          }
        />
      )}

      {avgSpeedTrendData.labels.length > 1 && (
        <TrendBarChart
          title={t('speedAnalysis.maxTrend')}
          onHelpPress={onHelpPress ? handleMaxTrendHelp : undefined}
          data={avgSpeedTrendData.maxData}
          labels={avgSpeedTrendData.labels}
          color="#388B3C"
          noOfSections={6}
          detailTitlePrefix={t('speedAnalysis.week')}
          detailUnitLabel={t('speedAnalysis.maxKmh')}
          barWidthGap={12}
        />
      )}

      {speedTerrainData.flatLabels.length > 1 && (
        <TrendLineChart
          title={t('speedAnalysis.flatTrend')}
          onHelpPress={onHelpPress ? handleFlatHelp : undefined}
          data={speedTerrainData.flatData}
          color="#4CAF50"
          noOfSections={6}
          overlay={flatSpeedChart}
          detail={
            flatSpeedChart.activeIndex !== null && (
              <SimpleChartDetail
                color="#4CAF50"
                title={`${t('speedAnalysis.week')}${speedTerrainData.flatLabels[flatSpeedChart.activeIndex]}`}
                primaryValue={speedTerrainData.flatData[flatSpeedChart.activeIndex]}
                primaryLabel={t('common.kmh')}
              />
            )
          }
          description={t('speedAnalysis.flatHint')}
        />
      )}

      {speedTerrainData.hillsLabels.length > 1 && (
        <TrendLineChart
          title={t('speedAnalysis.hillTrend')}
          onHelpPress={onHelpPress ? handleHillsHelp : undefined}
          data={speedTerrainData.hillsData}
          color="#FF9800"
          noOfSections={6}
          overlay={hillsSpeedChart}
          detail={
            hillsSpeedChart.activeIndex !== null && (
              <SimpleChartDetail
                color="#FF9800"
                title={`${t('speedAnalysis.week')}${speedTerrainData.hillsLabels[hillsSpeedChart.activeIndex]}`}
                primaryValue={speedTerrainData.hillsData[hillsSpeedChart.activeIndex]}
                primaryLabel={t('common.kmh')}
              />
            )
          }
          description={t('speedAnalysis.hillHint')}
        />
      )}
    </MetricAnalysisSection>
  );
};

