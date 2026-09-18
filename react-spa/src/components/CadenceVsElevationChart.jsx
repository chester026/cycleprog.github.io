import React from 'react';
import { useRideSeries } from './charts/series';
import ChartFrame from './charts/ChartFrame';
import ScatterChart from './charts/ScatterChart';
import { CHART_COLORS } from './charts/chartTheme';

// activities: массив объектов с полями total_elevation_gain, average_cadence
// Thin config on top of ChartFrame + ScatterChart + useRideSeries (T-6.3,
// audit W-32) - same props/visuals as before. `useRideSeries` is a plain
// pure function (not a real hook), called directly rather than through
// `useMemo` so eslint's hook-naming convention check doesn't flag it.
export default function CadenceVsElevationChart({ activities }) {
  const data = useRideSeries(activities, {
    metric: 'average_cadence',
    xMetric: 'total_elevation_gain',
    mode: 'scatter',
    limit: 30,
  });

  return (
    <ChartFrame
      title="Avg Cadence vs Elevation Gain"
      help="Shows how average cadence changes depending on elevation gain per workout."
      hasData={data.length > 0}
      emptyText="Not enough data to show cadence vs elevation"
    >
      <ScatterChart
        data={data}
        xLabel="Elevation Gain (m)"
        yLabel="Avg Cadence"
        yAxisWidth={80}
        color={CHART_COLORS.cadence}
        valueFormatter={(v, name) => (name === 'y' ? [`${v} rpm`, 'Avg Cadence'] : [v, 'Elevation Gain (m)'])}
      />
    </ChartFrame>
  );
}
