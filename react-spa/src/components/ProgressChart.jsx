import React, { memo, useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import ChartErrorBoundary from './ChartErrorBoundary';
import './ProgressChart.css';

const getCategory = (score) => {
  if (score >= 80) return { label: 'Excellent', color: '#16a34a' };
  if (score >= 65) return { label: 'Good', color: '#3b82f6' };
  if (score >= 50) return { label: 'Steady', color: '#f59e0b' };
  if (score >= 30) return { label: 'Low', color: '#f97316' };
  return { label: 'Off-plan', color: '#ef4444' };
};

const ProgressChart = memo(({ data }) => {
  const [showLegend, setShowLegend] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Проверяем размер экрана
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 900);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="progress-chart-empty">
        Нет данных для отображения
      </div>
    );
  }

  // Подготавливаем данные для графика
  const chartData = useMemo(() => {
    const result = data.map((item, index) => {
      const chartItem = {
        period: `${index + 1}`,
        progress: item.avg,
        details: item.all.map(val => `${val}%`).join(' / '),
        start: item.start ? new Date(item.start).toLocaleDateString('ru-RU') : '',
        end: item.end ? new Date(item.end).toLocaleDateString('ru-RU') : ''
      };
      
      // Отладка убрана
      
      return chartItem;
    });
    
    return result;
  }, [data]);

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
      const breakdownValues = d.details.split(' / ');
      const breakdownLabels = ['Flat Speed', 'Hill Speed', 'HR Zones', 'Long Rides', 'Easy Rides'];
      
      return (
        <div className="progress-tooltip">
          <p className="tooltip-label">Block {d.period} • {d.start} – {d.end}</p>
          <p className="tooltip-value">Effort rate: <strong>{d.progress}%</strong> <span style={{ color: cat.color, marginLeft: 6 }}>({cat.label})</span></p>
          <div className="tooltip-breakdown" style={{ fontSize: '11px', opacity: 0.8, marginTop: 8 }}>
            {breakdownValues.map((value, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span>{breakdownLabels[index]}:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  }, []);

  // Мобильная компактная версия
  const renderMobileChart = () => {
    return (
      <div className="progress-chart mobile-compact">
        <div className="mobile-chart-header">
          <div className="mobile-fitness-score">
            <span className="mobile-score-value">{lastScore}</span>
            <span className="mobile-score-unit">efr</span>
            {delta != null && (
              <span className={`mobile-score-delta ${delta >= 0 ? 'positive' : 'negative'}`}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
              </span>
            )}
          </div>
        
        </div>
        
        <div className="mobile-chart-container">
          <ResponsiveContainer width="100%" height={120}>
            <ChartErrorBoundary data={chartData}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <XAxis 
                  dataKey="period" 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="progress"
                  stroke={strokeColor}
                  strokeWidth={2}
                  fill="url(#progressGradient)"
                  fillOpacity={0.2}
                  dot={false}
                  activeDot={false}
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
        </div>
        
        <div className="mobile-chart-info">
          <div className="mobile-chart-info-row">
            <div className="mobile-fitness-label">
               
               <span className="mobile-category" style={{ color: category.color }}>
               Effort rate {category.label}
               </span>
             </div>
              <span className="mobile-current-period">
                Period: {last?.start} – {last?.end}
              </span>
          </div>
          <div className="mobile-description">
            Rate shows % completion per block. Higher is better; 70%+ indicates consistent adherence.
          </div>
        </div>
      </div>
    );
  };

  // Возвращаем мобильную версию для экранов < 900px
  if (isMobile) {
    return renderMobileChart();
  }

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
                  label={{ value: 'Effort rate (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b' } }}
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
          {/* Legend скрыта - теперь в tooltip badge */}
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
              {lastScore} <span style={{fontSize: '32px', opacity: 1}}>efr</span> 
             
             
               {delta != null && (
                <span style={{ fontSize: '18px', letterSpacing: '0.5px', position: 'relative', top: '10px', left: '10px',  color: delta >= 0 ? '#16a34a' : '#ef4444' }}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                </span>
              )}
               
             
         
              
            </span>
           
            <span style={{fontSize: '14px', fontWeight: 600, letterSpacing: '0.1px', opacity: 1}}>Effort rate   
              <span 
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  color: category.color,
                  background: '#f8fafc',
                  border: `1px solid ${category.color}33`,
                  padding: '2px 8px',
                  marginBottom: '24px',
                  marginLeft: '8px',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onMouseEnter={() => setShowLegend(true)}
                onMouseLeave={() => setShowLegend(false)}
                title="" 
                aria-label=""
              >
                {category.label}
                {showLegend && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '8px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    lineHeight: '1.4',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    zIndex: 1000,
                    color: '#374151'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Effort Rate Scale:</div>
                    <div>● 80-100% <span style={{ color: '#16a34a' }}>Excellent</span></div>
                    <div>● 65-79% <span style={{ color: '#3b82f6' }}>Good</span></div>
                    <div>● 50-64% <span style={{ color: '#f59e0b' }}>Steady</span></div>
                    <div>● 30-49% <span style={{ color: '#f97316' }}>Low</span></div>
                    <div>● 0-29% <span style={{ color: '#ef4444' }}>Off-plan</span></div>
                  </div>
                )}
              </span></span>
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