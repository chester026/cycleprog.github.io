import React, { useMemo, useState } from 'react';
import { useRideSeries, filterRides } from './charts/series';
import TrendChart from './charts/TrendChart';
import { CHART_COLORS } from './charts/chartTheme';
import './CadenceStandardsAnalysis.css';
import './HeartRateVsSpeedChart.css';

// activities: массив объектов с полями start_date, average_heartrate, average_speed
// Thin config on top of TrendChart + useRideSeries (T-6.3, audit W-32) - same
// props/visuals as before, no local recharts markup.
export default function HeartRateVsSpeedChart({ activities, trend }) {
  const [showTip, setShowTip] = useState(false);

  const stats = useMemo(() => {
    const rides = filterRides(activities);
    const hrData = rides.filter((a) => a.average_heartrate).map((a) => a.average_heartrate);
    if (!hrData.length) return null;
    return {
      avg: Math.round(hrData.reduce((sum, hr) => sum + hr, 0) / hrData.length),
      min: Math.min(...hrData),
      max: Math.max(...hrData),
      total: hrData.length,
    };
  }, [activities]);

  // `useRideSeries` is a plain pure function (not a real hook), called
  // directly rather than through `useMemo` so eslint's hook-naming
  // convention check doesn't flag it as a hook called inside a callback.
  const data = useRideSeries(activities, {
    metric: 'average_heartrate',
    metric2: 'average_speed',
    metric2ToKmh: true,
    mode: 'recent',
    limit: 20,
  });

  return (
    <div className="heart-rate-vs-speed-chart gpx-elevation-block">
      {stats && (
        <div className="cadence-stats-grid">
          <div className="cadence-stat-item">
            <div className="cadence-stat-value">
              {stats.avg}
              {trend !== undefined && trend !== null && trend !== 0 && (
                <span className={`cadence-stat-trend ${trend > 0 ? 'positive' : 'negative'}`}>
                  {trend > 0 ? '+' : ''}
                  {trend}
                </span>
              )}
            </div>
            <div className="cadence-stat-label">Average Heart Rate (bpm)</div>
          </div>
          <div className="cadence-stat-item">
            <div className="cadence-stat-value min">{stats.min}</div>
            <div className="cadence-stat-label">Min Heart Rate (bpm)</div>
          </div>
          <div className="cadence-stat-item">
            <div className="cadence-stat-value max">{stats.max}</div>
            <div className="cadence-stat-label">Max Heart Rate (bpm)</div>
          </div>
          <div className="cadence-stat-item">
            <div className="cadence-stat-value total">{stats.total}</div>
            <div className="cadence-stat-label">Total Workouts</div>
          </div>
        </div>
      )}

      <div className="heart-rate-vs-speed-header">
        <h2 className="heart-rate-vs-speed-title">Avg Heart Rate vs Avg Speed</h2>
        <div style={{ position: 'relative' }}>
          <span
            className="heart-rate-vs-speed-info-btn"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
          >
            ?
          </span>
          {showTip && (
            <div className="heart-rate-vs-speed-tooltip">
              Compares average heart rate and average speed for recent workouts.
            </div>
          )}
        </div>
      </div>

      {data.length > 0 ? (
        <TrendChart
          data={data}
          xLabel="Date"
          labelPrefix="Date"
          series={[
            { dataKey: 'y', name: 'Avg HR', color: CHART_COLORS.heartRate, kind: 'area', yAxisId: 'left', axisLabel: 'Avg HR' },
            { dataKey: 'y2', name: 'Avg Speed (km/h)', color: CHART_COLORS.speed, kind: 'line', yAxisId: 'right', axisLabel: 'Avg Speed (km/h)' },
          ]}
        />
      ) : (
        <div className="heart-rate-vs-speed-no-data">Not enough data to show heart rate vs speed</div>
      )}
    </div>
  );
}
