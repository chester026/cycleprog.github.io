import React from 'react';
import { useRideSeries } from './charts/series';
import ChartFrame from './charts/ChartFrame';
import ScatterChart from './charts/ScatterChart';
import { CHART_COLORS } from './charts/chartTheme';

// activities: массив объектов с полями total_elevation_gain, average_heartrate
// Thin config on top of ChartFrame + ScatterChart + useRideSeries (T-6.3,
// audit W-32) - same props/visuals as before. `useRideSeries` is a plain
// pure function (not a real hook), called directly rather than through
// `useMemo` so eslint's hook-naming convention check doesn't flag it.
export default function HeartRateVsElevationChart({ activities }) {
  const data = useRideSeries(activities, {
    metric: 'average_heartrate',
    xMetric: 'total_elevation_gain',
    mode: 'scatter',
    limit: 30,
  });

  return (
    <ChartFrame
      title="Avg Heart Rate vs Elevation Gain"
      help="Shows how average heart rate changes depending on elevation gain per workout."
      hasData={data.length > 0}
      emptyText="Not enough data to show heart rate vs elevation"
    >
      <ScatterChart
        data={data}
        xLabel="Elevation Gain (m)"
        yLabel="Avg HR"
        color={CHART_COLORS.heartRate}
        valueFormatter={(v, name) => [v, name === 'y' ? 'Avg HR' : 'Elevation Gain (m)']}
      />
    </ChartFrame>
  );
}
