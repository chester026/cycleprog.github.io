import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

const ProgressChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="progress-chart-empty">
        Нет данных для отображения
      </div>
    );
  }

  // Подготавливаем данные для графика
  const chartData = data.map((item, index) => ({
    period: `${index + 1}`,
    progress: item.avg,
    details: item.all.join('% / '),
    start: item.start ? new Date(item.start).toLocaleDateString() : '',
    end: item.end ? new Date(item.end).toLocaleDateString() : ''
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="progress-tooltip">
          <p className="tooltip-label">Период {data.period}</p>
          <p className="tooltip-value">Прогресс: <strong>{data.progress}%</strong></p>
          <p className="tooltip-details">{data.details}</p>
          <p className="tooltip-date">{data.start} – {data.end}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="progress-chart">
      <h4>Прогресс по 4-недельным периодам</h4>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300} style={{ height: '300px' }}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="period" 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis 
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
              label={{ value: '% выполнения', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b' } }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="progress"
              stroke="#3b82f6"
              strokeWidth={3}
              fill="url(#progressGradient)"
              fillOpacity={0.3}
            />
            <defs>
              <linearGradient id="progressGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="progress-summary">
        <div className="summary-grid">
          {chartData.map((item, index) => (
            <div key={index} className="summary-item">
              <div className="summary-header">
                <span className="summary-period">Период {item.period}</span>
                <span className="summary-progress">{item.progress}%</span>
              </div>
              <div className="summary-details">{item.details}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProgressChart; 