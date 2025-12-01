import React, { useMemo, useState } from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import './CadenceStandardsAnalysis.css';
import './HeartRateVsSpeedChart.css';

// activities: массив объектов с полями start_date, average_heartrate, average_speed
export default function HeartRateVsSpeedChart({ activities }) {
  const [showTip, setShowTip] = useState(false);
  
  // Функция для анализа статистики пульса
  const getHeartRateStats = (activities) => {
    if (!activities || !activities.length) return null;
    
    // Фильтруем только велосипедные активности
    const rides = activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
    if (!rides.length) return null;
    
    const hrData = rides
      .filter(a => a.average_heartrate)
      .map(a => a.average_heartrate);
    
    if (hrData.length === 0) return null;
    
    return {
      avg: Math.round(hrData.reduce((sum, hr) => sum + hr, 0) / hrData.length),
      min: Math.min(...hrData),
      max: Math.max(...hrData),
      total: hrData.length
    };
  };
  // Готовим данные для графика (последние 20 тренировок)
  const data = useMemo(() => {
    if (!activities || !activities.length) return [];
    // Фильтруем только велосипедные активности
    const rides = activities.filter(activity => ['Ride', 'VirtualRide'].includes(activity.type));
    if (!rides.length) return [];
    // Сортируем по дате (от новых к старым)
    const sorted = rides.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    // Берём последние 20
    return sorted.slice(0, 20).reverse().map(a => ({
      date: formatDate(a.start_date),
      avgHR: a.average_heartrate || null,
      avgSpeed: a.average_speed ? +(a.average_speed * 3.6).toFixed(1) : null // в км/ч
    })).filter(a => a.avgHR && a.avgSpeed);
  }, [activities]);

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="heart-rate-vs-speed-chart gpx-elevation-block">
         {/* Статистика пульса */}
         {getHeartRateStats(activities) && (
        <div className="cadence-stats-grid">
          <div className="cadence-stat-item">
            <div className="cadence-stat-value">
              {getHeartRateStats(activities).avg}
            </div>
            <div className="cadence-stat-label">Average Heart Rate (bpm)</div>
          </div>
          <div className="cadence-stat-item">
            <div className="cadence-stat-value min">
              {getHeartRateStats(activities).min}
            </div>
            <div className="cadence-stat-label">Min Heart Rate (bpm)</div>
          </div>
          <div className="cadence-stat-item">
            <div className="cadence-stat-value max">
              {getHeartRateStats(activities).max}
            </div>
            <div className="cadence-stat-label">Max Heart Rate (bpm)</div>
          </div>
          <div className="cadence-stat-item">
            <div className="cadence-stat-value total">
              {getHeartRateStats(activities).total}
            </div>
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
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="hrSpeedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF5E00" stopOpacity={0.32}/>
                <stop offset="100%" stopColor="#FF5E00" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Date', position: 'insideBottomRight', offset: -5, fill: '#b0b8c9', fontSize: 14 }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Avg HR', angle: -90, position: 'insideLeft', fill: '#b0b8c9', fontSize: 14 }}
              width={60}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'Avg Speed (km/h)', angle: 90, position: 'insideRight', fill: '#b0b8c9', fontSize: 14 }}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
              labelFormatter={v => `Date: ${v}`}
              labelStyle={{ color: '#f6f8ff' }}
              itemStyle={{ color: '#f6f8ff' }}
              cursor={{ fill: 'rgb(20,20,27,0.3)' }}
            />
            <Legend wrapperStyle={{ color: '#b0b8c9', fontSize: 13 }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="avgHR"
              stroke="#FF5E00"
              fill="url(#hrSpeedGradient)"
              fillOpacity={0.4}
              strokeWidth={3}
              dot={false}
              isAnimationActive={true}
              animationDuration={1200}
              name="Avg HR"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="avgSpeed"
              stroke="#00B2FF"
              strokeWidth={2}
              dot={false}
              isAnimationActive={true}
              animationDuration={1200}
              name="Avg Speed (km/h)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="heart-rate-vs-speed-no-data">Not enough data to show heart rate vs speed</div>
      )}
    </div>
  );
} 