// Web port of the app's RideAnalytics/StreamsCharts: one card per stream
// the ride recorded (speed, heart rate, cadence, power, elevation) with the
// ride's average in the header and the stream over elapsed time below.
// Elevation shows total gain, not an average — same as the app.
import React from 'react';
import { averageOf } from '@bikelab/shared/calc';
import TrendChart from '../../components/charts/TrendChart';
import { CHART_COLORS } from '../../components/charts/chartTheme';
import { Skeleton } from '../../ui';
import { streamToSeries } from './lib';
import styles from './RideAnalysisModal.module.css';

const CHART_HEIGHT = 180;
const MPS_TO_KMH = 3.6;

function StreamCard({ title, data, timeData, color, unit, excludeZeros = false, headerValueOverride, transform }) {
  const values = transform ? data.map(transform) : data;
  const headerValue = headerValueOverride ?? averageOf(values, excludeZeros).toFixed(0);
  const series = streamToSeries(values, timeData);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>{title}</div>
        <div className={styles.chartValue}>
          {headerValue} <span className={styles.chartUnit}>{unit}</span>
        </div>
      </div>
      <TrendChart
        data={series}
        xLabel=""
        labelPrefix="Time"
        height={CHART_HEIGHT}
        series={[{ dataKey: 'y', name: title, color, axisWidth: 44 }]}
        valueFormatter={(v) => [`${Math.round(v)} ${unit}`, title]}
      />
    </div>
  );
}

export default function StreamsCharts({ streams, isLoading, error, activity }) {
  if (isLoading) {
    return (
      <section className={styles.section} data-testid="streams-loading">
        <Skeleton height={CHART_HEIGHT + 64} radius={12} label="Loading ride streams" />
      </section>
    );
  }
  if (error) {
    return (
      <section className={styles.section}>
        <div className={styles.placeholder}>Could not load ride streams</div>
      </section>
    );
  }
  if (!streams) return null;

  const timeData = streams.time?.data;
  const specs = [
    { key: 'speed', title: 'Speed', data: streams.velocity_smooth?.data, transform: (v) => v * MPS_TO_KMH, color: CHART_COLORS.speed, unit: 'km/h' },
    { key: 'hr', title: 'Heart Rate', data: streams.heartrate?.data, color: CHART_COLORS.heartRate, unit: 'bpm' },
    { key: 'cadence', title: 'Cadence', data: streams.cadence?.data, color: CHART_COLORS.cadence, unit: 'rpm', excludeZeros: true },
    { key: 'power', title: 'Power', data: streams.watts?.data, color: CHART_COLORS.power, unit: 'W' },
    {
      key: 'elevation',
      title: 'Elevation',
      data: streams.altitude?.data,
      color: CHART_COLORS.elevation,
      unit: 'm gain',
      headerValueOverride: `${Math.round(activity.total_elevation_gain ?? 0)}`,
    },
  ].filter((spec) => Array.isArray(spec.data) && spec.data.length > 0);

  if (specs.length === 0) return null;

  return (
    <section className={styles.chartsGrid}>
      {specs.map(({ key, ...spec }) => (
        <StreamCard key={key} timeData={timeData} {...spec} />
      ))}
    </section>
  );
}
