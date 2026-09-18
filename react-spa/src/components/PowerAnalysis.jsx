import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, YAxis, Tooltip } from 'recharts';
import { usePowerSettings } from '../hooks/usePowerSettings';
import './PowerAnalysis.css';

// T-3.5 (docs/audit/00-AUDIT-AND-PLAN.md T-3.5, docs/audit/layers/04-cross-
// layer.md §4.5, docs/audit/layers/03-react-spa.md W-26): this component no
// longer computes power itself. The physics estimate (rider/bike weight,
// Crr, wind) now lives once, server-side, in
// `@bikelab/shared/calc/power.ts` + `server/services/power.js`, and is
// attached to every activity as `activity.estimated_power` (`GET
// /api/activities`). This removed:
//  - the up-to-50-activity sequential loop with a wind fetch per ride
//    (W-26/W-32) and its 3s-per-activity timeout race;
//  - the `powerAnalysisCache`/`powerAnalysis_riderWeight`/
//    `powerAnalysis_bikeWeight`/`powerAnalysis_surfaceType` localStorage
//    keys and the rider/bike weight + surface + "include wind" settings
//    panel (nothing left client-side for it to configure);
//  - the component's own `GET /api/user-profile` call.
// `summary` is `GET /api/analytics/summary`'s `power` field — when present
// its aggregate numbers are used for the stat cards; the per-activity
// values for the chart/best-list always come straight from `activities`.
const PowerAnalysis = ({ activities, summary, onStatsCalculated, trend }) => {
  // T-6.3: rider/bike weight (context only — the estimate itself is
  // computed server-side) + the best-list sort/selection UI toggles, all
  // via usePowerSettings (TanStack useProfile + local React state, no
  // localStorage) instead of component-local useState for these.
  const { riderWeight, bikeWeight, sortBy, setSortBy, selectedId, setSelectedId } = usePowerSettings();

  const powerData = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    return activities
      .filter(a => a && a.estimated_power && a.estimated_power.avgWatts != null)
      .slice(0, 50)
      .map(a => {
        const speedMs = a.distance && a.moving_time ? a.distance / a.moving_time : 0;
        const grade = a.distance ? ((a.total_elevation_gain || 0) / a.distance) * 100 : 0;
        return {
          id: a.id,
          name: a.name,
          date: new Date(a.start_date).toLocaleDateString('ru-RU', { month: 'numeric', day: 'numeric', year: '2-digit' }),
          total: Math.round(a.estimated_power.avgWatts),
          hasRealPower: a.estimated_power.method === 'measured',
          hasWind: !!a.estimated_power.hasWind,
          speed: (speedMs * 3.6).toFixed(1),
          distance: ((a.distance || 0) / 1000).toFixed(1),
          time: Math.round((a.moving_time || 0) / 60),
          elevation: Math.round(a.total_elevation_gain || 0),
          grade: grade.toFixed(1),
          temperature: a.average_temp,
          maxElevation: a.elev_high,
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [activities]);

  const stats = useMemo(() => {
    // The cards describe "Last 50 activities" — compute from the activities
    // this screen already holds (their persisted server-side estimates).
    // `summary.power` is period-scoped (e.g. 4 weeks) and only a fallback
    // when no activities are available.
    if (summary && powerData.length === 0) {
      if (summary.avg == null) return null;
      return {
        avgPower: summary.avg,
        maxPower: summary.best ?? summary.avg,
        minPower: summary.worst ?? summary.avg,
        totalActivities: summary.totalActivities,
        activitiesWithRealPower: summary.activitiesWithRealPower,
        activitiesWithWindData: summary.activitiesWithWindData,
      };
    }
    if (powerData.length === 0) return null;
    const powers = powerData.map(d => d.total);
    return {
      avgPower: Math.round(powers.reduce((a, b) => a + b, 0) / powers.length),
      maxPower: Math.max(...powers),
      minPower: Math.min(...powers),
      totalActivities: powerData.length,
      activitiesWithRealPower: powerData.filter(d => d.hasRealPower).length,
      activitiesWithWindData: powerData.filter(d => d.hasWind).length,
    };
  }, [summary, powerData]);

  const bestList = useMemo(() => {
    return [...powerData]
      .sort((a, b) => (sortBy === 'date' ? new Date(b.date) - new Date(a.date) : b.total - a.total))
      .slice(0, 30);
  }, [powerData, sortBy]);

  const selectedActivity = useMemo(() => {
    if (selectedId != null) return powerData.find(d => d.id === selectedId) || null;
    return bestList[0] || null;
  }, [selectedId, bestList, powerData]);

  React.useEffect(() => {
    if (onStatsCalculated && stats) {
      onStatsCalculated(stats);
    }
  }, [stats, onStatsCalculated]);

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="power-tooltip">
          <p className="tooltip-title">{data.name}</p>
          <p className="tooltip-date">{data.date}</p>
          <p className="tooltip-power">Power: <strong>{data.total} W</strong></p>
          <p className="tooltip-details">
            Speed: {data.speed} km/h<br />
            Distance: {data.distance} km<br />
            Time: {formatTime(data.time)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (!stats) {
    return null;
  }

  return (
    <div className="power-analysis">
      <div className="power-header">
        <h3 style={{ color: '#f6f8ff', margin: 0 }}></h3>
      </div>

      <div className="power-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">
              {stats.avgPower}
              {trend !== undefined && trend !== null && trend !== 0 && (
                <span className={`stat-trend ${trend > 0 ? 'positive' : 'negative'}`}>
                  {trend > 0 ? '+' : ''}{trend}
                </span>
              )}
            </div>
            <div className="stat-label">Average Power (W)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.maxPower}</div>
            <div className="stat-label">Maximum Power (W)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.minPower}</div>
            <div className="stat-label">Minimum Power (W)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalActivities}</div>
            <div className="stat-label">Activities Analyzed</div>
          </div>
          {stats.activitiesWithRealPower > 0 && (
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
              <div className="stat-value">{stats.activitiesWithRealPower}</div>
              <div className="stat-label">With Power Meter</div>
            </div>
          )}
          {stats.activitiesWithWindData > 0 && (
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #1a4d2e 0%, #0d5c3a 100%)' }}>
              <div className="stat-value">{stats.activitiesWithWindData}</div>
              <div className="stat-label">Wind Adjusted</div>
            </div>
          )}
        </div>
      </div>

      {/* Power Chart */}
      {powerData.length > 0 && (
        <div className="power-chart">
          <div
            style={{
              marginTop: '40px',
              marginBottom: '40px',
              padding: '8px 12px',
              background: '#23272f',
              border: '1px solid #7eaaff',
              fontSize: '14px',
              color: '#b0b8c9',
            }}
          >
            <strong>Note:</strong> These are server-estimated values (real power-meter data where available)
            {riderWeight ? ` using your profile's rider weight (${riderWeight}kg${bikeWeight ? ` + bike ${bikeWeight}kg` : ''})` : ''}. For
            accurate measurements use a power meter.
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={powerData}>
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
              <YAxis
                tick={{ fontSize: 13, fill: '#b0b8c9' }}
                axisLine={{ stroke: '#444' }}
                tickLine={false}
                label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#b0b8c9' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#7eaaff"
                strokeWidth={3}
                fill="url(#powerGradient)"
                fillOpacity={0.4}
                onClick={(data) => {
                  const activity = powerData.find(d => d.id === data.id);
                  if (activity) setSelectedId(activity.id);
                }}
                style={{ cursor: 'pointer' }}
              />
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7eaaff" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#7eaaff" stopOpacity={0.01} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Best Results */}
      <div className="power-best">
        <div className="best-section">
          <div className="best-header">
            <h4>{sortBy === 'power' ? 'Maximum Power Top' : 'Recent Activities'}</h4>
            <div className="sort-buttons">
              <button className={`sort-btn ${sortBy === 'power' ? 'active' : ''}`} onClick={() => setSortBy('power')}>
                Power
              </button>
              <button className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`} onClick={() => setSortBy('date')}>
                Date
              </button>
            </div>
          </div>
          <div className="best-list">
            {bestList.map((activity, index) => (
              <div key={activity.id} className="best-item" onClick={() => setSelectedId(activity.id)} style={{ cursor: 'pointer' }}>
                {sortBy === 'power' && <div className="best-rank">#{index + 1}</div>}
                <div className="best-info">
                  <div className="best-name">{activity.name}</div>
                  <div className="best-details">
                    {activity.date} • {activity.distance} км • {formatTime(activity.time)}
                  </div>
                </div>
                <div className="best-power">{activity.total} W</div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Analysis of Selected Activity */}
        {selectedActivity ? (
          <div className="detailed-analysis">
            <h4>{selectedActivity.name}</h4>
            <div className="analysis-grid">
              <div className="analysis-item">
                <div className="analysis-label">{selectedActivity.hasRealPower ? 'Real Average Power:' : 'Estimated Power:'}</div>
                <div className="analysis-value" style={{ color: selectedActivity.hasRealPower ? '#10b981' : undefined }}>
                  {selectedActivity.total} W
                </div>
              </div>
              <div className="analysis-item">
                <div className="analysis-label">Average Grade:</div>
                <div className="analysis-value">{selectedActivity.grade}%</div>
              </div>
              <div className="analysis-item">
                <div className="analysis-label">Average Speed:</div>
                <div className="analysis-value">{selectedActivity.speed} km/h</div>
              </div>
              {selectedActivity.hasWind && (
                <div className="analysis-item">
                  <div className="analysis-label">Wind:</div>
                  <div className="analysis-value">Adjusted</div>
                </div>
              )}
              {selectedActivity.temperature != null && (
                <div className="analysis-item">
                  <div className="analysis-label">Temperature:</div>
                  <div className="analysis-value">{selectedActivity.temperature}°C</div>
                </div>
              )}
              {selectedActivity.maxElevation != null && (
                <div className="analysis-item">
                  <div className="analysis-label">Max Elevation:</div>
                  <div className="analysis-value">{selectedActivity.maxElevation} m</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="detailed-analysis">
            <div style={{ marginBottom: '16px' }}>
              <h4>Detailed Analysis</h4>
            </div>
            <div style={{ color: '#b0b8c9', textAlign: 'center', padding: '40px' }}>Loading data...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PowerAnalysis;
