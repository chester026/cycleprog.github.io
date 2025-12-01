import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// activities: массив объектов с полями start_date, max_heartrate
export default function MinMaxHeartRateBarChart({ activities }) {
  const [showTip, setShowTip] = useState(false);
  // Группируем по неделям и берём максимальный max_heartrate за неделю
  const data = useMemo(() => {
    if (!activities || !activities.length) return [];
    // Фильтруем только велосипедные активности
    const rides = activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
    if (!rides.length) return [];
    const weekMap = {};
    rides.forEach(a => {
      if (!a.start_date || !a.max_heartrate) return;
      const d = new Date(a.start_date);
      const year = d.getFullYear();
      const week = getISOWeekNumber(d);
      const key = `${year}-W${week}`;
      if (!weekMap[key] || a.max_heartrate > weekMap[key].maxHR) {
        weekMap[key] = { week: key, maxHR: a.max_heartrate };
      }
    });
    return Object.values(weekMap)
      .sort((a, b) => {
        const [ay, aw] = a.week.split('-W').map(Number);
        const [by, bw] = b.week.split('-W').map(Number);
        if (ay !== by) return ay - by;
        return aw - bw;
      });
  }, [activities]);

  function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  return (
    <div className="gpx-elevation-block" style={{ marginTop: 32, marginBottom: 32, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: '#f6f8ff', marginBottom: 16 }}>Max Heart Rate per Week</h2>
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
              Displays the highest heart rate recorded in any workout for each week.
            </div>
          )}
        </div>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF5E00" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#FF5E00" stopOpacity={0.12}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Week', position: 'insideBottomRight', offset: -5, fill: '#b0b8c9', fontSize: 14 }}
            />
            <YAxis
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Max HR', angle: -90, position: 'insideLeft', fill: '#b0b8c9', fontSize: 14 }}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
              formatter={(v) => [v, 'Max HR']}
              labelFormatter={v => `Week: ${v}`}
              labelStyle={{ color: '#f6f8ff' }}
              itemStyle={{ color: '#f6f8ff' }}
              cursor={{ fill: 'rgb(20,20,27,0.3)' }}
            />
            <Bar dataKey="maxHR" fill="url(#barGradient)" name="Max HR" barSize={14} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Not enough data to show max heart rate</div>
      )}
    </div>
  );
} 