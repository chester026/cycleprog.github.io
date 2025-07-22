import React, { useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// activities: массив объектов с полями total_elevation_gain, average_heartrate
export default function HeartRateVsElevationChart({ activities }) {
  const [showTip, setShowTip] = useState(false);
  // Готовим данные для графика (последние 30 тренировок)
  const data = useMemo(() => {
    if (!activities || !activities.length) return [];
    // Сортируем по дате (от новых к старым)
    const sorted = activities.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    // Берём последние 30
    return sorted.slice(0, 30).map(a => ({
      elev: a.total_elevation_gain || 0,
      avgHR: a.average_heartrate || null,
      date: formatDate(a.start_date)
    })).filter(a => a.avgHR && a.elev > 0);
  }, [activities]);

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="gpx-elevation-block" style={{ marginTop: 32, marginBottom: 32, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: '#f6f8ff', marginBottom: 16 }}>Avg Heart Rate vs Elevation Gain</h2>
        <div style={{ position: 'relative', marginLeft: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#353a44',
              color: '#fff',
              opacity: 0.5,
              fontWeight: 700,
              fontSize: 17,
              textAlign: 'center',
              lineHeight: '22px',
              cursor: 'pointer',
              border: '1.5px solid #444',
              boxShadow: '0 1px 4px #0002'
            }}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
          >
            ?
          </span>
          {showTip && (
            <div style={{
              position: 'absolute',
              top: 28,
              right: 0,
              background: '#23272f',
              color: '#f6f8ff',
              border: '1.5px solid #7eaaff',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              zIndex: 10,
              minWidth: 220,
              boxShadow: '0 2px 12px #0005',
              whiteSpace: 'normal'
            }}>
              Shows how average heart rate changes depending on elevation gain per workout.
            </div>
          )}
        </div>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
            <XAxis
              dataKey="elev"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Elevation Gain (m)', position: 'insideBottomRight', offset: -5, fill: '#b0b8c9', fontSize: 14 }}
              type="number"
            />
            <YAxis
              dataKey="avgHR"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Avg HR', angle: -90, position: 'insideLeft', fill: '#b0b8c9', fontSize: 14 }}
              width={60}
              type="number"
            />
            <Tooltip
              cursor={{ stroke: '#7eaaff', strokeWidth: 1 }}
              contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
              formatter={(v, name) => [v, name === 'avgHR' ? 'Avg HR' : 'Elevation Gain (m)']}
              labelFormatter={(_, p) => `Date: ${p && p.length ? p[0].payload.date : ''}`}
              labelStyle={{ color: '#f6f8ff' }}
              itemStyle={{ color: '#f6f8ff' }}
            />
            <Scatter name="Workout" data={data} fill="#FF5E00" />
          </ScatterChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Not enough data to show heart rate vs elevation</div>
      )}
    </div>
  );
} 