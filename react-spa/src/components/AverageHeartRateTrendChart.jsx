import React from 'react';
import { useRideSeries } from './charts/series';
import ChartFrame from './charts/ChartFrame';
import TrendChart from './charts/TrendChart';
import { CHART_COLORS } from './charts/chartTheme';

// activities: массив объектов с полями start_date, average_heartrate
// Thin config on top of ChartFrame + TrendChart + useRideSeries (T-6.3,
// audit W-32) - same props/visuals as before. `useRideSeries` is a plain
// pure function (not a real hook - no internal hook calls), called
// directly rather than through `useMemo` so eslint's hook-naming
// convention check doesn't flag it as a hook called inside a callback.
export default function AverageHeartRateTrendChart({ activities }) {
  const data = useRideSeries(activities, { metric: 'average_heartrate', mode: 'weekly-avg' });

  return (
    <ChartFrame
      title="Average Heart Rate Trend (Weekly)"
      help={
        <>
          Shows the average heart rate for each week.
          <br />
          Helps track endurance and adaptation over time.
        </>
      }
      hasData={data.length > 0}
      emptyText="Not enough data to show heart rate trend"
    >
      <TrendChart
        data={data}
        xLabel="Week"
        labelPrefix="Week"
        series={[{ dataKey: 'y', name: 'Avg HR', color: CHART_COLORS.heartRate, kind: 'area', axisLabel: 'Avg HR' }]}
      />
    </ChartFrame>
  );
}
