import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const HeartRateZonesChart = ({ activities }) => {
  const [zoneData, setZoneData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxHR, setMaxHR] = useState(185);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  // Периоды для выбора
  const PERIODS = [
    { value: 'all', label: 'Все время' },
    { value: '4w', label: '4 недели' },
    { value: '8w', label: '8 недель' },
    { value: '12w', label: '12 недель' },
    { value: '6m', label: '6 месяцев' }
  ];

  // Красивые цвета для зон
  const COLORS = [
    '#10B981', // Зелено-бирюзовый для восстановления
    '#3B82F6', // Синий для аэробной базы
    '#F59E0B', // Оранжевый для темпа
    '#EF4444', // Красный для пороговой
    '#8B5CF6'  // Фиолетовый для максимальной
  ];

  // Определение пульсовых зон
  const ZONES = [
    { name: 'Зона 1 (Восстановление)', min: maxHR * 0.5, max: maxHR * 0.6, color: COLORS[0] },
    { name: 'Зона 2 (Аэробная база)', min: maxHR * 0.6, max: maxHR * 0.7, color: COLORS[1] },
    { name: 'Зона 3 (Темп)', min: maxHR * 0.7, max: maxHR * 0.8, color: COLORS[2] },
    { name: 'Зона 4 (Пороговая)', min: maxHR * 0.8, max: maxHR * 0.9, color: COLORS[3] },
    { name: 'Зона 5 (Максимальная)', min: maxHR * 0.9, max: maxHR, color: COLORS[4] }
  ];

  // Функция для фильтрации данных по периоду
  const filterActivitiesByPeriod = (activities, period) => {
    if (period === 'all') return activities;
    
    const now = new Date();
    let cutoffDate;
    
    switch (period) {
      case '4w':
        cutoffDate = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000);
        break;
      case '8w':
        cutoffDate = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
        break;
      case '12w':
        cutoffDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
        break;
      case '6m':
        cutoffDate = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return activities;
    }
    
    return activities.filter(activity => 
      activity.start_date && new Date(activity.start_date) >= cutoffDate
    );
  };

  useEffect(() => {
    if (!activities || activities.length === 0) {
      setLoading(false);
      return;
    }

    // Фильтруем данные по выбранному периоду
    const filteredActivities = filterActivitiesByPeriod(activities, selectedPeriod);

    // Подсчет времени в каждой зоне
    const zoneCounts = ZONES.map(zone => ({
      name: zone.name,
      value: 0,
      color: zone.color,
      time: 0
    }));

    filteredActivities.forEach(activity => {
      if (activity.has_heartrate && activity.average_heartrate) {
        const avgHR = activity.average_heartrate;
        const movingTime = activity.moving_time || 0; // время в секундах

        // Определяем зону по среднему пульсу
        for (let i = 0; i < ZONES.length; i++) {
          if (avgHR >= ZONES[i].min && avgHR < ZONES[i].max) {
            zoneCounts[i].value += 1;
            zoneCounts[i].time += movingTime;
            break;
          }
        }
      }
    });

    // Фильтруем зоны с данными и конвертируем время в минуты
    const filteredData = zoneCounts
      .filter(zone => zone.value > 0)
      .map(zone => ({
        ...zone,
        time: Math.round(zone.time / 60), // конвертируем в минуты
        label: `${zone.name} (${zone.time} мин)`
      }));

    setZoneData(filteredData);
    setLoading(false);
  }, [activities, selectedPeriod, maxHR]);

  if (loading) {
    return <div className="heart-rate-chart-loading">Загрузка данных о пульсе...</div>;
  }

  if (zoneData.length === 0) {
    return <div className="heart-rate-chart-empty">Нет данных о пульсе для анализа</div>;
  }

  // Получаем название выбранного периода
  const getPeriodLabel = () => {
    const period = PERIODS.find(p => p.value === selectedPeriod);
    return period ? period.label : 'Все время';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="heart-rate-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-value">Тренировок: {data.value}</p>
          <p className="tooltip-value">Время: {data.time} мин</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="heart-rate-zones-chart">
      <div className="chart-header">
        <div>
          <h3>Распределение нагрузки по пульсовым зонам</h3>
          <div className="period-info">Период: {getPeriodLabel()}</div>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="settings-btn"
          title="Настройки"
        >
          Настройки
        </button>
      </div>
      
      {showSettings && (
        <div className="chart-settings">
          <div className="setting-item">
            <label>Период:</label>
            <select 
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{ width: '120px' }}
            >
              {PERIODS.map(period => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
          <div className="setting-item">
            <label>Максимальный пульс:</label>
            <input 
              type="number" 
              value={maxHR}
              onChange={(e) => setMaxHR(parseInt(e.target.value) || 185)}
              min="150"
              max="220"
              style={{ width: '80px' }}
            />
            <span>уд/мин</span>
          </div>
          <div className="zones-preview">
            {ZONES.map((zone, index) => (
              <div key={index} className="zone-preview" style={{ borderLeftColor: zone.color }}>
                <span className="zone-name">{zone.name}</span>
                <span className="zone-range">{Math.round(zone.min)}-{Math.round(zone.max)} уд/мин</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={zoneData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, time, value }) => `${value} тр.`}
              outerRadius={120}
              innerRadius={60}
              fill="#8884d8"
              dataKey="time"
              paddingAngle={2}
              cornerRadius={8}
            >
              {zoneData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip 
              content={<CustomTooltip />}
              cursor={false}
            />
            <Legend 
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{
                paddingTop: '20px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className="zones-summary">
        <h4>Сводка по зонам:</h4>
        <div className="zones-grid">
          {zoneData.map((zone, index) => (
            <div key={index} className="zone-item" style={{ borderLeftColor: zone.color }}>
              <div className="zone-name">{zone.name}</div>
              <div className="zone-stats">
                <span>{zone.value} тренировок</span>
                <span>{zone.time} мин</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeartRateZonesChart; 