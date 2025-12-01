import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './CadenceStandardsAnalysis.css';

// activities: массив объектов с полями average_cadence, average_speed, total_elevation_gain
export default function CadenceStandardsAnalysis({ activities }) {
  const [showTip, setShowTip] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  
  // Опции периодов
  const periodOptions = [
    { value: '4w', label: '4 weeks' },
    { value: '3m', label: '3 months' },
    { value: '6m', label: '6 months' },
    { value: 'year', label: '1 year' },
    { value: 'all', label: 'All time' }
  ];
  
  // Профессиональные стандарты каденса
  const cadenceStandards = {
    timeTrial: { min: 85, max: 95, label: 'Time Trial', color: '#FF6B6B' },
    roadRacing: { min: 80, max: 90, label: 'Road Racing', color: '#4ECDC4' },
    climbing: { min: 70, max: 85, label: 'Climbing', color: '#45B7D1' },
    sprinting: { min: 95, max: 110, label: 'Sprinting', color: '#96CEB4' },
    endurance: { min: 75, max: 85, label: 'Endurance', color: '#FFEAA7' }
  };

  // Функция для фильтрации данных по периоду
  const filterActivitiesByPeriod = (activities, period) => {
    if (!activities || !activities.length) return [];
    
    const now = new Date();
    let cutoffDate = new Date();
    
    switch (period) {
      case '4w':
        cutoffDate.setDate(now.getDate() - 28);
        break;
      case '3m':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case '6m':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
      default:
        return activities;
    }
    
    return activities.filter(a => new Date(a.start_date) >= cutoffDate);
  };

  // Оценка эффективности
  const getEfficiencyScore = (userCadence, standard) => {
    const standardAvg = (standard.min + standard.max) / 2;
    const deviation = Math.abs(userCadence - standardAvg);
    const range = standard.max - standard.min;
    
    if (deviation <= range * 0.2) return { score: 'Excellent', color: '#4CAF50' };
    if (deviation <= range * 0.4) return { score: 'Good', color: '#8BC34A' };
    if (deviation <= range * 0.6) return { score: 'Average', color: '#FFC107' };
    return { score: 'Needs Improvement', color: '#F44336' };
  };

  // Анализируем данные пользователя
  const userAnalysis = useMemo(() => {
    if (!activities || !activities.length) return null;
    
    // Фильтруем данные по выбранному периоду
    const filteredActivities = filterActivitiesByPeriod(activities, selectedPeriod);
    
    const cadenceData = filteredActivities
      .filter(a => a.average_cadence && (['Ride', 'VirtualRide'].includes(a.sport_type) || ['Ride', 'VirtualRide'].includes(a.type)))
      .map(a => ({
        cadence: a.average_cadence,
        speed: a.average_speed ? +(a.average_speed * 3.6).toFixed(1) : null,
        elevation: a.total_elevation_gain || 0,
        date: a.start_date
      }));

    if (cadenceData.length === 0) return null;

    const avgCadence = cadenceData.reduce((sum, d) => sum + d.cadence, 0) / cadenceData.length;
    const minCadence = Math.min(...cadenceData.map(d => d.cadence));
    const maxCadence = Math.max(...cadenceData.map(d => d.cadence));
    
    // Определяем тип тренировки по скорости и набору высоты
    const categorizeWorkout = (speed, elevation) => {
      if (speed > 35) return 'sprinting';
      if (elevation > 500) return 'climbing';
      if (speed > 28) return 'timeTrial';
      if (speed > 22) return 'roadRacing';
      return 'endurance';
    };

    // Группируем по типам тренировок
    const workoutTypes = {};
    cadenceData.forEach(d => {
      const type = categorizeWorkout(d.speed, d.elevation);
      if (!workoutTypes[type]) workoutTypes[type] = [];
      workoutTypes[type].push(d.cadence);
    });

    // Вычисляем средний каденс по типам
    const typeAverages = Object.entries(workoutTypes).map(([type, cadences]) => ({
      type,
      avgCadence: cadences.reduce((sum, c) => sum + c, 0) / cadences.length,
      count: cadences.length,
      standard: cadenceStandards[type]
    }));

    return {
      overall: { avg: avgCadence, min: minCadence, max: maxCadence },
      byType: typeAverages,
      totalWorkouts: cadenceData.length
    };
  }, [activities, selectedPeriod]);

  // Данные для столбчатых диаграмм
  const barChartData = useMemo(() => {
    if (!userAnalysis) return [];
    
    return userAnalysis.byType.map(item => {
      const userAvg = Math.round(item.avgCadence);
      const standardAvg = Math.round((item.standard.min + item.standard.max) / 2);
      
      return {
        type: item.standard.label,
        data: [
          { 
            name: 'Your Average', 
            yourAvg: userAvg,
            proAvg: standardAvg
          }
        ],
        userAvg,
        standardMin: item.standard.min,
        standardMax: item.standard.max,
        standardAvg,
        standardColor: item.standard.color,
        count: item.count,
        efficiency: getEfficiencyScore(userAvg, item.standard)
      };
    });
  }, [userAnalysis, selectedPeriod]);

  if (!userAnalysis) {
    return (
      <div className="cadence-standards-container">
        <h2 className="cadence-standards-title">Cadence Standards Analysis</h2>
        <div className="cadence-no-data">Not enough cadence data to analyze</div>
      </div>
    );
  }

  return (
    <div className="cadence-standards-container">
      <div className="cadence-standards-header">
        <h2 className="cadence-standards-title">Cadence Standards Analysis</h2>
        <div className="cadence-standards-controls">
          {/* Селектор периода */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="cadence-period-selector"
          >
            {periodOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
                    <div style={{ position: 'relative', marginLeft: 8 }}>
            <span
              className="cadence-help-button"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
            >
              ?
            </span>
            {showTip && (
              <div className="cadence-help-tooltip">
                Compares your cadence with professional cycling standards for different workout types.
              </div>
            )}
          </div>
        </div>
      </div>

     
<br />
      {/* Общая статистика */}
      <div className="cadence-stats-grid">
        <div className="cadence-stat-item">
          <div className="cadence-stat-value">
            {Math.round(userAnalysis.overall.avg)}
          </div>
          <div className="cadence-stat-label">Average Cadence (rpm)</div>
        </div>
        <div className="cadence-stat-item">
          <div className="cadence-stat-value min">
            {Math.round(userAnalysis.overall.min)}
          </div>
          <div className="cadence-stat-label">Min Cadence (rpm)</div>
        </div>
        <div className="cadence-stat-item">
          <div className="cadence-stat-value max">
            {Math.round(userAnalysis.overall.max)}
          </div>
          <div className="cadence-stat-label">Max Cadence (rpm)</div>
        </div>
        <div className="cadence-stat-item">
          <div className="cadence-stat-value total">
            {userAnalysis.totalWorkouts}
          </div>
          <div className="cadence-stat-label">Total Workouts</div>
        </div>
      </div>
      <br />
      <h3 className="cadence-charts-title">Cadence Comparison by Workout Type</h3>
      {/* Столбчатые диаграммы сравнения */}
      {barChartData.length > 0 && (
        <div className="cadence-charts-section">
         
          <div className="cadence-charts-grid">
            {barChartData.map((chart, index) => (
              <div key={index} className="cadence-chart-card" >
                <div className="cadence-chart-header">
                  <h4 className="cadence-chart-title">{chart.type}</h4>
                  <span className={`cadence-efficiency-score ${chart.efficiency.score.toLowerCase().replace(' ', '-')}`}>
                    {chart.efficiency.score}
                  </span>
                </div>
                
                                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chart.data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#353a44" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12, fill: '#b0b8c9' }}
                      axisLine={{ stroke: '#444' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: '#b0b8c9' }}
                      axisLine={{ stroke: '#444' }}
                      tickLine={false}
                      label={{ value: 'Cadence (rpm)', angle: -90, position: 'insideLeft', fill: '#b0b8c9', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 14, color: '#f6f8ff' }}
                      cursor={{ fill: 'rgb(20,20,27,0.3)' }}
                      formatter={(value, name) => [`${value} rpm`, name]}
                    />
                    <Bar dataKey="yourAvg" fill="rgb(139, 92, 246)" name="Your Average" />
                    <Bar dataKey="proAvg" fill="rgb(78, 205, 196)" name="Pro Standard" />
                  </BarChart>
                </ResponsiveContainer>
                
                <div className="cadence-chart-info">
                  <div className="cadence-info-row">
                    Your: <span className="cadence-info-value your">{chart.userAvg} rpm</span>
                  </div>
                  <div className="cadence-info-row">
                    Pro: <span className="cadence-info-value pro">{chart.standardMin}-{chart.standardMax} rpm</span>
                  </div>
                  <div className="cadence-workout-count">
                    {chart.count} workouts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


<br />
      {/* Рекомендации */}
      <div className="cadence-recommendations">
        <h3 className="cadence-recommendations-title">Professional Recommendations</h3>
        <div className="cadence-recommendations-content">
          <p><strong>Optimal Cadence Ranges:</strong></p>
          <ul className="cadence-recommendations-list">
            <li><strong>Endurance rides:</strong> 75-85 rpm - Maintains efficiency over long distances</li>
            <li><strong>Climbing:</strong> 70-85 rpm - Balances power and efficiency on steep gradients</li>
            <li><strong>Time trials:</strong> 85-95 rpm - Maximizes power output for sustained efforts</li>
            <li><strong>Sprinting:</strong> 95-110 rpm - High cadence for maximum power bursts</li>
            <li><strong>Road racing:</strong> 80-90 rpm - Adaptable cadence for varying race conditions</li>
          </ul>
          <p className="cadence-recommendations-tip">
            <strong>Tip:</strong> Focus on maintaining consistent cadence within these ranges rather than chasing specific numbers. 
            Your optimal cadence may vary based on fitness level, terrain, and personal preference.
          </p>
        </div>
      </div>
    </div>
  );
} 