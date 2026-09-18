import React from 'react';
import { useRideSeries } from './charts/series';
import ChartFrame from './charts/ChartFrame';
import TrendChart from './charts/TrendChart';
import { CHART_COLORS } from './charts/chartTheme';

// activities: массив объектов с полями start_date, average_cadence, average_speed
// Thin config on top of ChartFrame + TrendChart + useRideSeries (T-6.3,
// audit W-32) - same props/visuals as before. `useRideSeries` is a plain
// pure function (not a real hook), called directly rather than through
// `useMemo` so eslint's hook-naming convention check doesn't flag it.
export default function CadenceVsSpeedChart({ activities }) {
  const data = useRideSeries(activities, {
    metric: 'average_cadence',
    metric2: 'average_speed',
    metric2ToKmh: true,
    mode: 'recent',
    limit: 20,
  });

  return (
    <ChartFrame
      title="Avg Cadence vs Avg Speed"
      help="Compares average cadence and average speed for recent workouts."
      hasData={data.length > 0}
      emptyText="Not enough data to show cadence vs speed"
    >
      <TrendChart
        data={data}
        xLabel="Date"
        labelPrefix="Date"
        series={[
          { dataKey: 'y', name: 'Avg Cadence', color: CHART_COLORS.cadence, kind: 'area', yAxisId: 'left', axisLabel: 'Avg Cadence', axisWidth: 80 },
          { dataKey: 'y2', name: 'Avg Speed (km/h)', color: CHART_COLORS.speed, kind: 'line', yAxisId: 'right', axisLabel: 'Avg Speed (km/h)' },
        ]}
        valueFormatter={(value, name) => {
          if (name === 'Avg Cadence') return [`${value} rpm`, 'Avg Cadence'];
          if (name === 'Avg Speed (km/h)') return [`${value} km/h`, 'Avg Speed'];
          return [value, name];
        }}
      />
    </ChartFrame>
  );
}
