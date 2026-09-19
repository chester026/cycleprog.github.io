import React, {useMemo, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {useChartOverlay} from '../hooks/useChartOverlay';
import {MetricAnalysisSection} from './analysis/MetricAnalysisSection';
import {StatCardRow} from './analysis/StatCardRow';
import {TrendLineChart, SimpleChartDetail} from './analysis/TrendLineChart';
import {groupActivitiesByIsoWeek} from './analysis/types';
import type {StatCardConfig} from './analysis/types';

// T-5.3 (audit A-24/A-28): header/stat-cards/trend-chart layout now comes
// from `src/components/analysis/` — shared with Power/Heart/Speed's
// analysis components. See `src/components/analysis/README.md`.
export interface CadenceStats {
  avgCadence: number;
  maxCadence: number;
  minCadence: number;
}

interface CadenceAnalysisProps {
  activities: any[];
  onStatsCalculated?: (stats: CadenceStats) => void;
  onHelpPress?: (topicId: string) => void;
  trend?: number | null;
}

export const CadenceAnalysis: React.FC<CadenceAnalysisProps> = ({
  activities,
  onStatsCalculated,
  onHelpPress,
  trend,
}) => {
  const {t} = useTranslation();
  const cadenceSpeedChart = useChartOverlay();
  const cadenceTrendChart = useChartOverlay();

  const rides = useMemo(() => {
    return activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
  }, [activities]);

  // 1. Статистика каденса
  const cadenceStats = useMemo(() => {
    const cadenceData = rides.filter(a => a.average_cadence).map(a => a.average_cadence);
    if (cadenceData.length === 0) return null;
    return {
      avg: Math.round(cadenceData.reduce((sum, cad) => sum + cad, 0) / cadenceData.length),
      min: Math.min(...cadenceData),
      max: Math.max(...cadenceData),
      total: cadenceData.length,
    };
  }, [rides]);

  React.useEffect(() => {
    if (onStatsCalculated && cadenceStats) {
      onStatsCalculated({
        avgCadence: cadenceStats.avg,
        maxCadence: cadenceStats.max,
        minCadence: cadenceStats.min,
      });
    }
  }, [cadenceStats, onStatsCalculated]);

  // 2. Cadence vs Speed - последние 20 тренировок
  const cadenceVsSpeedData = useMemo(() => {
    const sorted = rides.slice().sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    const last20 = sorted.slice(0, 20).reverse();
    const withBoth = last20.filter(a => a.average_cadence && a.average_speed);
    const cadenceData = withBoth.map(a => a.average_cadence);
    const speedData = withBoth.map(a => parseFloat((a.average_speed * 3.6).toFixed(1)));
    const labels = withBoth.map(a => {
      const date = new Date(a.start_date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    });
    // Масштабируем скорость для визуализации.
    const scaleFactor = 3;
    return {
      labels: labels.length > 0 ? labels : [''],
      cadenceData: cadenceData.length > 0 ? cadenceData : [0],
      scaledSpeedData: (speedData.length > 0 ? speedData : [0]).map(s => s * scaleFactor),
    };
  }, [rides]);

  // 3. Average Cadence Trend (Weekly)
  const avgCadenceTrendData = useMemo(() => {
    const weeks = groupActivitiesByIsoWeek(rides, a => a.start_date, a => a.average_cadence);
    return {
      labels: weeks.length > 0 ? weeks.map(w => w.label) : [''],
      data: weeks.length > 0 ? weeks.map(w => Math.round(w.avg)) : [0],
    };
  }, [rides]);

  const handleVsSpeedHelp = useCallback(() => onHelpPress?.('cadence_vs_speed'), [onHelpPress]);
  const handleAvgTrendHelp = useCallback(() => onHelpPress?.('cadence_avg_trend'), [onHelpPress]);

  if (!rides || rides.length === 0) {
    return (
      <MetricAnalysisSection
        title={t('cadenceAnalysis.title')}
        isEmpty
        emptyText={t('cadenceAnalysis.noData')}
        marginBottom={72}
      />
    );
  }

  const cards: StatCardConfig[] | null = cadenceStats
    ? [
        {key: 'avg', value: cadenceStats.avg, label: t('cadenceAnalysis.avgCadence'), trend},
        {key: 'min', value: cadenceStats.min, label: t('cadenceAnalysis.minCadence')},
        {key: 'max', value: cadenceStats.max, label: t('cadenceAnalysis.maxCadence')},
        {key: 'total', value: cadenceStats.total, label: t('cadenceAnalysis.totalWorkouts')},
      ]
    : null;

  return (
    <MetricAnalysisSection title={t('cadenceAnalysis.title')} marginBottom={72}>
      {cards ? <StatCardRow cards={cards} /> : null}

      {cadenceVsSpeedData.labels.length > 1 && (
        <TrendLineChart
          title={t('cadenceAnalysis.vsSpeed')}
          onHelpPress={onHelpPress ? handleVsSpeedHelp : undefined}
          data={cadenceVsSpeedData.cadenceData}
          data2={cadenceVsSpeedData.scaledSpeedData}
          color="#8B5CF6"
          color2="#00B2FF"
          overlay={cadenceSpeedChart}
          helpButtonMarginTop={20}
          detail={
            cadenceSpeedChart.activeIndex !== null && (
              <SimpleChartDetail
                color="#8B5CF6"
                title={`${t('cadenceAnalysis.activity')}${cadenceSpeedChart.activeIndex + 1} • ${
                  cadenceVsSpeedData.labels[cadenceSpeedChart.activeIndex]
                }`}
                primaryValue={cadenceVsSpeedData.cadenceData[cadenceSpeedChart.activeIndex]}
                primaryLabel={t('common.rpm')}
                secondaryValue={(cadenceVsSpeedData.scaledSpeedData[cadenceSpeedChart.activeIndex] / 3).toFixed(1)}
                secondaryLabel={t('common.kmh')}
              />
            )
          }
          legend={[
            {color: '#8B5CF6', label: t('cadenceAnalysis.avgCadenceLabel')},
            {color: '#00B2FF', label: t('cadenceAnalysis.avgSpeedLabel')},
          ]}
          description={t('cadenceAnalysis.speedScaled')}
        />
      )}

      {avgCadenceTrendData.labels.length > 1 && (
        <TrendLineChart
          title={t('cadenceAnalysis.weeklyTrend')}
          onHelpPress={onHelpPress ? handleAvgTrendHelp : undefined}
          data={avgCadenceTrendData.data}
          color="#8B5CF6"
          overlay={cadenceTrendChart}
          helpButtonMarginTop={20}
          detail={
            cadenceTrendChart.activeIndex !== null && (
              <SimpleChartDetail
                color="#8B5CF6"
                title={`${t('cadenceAnalysis.week')}${avgCadenceTrendData.labels[cadenceTrendChart.activeIndex]}`}
                primaryValue={avgCadenceTrendData.data[cadenceTrendChart.activeIndex]}
                primaryLabel={t('cadenceAnalysis.avgRpm')}
              />
            )
          }
        />
      )}
    </MetricAnalysisSection>
  );
};
