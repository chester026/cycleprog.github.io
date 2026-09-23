import React, {useMemo, useCallback} from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme} from '../theme';
import Svg, {Circle} from 'react-native-svg';
import {useChartOverlay} from '../hooks/useChartOverlay';
import {MetricAnalysisSection} from './analysis/MetricAnalysisSection';
import {StatCardRow} from './analysis/StatCardRow';
import {TrendLineChart, TrendBarChart, SimpleChartDetail} from './analysis/TrendLineChart';
import {groupActivitiesByIsoWeek} from './analysis/types';
import type {StatCardConfig} from './analysis/types';
import {computeHrZones, zoneForHr, getISOWeekNumber} from '@bikelab/shared/calc';
import type {HrZones} from '@bikelab/shared/calc';

// T-5.3 (audit A-24/A-28): header/stat-cards/trend-chart layout now comes
// from `src/components/analysis/` — shared with Power/Speed/Cadence's
// analysis components. The HR-zones donut is genuinely one-off (hand-drawn
// SVG) and stays here. See `src/components/analysis/README.md`.
export interface HeartStats {
  avgHR: number;
  maxHR: number;
  minHR: number;
}

interface HeartAnalysisProps {
  activities: any[];
  userProfile: any;
  onStatsCalculated?: (stats: HeartStats) => void;
  onHelpPress?: (topicId: string) => void;
  trend?: number | null;
}

export const HeartAnalysis: React.FC<HeartAnalysisProps> = ({
  activities,
  userProfile,
  onStatsCalculated,
  onHelpPress,
  trend,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const hrSpeedChart = useChartOverlay();
  const hrTrendChart = useChartOverlay();

  const rides = useMemo(() => {
    return activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
  }, [activities]);

  // 1. Статистика пульса
  const heartRateStats = useMemo(() => {
    const hrData = rides.filter(a => a.average_heartrate).map(a => a.average_heartrate);
    if (hrData.length === 0) return null;
    return {
      avg: Math.round(hrData.reduce((sum, hr) => sum + hr, 0) / hrData.length),
      min: Math.min(...hrData),
      max: Math.max(...hrData),
      total: hrData.length,
    };
  }, [rides]);

  React.useEffect(() => {
    if (onStatsCalculated && heartRateStats) {
      onStatsCalculated({avgHR: heartRateStats.avg, maxHR: heartRateStats.max, minHR: heartRateStats.min});
    }
  }, [heartRateStats, onStatsCalculated]);

  // 2. HR vs Speed - последние 20 тренировок
  const hrVsSpeedData = useMemo(() => {
    const sorted = rides.slice().sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    const last20 = sorted.slice(0, 20).reverse();
    const withBoth = last20.filter(a => a.average_heartrate && a.average_speed);
    const hrData = withBoth.map(a => a.average_heartrate);
    const speedData = withBoth.map(a => parseFloat((a.average_speed * 3.6).toFixed(1)));
    const labels = withBoth.map(a => {
      const date = new Date(a.start_date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    });
    // Масштабируем скорость, чтобы она была в том же диапазоне, что и HR
    // (HR: 120-160, Speed: 20-30 км/ч, коэффициент ~5).
    const scaleFactor = 5;
    return {
      labels: labels.length > 0 ? labels : [''],
      hrData: hrData.length > 0 ? hrData : [0],
      scaledSpeedData: (speedData.length > 0 ? speedData : [0]).map(s => s * scaleFactor),
    };
  }, [rides]);

  // 3. Average HR Trend (Weekly)
  const avgHRTrendData = useMemo(() => {
    const weeks = groupActivitiesByIsoWeek(rides, a => a.start_date, a => a.average_heartrate);
    return {
      labels: weeks.length > 0 ? weeks.map(w => w.label) : [''],
      data: weeks.length > 0 ? weeks.map(w => Math.round(w.avg)) : [0],
    };
  }, [rides]);

  // 4. Max HR per Week - последние 26 недель
  const maxHRPerWeekData = useMemo(() => {
    const weeks = groupActivitiesByIsoWeek(rides, a => a.start_date, a => a.max_heartrate);
    const weekMap = new Map(weeks.map(w => [w.week, w.max]));
    const now = new Date();
    const result: {week: string; maxHR: number}[] = [];
    for (let i = 25; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - i * 7);
      const week = getISOWeekNumber(targetDate);
      const key = `${targetDate.getFullYear()}-W${week}`;
      result.push({week: key, maxHR: weekMap.get(key) || 0});
    }
    const filtered = result.filter(d => d.maxHR > 0);
    return {
      labels: filtered.length > 0 ? filtered.map(d => d.week.split('-W')[1]) : [''],
      data: filtered.length > 0 ? filtered.map(d => d.maxHR) : [0],
    };
  }, [rides]);

  // 5. HR Zones Distribution (Donut Chart) - LAST 6 MONTHS
  // Uses the single shared HR-zones implementation (T-3.1) — prefers the
  // server-derived `userProfile.hr_zones`, falling back to computing it
  // locally if the profile hasn't loaded that field yet.
  const hrZonesData = useMemo(() => {
    const hrZones: HrZones = userProfile?.hr_zones?.zones
      ? (userProfile.hr_zones as HrZones)
      : computeHrZones(userProfile || {});

    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const last6MonthsRides = rides.filter(a => new Date(a.start_date) >= sixMonthsAgo);

    const zoneTimes = hrZones.zones.map(zone => {
      const timeInMinutes =
        last6MonthsRides
          .filter(a => zoneForHr(hrZones, a.average_heartrate) === zone.id)
          .reduce((sum, a) => sum + (a.moving_time || 0), 0) / 60;
      return {
        name: t(`heartAnalysis.zone${zone.id}`),
        time: Math.round(timeInMinutes),
        color: zone.color,
      };
    });

    return zoneTimes.filter(z => z.time > 0);
  }, [rides, userProfile, t]);

  const renderDonutChart = (data: {time: number; color: string}[]) => {
    const total = data.reduce((sum, zone) => sum + zone.time, 0);
    const size = 150;
    const strokeWidth = 45;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPercentage = 0;

    return (
      <Svg width={size} height={size}>
        {data.map((zone, index) => {
          const percentage = (zone.time / total) * 100;
          const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
          const rotation = (accumulatedPercentage / 100) * 360 - 90;
          const circle = (
            <Circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={zone.color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={strokeDasharray}
              rotation={rotation}
              origin={`${size / 2}, ${size / 2}`}
              strokeLinecap="butt"
            />
          );
          accumulatedPercentage += percentage;
          return circle;
        })}
      </Svg>
    );
  };

  const handleVsSpeedHelp = useCallback(() => onHelpPress?.('heart_avg_vs_speed'), [onHelpPress]);
  const handleAvgTrendHelp = useCallback(() => onHelpPress?.('heart_avg_trend'), [onHelpPress]);
  const handleMaxTrendHelp = useCallback(() => onHelpPress?.('heart_max_trend'), [onHelpPress]);

  if (!rides || rides.length === 0) {
    return <MetricAnalysisSection title={t('heartAnalysis.title')} isEmpty emptyText={t('heartAnalysis.noData')} />;
  }

  const cards: StatCardConfig[] | null = heartRateStats
    ? [
        {key: 'avg', value: heartRateStats.avg, label: t('heartAnalysis.avgHR'), trend},
        {key: 'min', value: heartRateStats.min, label: t('heartAnalysis.minHR')},
        {key: 'max', value: heartRateStats.max, label: t('heartAnalysis.maxHR')},
        {key: 'total', value: heartRateStats.total, label: t('heartAnalysis.totalWorkouts')},
      ]
    : null;

  return (
    <MetricAnalysisSection title={t('heartAnalysis.title')}>
      {cards ? <StatCardRow cards={cards} /> : null}

      {hrVsSpeedData.labels.length > 1 && (
        <TrendLineChart
          title={t('heartAnalysis.vsSpeed')}
          onHelpPress={onHelpPress ? handleVsSpeedHelp : undefined}
          data={hrVsSpeedData.hrData}
          data2={hrVsSpeedData.scaledSpeedData}
          color={theme.colors.chart.series3}
          color2={theme.colors.chart.series5}
          overlay={hrSpeedChart}
          titleColor={theme.colors.chart.legendTextOnDark}
          titleMarginBottom={4}
          blockZIndex={1000}
          helpButtonMarginTop={26}
          wrapperMarginTop={16}
          detail={
            hrSpeedChart.activeIndex !== null && (
              <SimpleChartDetail
                color={theme.colors.chart.series3}
                topOffset={-60}
                title={`${t('heartAnalysis.activity')}${hrSpeedChart.activeIndex + 1} • ${
                  hrVsSpeedData.labels[hrSpeedChart.activeIndex]
                }`}
                primaryValue={hrVsSpeedData.hrData[hrSpeedChart.activeIndex]}
                primaryLabel={t('common.bpm')}
                secondaryValue={(hrVsSpeedData.scaledSpeedData[hrSpeedChart.activeIndex] / 5).toFixed(1)}
                secondaryLabel={t('common.kmh')}
              />
            )
          }
          legend={[
            {color: theme.colors.chart.series3, label: t('heartAnalysis.avgHRLabel')},
            {color: theme.colors.chart.series5, label: t('heartAnalysis.avgSpeedLabel')},
          ]}
          description={t('heartAnalysis.speedScaled')}
        />
      )}

      {avgHRTrendData.labels.length > 1 && (
        <TrendLineChart
          title={t('heartAnalysis.avgTrend')}
          onHelpPress={onHelpPress ? handleAvgTrendHelp : undefined}
          data={avgHRTrendData.data}
          color={theme.colors.chart.series3}
          overlay={hrTrendChart}
          titleColor={theme.colors.chart.legendTextOnDark}
          titleMarginBottom={4}
          blockZIndex={1000}
          helpButtonMarginTop={26}
          wrapperMarginTop={16}
          detail={
            hrTrendChart.activeIndex !== null && (
              <SimpleChartDetail
                color={theme.colors.chart.series3}
                topOffset={-60}
                title={`${t('heartAnalysis.week')}${avgHRTrendData.labels[hrTrendChart.activeIndex]}`}
                primaryValue={avgHRTrendData.data[hrTrendChart.activeIndex]}
                primaryLabel={t('heartAnalysis.avgBpm')}
              />
            )
          }
        />
      )}

      {maxHRPerWeekData.labels.length > 1 && (
        <TrendBarChart
          title={t('heartAnalysis.maxTrend')}
          onHelpPress={onHelpPress ? handleMaxTrendHelp : undefined}
          data={maxHRPerWeekData.data}
          labels={maxHRPerWeekData.labels}
          color={theme.colors.chart.series3}
          titleColor={theme.colors.chart.legendTextOnDark}
          titleMarginBottom={4}
          blockZIndex={1000}
          helpButtonMarginTop={26}
          wrapperMarginTop={16}
          detailTitlePrefix={t('heartAnalysis.week')}
          detailUnitLabel={t('heartAnalysis.maxBpm')}
          detailTopOffset={-60}
          barWidthGap={4}
          xAxisLabelWidth={30}
          initialSpacing={15}
        />
      )}

      {hrZonesData.length > 0 && (
        <View style={styles.chartBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.zonesTitle}>{t('heartAnalysis.hrZones')}</Text>
          </View>
          <Text style={styles.periodLabel}>{t('heartAnalysis.period6m')}</Text>
          <View style={styles.donutChartContainer}>
            <View style={styles.donutChart}>{renderDonutChart(hrZonesData)}</View>
            <View style={styles.zonesLegend}>
              {hrZonesData.map((zone, index) => (
                <View key={index} style={styles.legendRow}>
                  <View style={[styles.legendColorDot, {backgroundColor: zone.color}]} />
                  <Text style={styles.legendZoneName}>{zone.name}</Text>
                  <Text style={styles.legendZoneValue}>
                    {zone.time} {t('common.min')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={styles.chartDescription}>
            {t('heartAnalysis.zonesBased')}
            {userProfile?.max_hr || (userProfile?.age ? 220 - userProfile.age : 180)} {t('common.bpm')}
          </Text>
        </View>
      )}
    </MetricAnalysisSection>
  );
};

const styles = makeStyles(theme => ({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartBlock: {
    marginBottom: 24,
    zIndex: 1000,
  },
  zonesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.chart.legendTextOnDark,
    marginBottom: 4,
    marginTop: 32,
    textTransform: 'uppercase',
  },
  periodLabel: {
    fontSize: 12,
    color: theme.colors.analysis.noData,
    marginBottom: 12,
  },
  donutChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    gap: 24,
  },
  donutChart: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonesLegend: {
    flex: 1,
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendZoneName: {
    fontSize: 10,
    color: theme.colors.chart.legendTextOnDark,
    flex: 1,
  },
  legendZoneValue: {
    fontSize: 12,
    color: theme.colors.analysis.noData,
    fontWeight: '600',
  },
  chartDescription: {
    fontSize: 11,
    color: theme.colors.chart.caption,
    marginTop: 8,
    textAlign: 'center',
  },
}));
