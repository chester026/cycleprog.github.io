import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { apiFetch } from '../utils/api';
import ChartErrorBoundary from './ChartErrorBoundary';

const COLORS = [
  '#10B981', // Зелено-бирюзовый для восстановления
  '#3B82F6', // Синий для аэробной базы
  '#FF5E00', // Оранжевый для темпа
  '#EF4444', // Красный для пороговой
  '#8B5CF6'  // Фиолетовый для максимальной
];

const HeartRateZonesChart = ({ activities }) => {
  const [zoneData, setZoneData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxHR, setMaxHR] = useState(180);
  const [showTip, setShowTip] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [activeIndex, setActiveIndex] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  const PERIODS = [
    { value: 'all', label: 'All time' },
    { value: '4w', label: '4 weeks' },
    { value: '8w', label: '8 weeks' },
    { value: '12w', label: '12 weeks' },
    { value: '6m', label: '6 months' }
  ];

  const ZONES = [
    { name: 'Zone 1 (Recovery)', min: maxHR * 0.5, max: maxHR * 0.6, color: COLORS[0] },
    { name: 'Zone 2 (Aerobic)', min: maxHR * 0.6, max: maxHR * 0.7, color: COLORS[1] },
    { name: 'Zone 3 (Tempo)', min: maxHR * 0.7, max: maxHR * 0.8, color: COLORS[2] },
    { name: 'Zone 4 (Threshold)', min: maxHR * 0.8, max: maxHR * 0.9, color: COLORS[3] },
    { name: 'Zone 5 (Max)', min: maxHR * 0.9, max: maxHR, color: COLORS[4] }
  ];

  const filterActivitiesByPeriod = (activities, period) => {
    if (period === 'all') return activities;
    const now = new Date();
    let cutoffDate;
    switch (period) {
      case '4w': cutoffDate = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000); break;
      case '8w': cutoffDate = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000); break;
      case '12w': cutoffDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000); break;
      case '6m': cutoffDate = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000); break;
      default: return activities;
    }
    return activities.filter(activity => activity.start_date && new Date(activity.start_date) >= cutoffDate);
  };

  const getPeriodLabel = () => {
    const period = PERIODS.find(p => p.value === selectedPeriod);
    return period ? period.label : 'All time';
  };

  // Загружаем профиль пользователя и рассчитываем Max HR
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
        
        // Рассчитываем Max HR на основе возраста (220 - возраст)
        if (profile.age) {
          const calculatedMaxHR = 220 - profile.age;
          setMaxHR(calculatedMaxHR);
        }
      } catch (error) {
        console.error('Error loading user profile for HR zones:', error);
      }
    };
    
    loadUserProfile();
  }, []);

  // Функция для расчета Max HR на основе возраста
  const calculateMaxHR = (age) => {
    return 220 - age;
  };

  useEffect(() => {
    if (!activities || activities.length === 0) {
      setZoneData([]);
      setLoading(false);
      return;
    }
    // Фильтруем только заезды
    const rides = activities.filter(activity => activity.type === 'Ride');
    if (!rides.length) {
      setZoneData([]);
      setLoading(false);
      return;
    }
    const filteredActivities = filterActivitiesByPeriod(rides, selectedPeriod);
    const zoneCounts = ZONES.map(zone => ({
      name: zone.name,
      color: zone.color,
      time: 0
    }));
    filteredActivities.forEach(activity => {
      if (activity.has_heartrate && activity.average_heartrate) {
        const avgHR = activity.average_heartrate;
        const movingTime = activity.moving_time || 0; // сек
        for (let i = 0; i < ZONES.length; i++) {
          if (avgHR >= ZONES[i].min && avgHR < ZONES[i].max) {
            zoneCounts[i].time += movingTime;
            break;
          }
        }
      }
    });
    // Переводим в минуты и фильтруем только зоны с временем
    setZoneData(zoneCounts.map(z => ({ ...z, time: +(z.time / 60).toFixed(1) })).filter(z => z.time > 0));
    setLoading(false);
  }, [activities, selectedPeriod, maxHR]);

  return (
    <div className="gpx-elevation-block" style={{ marginTop: 32, marginBottom: 32, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent:'space-between' }}>
          <h2 style={{ color: '#f6f8ff', margin: 0}}>Load distribution by Heart Rate Zones</h2>
          <div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="settings-btn"
            title="Настройки"
            style={{ marginLeft: 12 }}
          >
            Settings
          </button>
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
              boxShadow: '0 1px 4px #0002',
              marginLeft: 8
            }}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
          >
            ?
          </span>
          {showTip && (
            <div style={{
              position: 'absolute',
              top: 80,
              right: 80,
              background: '#23272f',
              color: '#f6f8ff',
              border: '1.5px solid #7eaaff',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              zIndex: 10,
              width: 280,
              boxShadow: '0 2px 12px #0005',
              whiteSpace: 'normal'
            }}>
              Shows how your training time is distributed across heart rate zones.<br/><br/>
              Max HR is automatically calculated from your age (220 - age).<br/>
              Use the settings to change period and adjust Max HR if needed.
            </div>
          )}
         
          </div>
        </div>
     
      <div style={{ marginBottom: 16 }}>
        <br />
        <label htmlFor="hrz-period-select" style={{ color: '#b0b8c9', fontSize: 14, marginRight: 8 }}>Period:</label>
        
        <select
          id="hrz-period-select"
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          style={{ padding: '0.3em 0.7em', fontSize: '1em', border: '1px solid #444', background: '#23272f', color: '#fff' }}
        >
          {PERIODS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
     
      {showSettings && (
        <div className="chart-settings">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label htmlFor="maxHR-input" style={{ color: '#b0b8c9', fontSize: 14, marginRight: 8 }}>
              Max HR:
              {userProfile?.age && maxHR === calculateMaxHR(userProfile.age) && (
                <span style={{ color: '#10b981', fontSize: '0.8em', marginLeft: '4px' }}>✓ from profile</span>
              )}
            </label>
            {userProfile?.age && (
              <button
                onClick={() => setMaxHR(calculateMaxHR(userProfile.age))}
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  background: '#10b981',
                  border: '1px solid #059669',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title="Sync with profile age"
              >
                Sync
              </button>
            )}
          </div>
          <input
            type="number"
            id="maxHR-input"
            value={maxHR}
            onChange={e => setMaxHR(Number(e.target.value))}
            style={{ padding: '0.3em 0.7em', fontSize: '1em', borderRadius: 6, border: '1px solid #444', background: '#23272f', color: '#fff' }}
          />
          {userProfile?.age && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Calculated from age {userProfile.age}: {calculateMaxHR(userProfile.age)} bpm
            </div>
          )}
        </div>
      )}
      {loading ? (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Loading...</div>
      ) : zoneData.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <ChartErrorBoundary data={zoneData}>
            <PieChart width={380} height={380}>
              <defs>
                {zoneData.map((entry, index) => (
                  <filter key={index} id={`glow${index}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={entry.color} floodOpacity="0.7"/>
                  </filter>
                ))}
              </defs>
              <Pie
                data={zoneData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, time }) => ''}
                outerRadius={140}
                innerRadius={80}
                fill="#8884d8"
                dataKey="time"
                paddingAngle={2}
                cornerRadius={8}
                onMouseLeave={() => setActiveIndex(null)}
                onMouseEnter={(_, idx) => setActiveIndex(idx)}
              >
                {zoneData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={activeIndex === index ? entry.color : entry.color + '4D'}
                    stroke={entry.color}
                    strokeWidth={3}
                    strokeOpacity={1}
                    filter={activeIndex === index ? `url(#glow${index})` : undefined}
                    cursor="pointer"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
                formatter={(v) => [v, 'Minutes']}
                labelStyle={{ color: '#f6f8ff' }}
                itemStyle={{ color: '#f6f8ff' }}
                cursor={false}
              />
            </PieChart>
            </ChartErrorBoundary>
          <div style={{ minWidth: 140, marginLeft: 12 }}>
            {zoneData.map(zone => (
              <div key={zone.name} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: zone.color,
                  marginRight: 10
                }} />
                <span style={{ color: '#f6f8ff', fontSize: 14, minWidth: 80 }}>{zone.name}</span>
                <span style={{ color: '#b0b8c9', fontSize: 14, marginLeft: 'auto' }}>{zone.time} min</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Not enough data for heart rate zones</div>
      )}
    </div>
  );
};

export default HeartRateZonesChart; 