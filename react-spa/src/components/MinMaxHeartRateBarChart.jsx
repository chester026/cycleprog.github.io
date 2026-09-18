import React from 'react';
import { useRideSeries } from './charts/series';
import ChartFrame from './charts/ChartFrame';
import BarChart from './charts/BarChart';
import { CHART_COLORS } from './charts/chartTheme';

// activities: массив объектов с полями start_date, max_heartrate
// Thin config on top of ChartFrame + BarChart + useRideSeries (T-6.3, audit
// W-32) - same props/visuals as before. `useRideSeries` is a plain pure
// function (not a real hook), called directly rather than through
// `useMemo` so eslint's hook-naming convention check doesn't flag it.
export default function MinMaxHeartRateBarChart({ activities }) {
  const data = useRideSeries(activities, { metric: 'max_heartrate', mode: 'weekly-max' });

  return (
    <ChartFrame
      title="Max Heart Rate per Week"
      help="Displays the highest heart rate recorded in any workout for each week."
      hasData={data.length > 0}
      emptyText="Not enough data to show max heart rate"
    >
      <BarChart data={data} xLabel="Week" yLabel="Max HR" color={CHART_COLORS.heartRate} tooltipName="Max HR" />
    </ChartFrame>
  );
}
