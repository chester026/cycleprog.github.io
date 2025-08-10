import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { apiFetch } from '../utils/api';
import ChartErrorBoundary from './ChartErrorBoundary';
import { calculateHRZonesDistribution, checkStreamsAvailability, loadStreamsForHRZones } from '../utils/heartRateZones';

const COLORS = [
  '#22c55e', // Green - Recovery
  '#84cc16', // Light Green - Endurance  
  '#eab308', // Yellow - Tempo
  '#f97316', // Orange - Threshold
  '#ef4444'  // Red - VO2 Max
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
  const [streamsStats, setStreamsStats] = useState(null);

  const PERIODS = [
    { value: 'all', label: 'All time' },
    { value: '4w', label: '4 weeks' },
    { value: '8w', label: '8 weeks' },
    { value: '12w', label: '12 weeks' },
    { value: '6m', label: '6 months' }
  ];

  // Calculate HR zones based on user profile data
  const calculateUserHRZones = () => {
    if (!userProfile) {
      // Fallback to simple percentage method if no profile
      return [
        { name: 'Zone 1 (Recovery)', min: maxHR * 0.5, max: maxHR * 0.6, color: COLORS[0] },
        { name: 'Zone 2 (Aerobic)', min: maxHR * 0.6, max: maxHR * 0.7, color: COLORS[1] },
        { name: 'Zone 3 (Tempo)', min: maxHR * 0.7, max: maxHR * 0.8, color: COLORS[2] },
        { name: 'Zone 4 (Threshold)', min: maxHR * 0.8, max: maxHR * 0.9, color: COLORS[3] },
        { name: 'Zone 5 (Max)', min: maxHR * 0.9, max: maxHR, color: COLORS[4] }
      ];
    }

    const profileMaxHR = userProfile.max_hr ? parseInt(userProfile.max_hr) : (userProfile.age ? 220 - parseInt(userProfile.age) : maxHR);
    
    let restingHR = userProfile.resting_hr ? parseInt(userProfile.resting_hr) : null;
    if (!restingHR && userProfile.experience_level) {
      switch (userProfile.experience_level) {
        case 'beginner': restingHR = 75; break;
        case 'intermediate': restingHR = 65; break;
        case 'advanced': restingHR = 55; break;
        default: restingHR = 70;
      }
    }
    
    const lactateThreshold = userProfile.lactate_threshold ? parseInt(userProfile.lactate_threshold) : null;
    
    if (!profileMaxHR || !restingHR) {
      // Fallback if insufficient data
      return [
        { name: 'Zone 1 (Recovery)', min: maxHR * 0.5, max: maxHR * 0.6, color: COLORS[0] },
        { name: 'Zone 2 (Aerobic)', min: maxHR * 0.6, max: maxHR * 0.7, color: COLORS[1] },
        { name: 'Zone 3 (Tempo)', min: maxHR * 0.7, max: maxHR * 0.8, color: COLORS[2] },
        { name: 'Zone 4 (Threshold)', min: maxHR * 0.8, max: maxHR * 0.9, color: COLORS[3] },
        { name: 'Zone 5 (Max)', min: maxHR * 0.9, max: maxHR, color: COLORS[4] }
      ];
    }
    
    if (lactateThreshold) {
      // Zone calculation based on lactate threshold HR
      return [
        { name: 'Zone 1 (Recovery)', min: Math.round(lactateThreshold * 0.75), max: Math.round(lactateThreshold * 0.85), color: COLORS[0] },
        { name: 'Zone 2 (Endurance)', min: Math.round(lactateThreshold * 0.85), max: Math.round(lactateThreshold * 0.92), color: COLORS[1] },
        { name: 'Zone 3 (Tempo)', min: Math.round(lactateThreshold * 0.92), max: Math.round(lactateThreshold * 0.97), color: COLORS[2] },
        { name: 'Zone 4 (Threshold)', min: Math.round(lactateThreshold * 0.97), max: Math.round(lactateThreshold * 1.03), color: COLORS[3] },
        { name: 'Zone 5 (VO2 Max)', min: Math.round(lactateThreshold * 1.03), max: profileMaxHR, color: COLORS[4] }
      ];
    } else {
      // Karvonen method
      const hrReserve = profileMaxHR - restingHR;
      return [
        { name: 'Zone 1 (Recovery)', min: Math.round(restingHR + (hrReserve * 0.5)), max: Math.round(restingHR + (hrReserve * 0.6)), color: COLORS[0] },
        { name: 'Zone 2 (Endurance)', min: Math.round(restingHR + (hrReserve * 0.6)), max: Math.round(restingHR + (hrReserve * 0.7)), color: COLORS[1] },
        { name: 'Zone 3 (Tempo)', min: Math.round(restingHR + (hrReserve * 0.7)), max: Math.round(restingHR + (hrReserve * 0.8)), color: COLORS[2] },
        { name: 'Zone 4 (Threshold)', min: Math.round(restingHR + (hrReserve * 0.8)), max: Math.round(restingHR + (hrReserve * 0.9)), color: COLORS[3] },
        { name: 'Zone 5 (VO2 Max)', min: Math.round(restingHR + (hrReserve * 0.9)), max: profileMaxHR, color: COLORS[4] }
      ];
    }
  };

  const ZONES = calculateUserHRZones();

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
      setStreamsStats(null);
      setLoading(false);
      return;
    }
    
    // Фильтруем только заезды
    const rides = activities.filter(activity => activity.type === 'Ride');
    if (!rides.length) {
      setZoneData([]);
      setStreamsStats(null);
      setLoading(false);
      return;
    }
    
    const processZoneData = async () => {
      setLoading(true);
      
      // Recalculate zones based on current user profile
      const currentZones = calculateUserHRZones();
      
      const filteredActivities = filterActivitiesByPeriod(rides, selectedPeriod);
      
      // Проверяем текущую статистику по streams данным
      let stats = checkStreamsAvailability(filteredActivities);
      
      // Если streams данных мало, пытаемся загрузить их
      if (stats.percentage < 50 && stats.total > 0) {
        console.log(`🔄 HR Zones: streams данных мало (${stats.percentage}%), загружаем...`);
        try {
          await loadStreamsForHRZones(filteredActivities, 20); // Загружаем до 20 активностей
          // Пересчитываем статистику после загрузки
          stats = checkStreamsAvailability(filteredActivities);
          console.log(`✅ HR Zones: обновленная статистика streams: ${stats.percentage}%`);
        } catch (error) {
          console.error('Error loading streams for HR zones:', error);
        }
      }
      
      setStreamsStats(stats);
      
      // Используем новую функцию для расчета времени в зонах
      const calculatedZoneData = calculateHRZonesDistribution(filteredActivities, currentZones);
      
      setZoneData(calculatedZoneData);
      setLoading(false);
    };
    
    processZoneData();
  }, [activities, selectedPeriod, maxHR, userProfile]);

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
              <div>
                Shows how your training time is distributed across heart rate zones.<br/><br/>
                <strong>Data Sources:</strong><br/>
                • Detailed streams data (1-second intervals) - most accurate<br/>
                • Average HR fallback for activities without streams<br/><br/>
                <strong>Zone Calculation:</strong><br/>
                • Lactate Threshold method (most accurate)<br/>
                • Karvonen method (if Max/Resting HR available)<br/>
                • Age-based estimation (fallback)<br/><br/>
                {streamsStats && (
                  <div style={{ marginTop: '8px', padding: '6px', background: '#1a1e25', borderRadius: '4px', fontSize: '12px' }}>
                    <strong>Current accuracy:</strong> {streamsStats.withStreams}/{streamsStats.total} activities ({streamsStats.percentage}%) use detailed data
                  </div>
                )}
                <br/>
                Use settings to view current zone calculation details.
              </div>
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
          <div style={{ color: '#b0b8c9', fontSize: 14, marginBottom: '16px' }}>
            <h4 style={{ color: '#f6f8ff', margin: '0 0 8px 0', fontSize: '16px' }}>Heart Rate Zone Settings</h4>
            
            {userProfile ? (
              <div style={{ background: '#1a1e25', padding: '12px', borderRadius: '6px', border: '1px solid #444' }}>
                {userProfile.max_hr && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Max HR:</strong> {userProfile.max_hr} bpm <span style={{ color: '#10b981', fontSize: '12px' }}>✓ from profile</span>
                  </div>
                )}
                {userProfile.resting_hr && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Resting HR:</strong> {userProfile.resting_hr} bpm <span style={{ color: '#10b981', fontSize: '12px' }}>✓ from profile</span>
                  </div>
                )}
                {userProfile.lactate_threshold && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Lactate Threshold:</strong> {userProfile.lactate_threshold} bpm <span style={{ color: '#10b981', fontSize: '12px' }}>✓ from profile</span>
                  </div>
                )}
                {userProfile.age && !userProfile.max_hr && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Max HR (calculated):</strong> {220 - userProfile.age} bpm <span style={{ color: '#eab308', fontSize: '12px' }}>from age {userProfile.age}</span>
                  </div>
                )}
                
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                  <strong>Zone calculation method:</strong> {
                    userProfile.lactate_threshold ? 'Lactate Threshold based' :
                    (userProfile.max_hr && userProfile.resting_hr) ? 'Karvonen method' :
                    'Age-based estimation'
                  }
                </div>
                
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  To update these values, go to your Profile page → Heart Rate Zones section
                </div>
              </div>
            ) : (
              <div style={{ background: '#1a1e25', padding: '12px', borderRadius: '6px', border: '1px solid #444' }}>
                <div style={{ color: '#f97316', marginBottom: '8px' }}>No profile data available</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Using default zones based on estimated max HR of {maxHR} bpm
                </div>
              </div>
            )}
            
            {streamsStats && (
              <div style={{ background: '#1a1e25', padding: '12px', borderRadius: '6px', border: '1px solid #444', marginTop: '12px' }}>
                <h5 style={{ color: '#f6f8ff', margin: '0 0 8px 0', fontSize: '14px' }}>Data Accuracy</h5>
                <div style={{ marginBottom: '8px', fontSize: '14px' }}>
                  <strong>Activities with detailed data:</strong> {streamsStats.withStreams}/{streamsStats.total} ({streamsStats.percentage}%)
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {streamsStats.percentage >= 80 ? (
                    <span style={{ color: '#10b981' }}>✓ Excellent accuracy - most activities use 1-second heart rate data</span>
                  ) : streamsStats.percentage >= 50 ? (
                    <span style={{ color: '#eab308' }}>⚠ Good accuracy - some activities use average HR fallback</span>
                  ) : (
                    <span style={{ color: '#f97316' }}>⚠ Limited accuracy - many activities use average HR fallback</span>
                  )}
                </div>
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                    Detailed data provides second-by-second heart rate analysis for precise zone distribution
                  </div>
                  {streamsStats && streamsStats.percentage < 100 && (
                    <button
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const filteredActivities = filterActivitiesByPeriod(
                            activities.filter(activity => activity.type === 'Ride'), 
                            selectedPeriod
                          );
                          await loadStreamsForHRZones(filteredActivities, 50); // Загружаем больше активностей
                          
                          // Пересчитываем данные
                          const newStats = checkStreamsAvailability(filteredActivities);
                          setStreamsStats(newStats);
                          
                          const currentZones = calculateUserHRZones();
                          const calculatedZoneData = calculateHRZonesDistribution(filteredActivities, currentZones);
                          setZoneData(calculatedZoneData);
                        } catch (error) {
                          console.error('Error manually loading streams:', error);
                        }
                        setLoading(false);
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        background: '#7eaaff',
                        color: '#23272f',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Load More Detailed Data'}
                    </button>
                  )}
                </div>
              )}
          </div>
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