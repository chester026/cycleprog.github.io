import React, { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import ChartErrorBoundary from './ChartErrorBoundary';

const getCategory = (score) => {
  if (score >= 80) return { label: 'Excellent', color: '#16a34a' };
  if (score >= 65) return { label: 'Good', color: '#3b82f6' };
  if (score >= 50) return { label: 'Steady', color: '#f59e0b' };
  if (score >= 30) return { label: 'Low', color: '#f97316' };
  return { label: 'Off-plan', color: '#ef4444' };
};

const ProgressChart = memo(({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="progress-chart-empty">
        Нет данных для отображения
      </div>
    );
  }

  // Подготавливаем данные для графика
  const chartData = useMemo(() => data.map((item, index) => ({
    period: `${index + 1}`,
    progress: item.avg,
    details: item.all.join('% / '),
    start: item.start ? new Date(item.start).toLocaleDateString('ru-RU') : '',
    end: item.end ? new Date(item.end).toLocaleDateString('ru-RU') : ''
  })), [data]);

  const last = chartData[chartData.length - 1];
  const prev = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const lastScore = last?.progress ?? 0;
  const prevScore = prev?.progress ?? null;
  const delta = prevScore != null ? Math.round((lastScore - prevScore) * 10) / 10 : null;
  const category = getCategory(lastScore);
  const strokeColor = '#3b82f6';

  const CustomTooltip = useMemo(() => ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const cat = getCategory(d.progress);
      return (
        <div className="progress-tooltip">
          <p className="tooltip-label">Block {d.period} • {d.start} – {d.end}</p>
          <p className="tooltip-value">Fitness rate: <strong>{d.progress}%</strong> <span style={{ color: cat.color, marginLeft: 6 }}>({cat.label})</span></p>
          <p className="tooltip-details" style={{ opacity: 0.7 }}>Breakdown: {d.details}%</p>
        </div>
      );
    }
    return null;
  }, []);

  return (
    <div className="progress-chart" style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: '2.5em', width: '100%', flexWrap: 'wrap' }}>
        <div className="chart-container" style={{ flex: '1 1 400px', minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={300} style={{ height: '300px' }}>
            <ChartErrorBoundary data={chartData}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="period" 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={{ stroke: '#cbd5e1' }}
                  label={{ value: 'Blocks', position: 'insideBottom', offset: -4, style: { fill: '#94a3b8', fontSize: 12 } }}
                />
                <YAxis 
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={{ stroke: '#cbd5e1' }}
                  label={{ value: 'Fitness rate (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Guidance lines */}
                <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 4" label={{ value: '70', position: 'right', fill: '#16a34a', fontSize: 11 }} />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '50', position: 'right', fill: '#f59e0b', fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="progress"
                  stroke={strokeColor}
                  strokeWidth={3}
                  fill="url(#progressGradient)"
                  fillOpacity={0.3}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.28}/>
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.08}/>
                  </linearGradient>
                </defs>
              </AreaChart>
            </ChartErrorBoundary>
          </ResponsiveContainer>
          {/* Legend/explainer */}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'flex-end', color: '#64748b', fontSize: 12 }}>
            <span className="col-item"><span>●</span> &nbsp; 70+ Excellent</span>
            <span className="col-item"><span style={{ color: '#f59e0b' }}>●</span> &nbsp; 50–69 Steady/Good</span>
            <span className="col-item"><span style={{ color: '#ef4444' }}>●</span> &nbsp; Below 50 Improve</span>
          </div>
          <br />
        </div>
        {/* Индикатор последнего блока */}
        {chartData.length > 0 && (
          <div style={{
            minWidth: 180,
            maxWidth: 320,
            flex: '0 0 260px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            marginLeft: 'auto',
            marginRight: 0,
            marginTop: '24px',
            marginBottom: 0,
            padding: '0px 6em 0px 3em'

          }}>
            
            <span style={{
              fontSize: '3.8em',
              display: 'flex',
              fontWeight: 800,
              color: '#000',
              letterSpacing: '-2px',
              lineHeight: 1.1,
              marginBottom: '16px'
            }}>
              {lastScore} <span style={{fontSize: '32px', opacity: 1}}>fr</span> 
             
             
               {delta != null && (
                <span style={{ fontSize: '18px', letterSpacing: '0.5px', position: 'relative', top: '10px', left: '10px',  color: delta >= 0 ? '#16a34a' : '#ef4444' }}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                </span>
              )}
               
             
         
              
            </span>
           
            <span style={{fontSize: '14px', fontWeight: 600, letterSpacing: '0.1px', opacity: 1}}>Fitness rate   
              <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  color: category.color,
                  background: '#f8fafc',
                  border: `1px solid ${category.color}33`,
                  padding: '2px 8px',
                  marginBottom: '24px',
                  marginLeft: '8px'
                }}>{category.label}</span></span>
            <div style={{ opacity: 0.5, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
              Rate shows % completion per block. Higher is better; 70%+ indicates consistent adherence.
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ProgressChart; 