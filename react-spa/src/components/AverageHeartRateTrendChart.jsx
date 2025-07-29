import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// activities: массив объектов с полями start_date, average_heartrate
export default function AverageHeartRateTrendChart({ activities }) {
  const [showTip, setShowTip] = useState(false);
  

  // Группировка по неделям/месяцам
  const data = useMemo(() => {
    if (!activities || !activities.length) return [];
    // Фильтруем только заезды
    const rides = activities.filter(activity => activity.type === 'Ride');
    if (!rides.length) return [];
    // Группируем по неделям (ISO week)
    const weekMap = {};
    rides.forEach(a => {
      if (!a.start_date || !a.average_heartrate) return;
      const d = new Date(a.start_date);
      // ISO week string: YYYY-WW
      const year = d.getFullYear();
      const week = getISOWeekNumber(d);
      const key = `${year}-W${week}`;
      if (!weekMap[key]) weekMap[key] = { sum: 0, count: 0, week, year };
      weekMap[key].sum += a.average_heartrate;
      weekMap[key].count += 1;
    });
    // Преобразуем в массив для графика
    return Object.entries(weekMap)
      .map(([key, val]) => ({
        week: key,
        avgHR: +(val.sum / val.count).toFixed(1),
        year: val.year,
        weekNum: val.week
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.weekNum - b.weekNum;
      });
  }, [activities]);

  // ISO week number helper
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
        <h2 style={{ color: '#f6f8ff', marginBottom: 16 }}>Average Heart Rate Trend (Weekly)</h2>
       
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
              Shows the average heart rate for each week.<br/>Helps track endurance and adaptation over time.
            </div>
          )}
        </div>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF5E00" stopOpacity={0.32}/>
                <stop offset="100%" stopColor="#FF5E00" stopOpacity={0.01}/>
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
              dataKey="avgHR"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Avg HR', angle: -90, position: 'insideLeft', fill: '#b0b8c9', fontSize: 14 }}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
              labelFormatter={v => `Week: ${v}`}
              labelStyle={{ color: '#f6f8ff' }}
              itemStyle={{ color: '#f6f8ff' }}
              cursor={{ fill: 'rgb(20,20,27,0.3)' }}
            />
            <Area
              type="monotone"
              dataKey="avgHR"
              stroke="#FF5E00"
              fill="url(#hrGradient)"
              fillOpacity={0.4}
              strokeWidth={3}
              dot={false}
              isAnimationActive={true}
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Not enough data to show heart rate trend</div>
      )}
    </div>
  );
} 