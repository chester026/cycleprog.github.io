import React from 'react';
import { useRideSeries } from './charts/series';
import ChartFrame from './charts/ChartFrame';
import TrendChart from './charts/TrendChart';
import { CHART_COLORS } from './charts/chartTheme';

// activities: массив объектов с полями start_date, average_cadence
// Thin config on top of ChartFrame + TrendChart + useRideSeries (T-6.3,
// audit W-32) - same props/visuals as before. `useRideSeries` is a plain
// pure function (not a real hook), called directly rather than through
// `useMemo` so eslint's hook-naming convention check doesn't flag it.
export default function AverageCadenceTrendChart({ activities }) {
  const data = useRideSeries(activities, { metric: 'average_cadence', mode: 'weekly-avg' });

  return (
    <ChartFrame
      title="Average Cadence Trend (Weekly)"
      help={
        <>
          Shows the average cadence for each week.
          <br />
          Helps track pedaling technique and efficiency over time.
        </>
      }
      hasData={data.length > 0}
      emptyText="Not enough data to show cadence trend"
    >
      <TrendChart
        data={data}
        xLabel="Week"
        labelPrefix="Week"
        series={[
          { dataKey: 'y', name: 'Average Cadence', color: CHART_COLORS.cadence, kind: 'area', axisLabel: 'Avg Cadence', axisWidth: 80 },
        ]}
        valueFormatter={(value) => [`${value} rpm`, 'Average Cadence']}
      />
    </ChartFrame>
  );
}
