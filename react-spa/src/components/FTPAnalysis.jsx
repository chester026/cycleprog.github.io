import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import './FTPAnalysis.css';

export default function FTPAnalysis({ activities, selectedPeriod, userProfile, summary }) {
  const [ftpData, setFtpData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activities.length > 0) {
      calculateFTPData();
    }
  }, [activities, selectedPeriod, userProfile, summary]);

  const calculateFTPData = async () => {
    try {
      setLoading(true);
      
      // Фильтруем активности по периоду
      const filteredActivities = filterActivitiesByPeriod(activities, selectedPeriod);
      
      // Используем threshold из профиля или дефолтное значение
      const hrThreshold = userProfile?.lactate_threshold || 160;
      const durationThreshold = 120; // 2 минуты
      
      // Определяем количество дней для периода
      const periodDays = selectedPeriod === '4w' ? 28 : 
                        selectedPeriod === '3m' ? 92 : 
                        selectedPeriod === 'year' ? 365 : 
                        null; // для 'all' периода
      
      // Загружаем streams данные для расчета FTP
      const { analyzeHighIntensityTime } = await import('../utils/vo2max');
      const result = await analyzeHighIntensityTime(filteredActivities, periodDays, {
        hr_threshold: hrThreshold,
        duration_threshold: durationThreshold
      });
      
      setFtpData({
        minutes: result.totalTimeMin || 0,
        intervals: result.totalIntervals || 0,
        vo2max: summary?.vo2max || null,
        hrThreshold,
        durationThreshold
      });
    } catch (error) {
      console.error('Error calculating FTP data:', error);
      setFtpData({
        minutes: 0,
        intervals: 0,
        vo2max: summary?.vo2max || null,
        hrThreshold: userProfile?.lactate_threshold || 160,
        durationThreshold: 120
      });
    } finally {
      setLoading(false);
    }
  };

  const filterActivitiesByPeriod = (activities, period) => {
    const now = new Date();
    const periodDays = {
      '4w': 28,
      '3m': 92,
      'year': 365,
      'all': null
    };

    const days = periodDays[period];
    if (!days) return activities; // 'all' period

    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return activities.filter(a => {
      const activityDate = new Date(a.start_date);
      return activityDate >= startDate;
    });
  };

  const getFTPLevel = (minutes) => {
    if (minutes < 30) return { level: 'Low', color: '#ef4444', description: 'Increase intensity' };
    if (minutes < 60) return { level: 'Normal', color: '#f59e0b', description: 'Good baseline' };
    if (minutes < 120) return { level: 'Good', color: '#10b981', description: 'Strong fitness' };
    if (minutes < 180) return { level: 'Excellent', color: '#06b6d4', description: 'Very high fitness' };
    return { level: 'Outstanding', color: '#8b5cf6', description: 'Elite level' };
  };

  // VO2max зоны с границами
  const vo2maxZones = [
    { label: 'BEGINNER', min: 10, max: 30, color: '#f97316' },
    { label: 'AMATEUR', min: 30, max: 50, color: '#fbbf24' },
    { label: 'ADVANCED', min: 50, max: 75, color: '#4ade80' },
    { label: 'ELITE', min: 75, max: 85, color: '#06b6d4' },
    { label: 'WORLD CLASS', min: 85, max: 100, color: '#3b82f6' }
  ];

  const getVO2maxZone = (vo2max) => {
    if (!vo2max) return null;
    // Если значение ниже минимума первой зоны, возвращаем первую зону
    if (vo2max < vo2maxZones[0].min) return vo2maxZones[0];
    // Ищем подходящую зону
    return vo2maxZones.find(zone => vo2max >= zone.min && vo2max < zone.max) || vo2maxZones[vo2maxZones.length - 1];
  };

  const getVO2maxPosition = (vo2max) => {
    if (!vo2max) return 0;
    const minValue = 10;
    const maxValue = 100;
    const clampedValue = Math.max(minValue, Math.min(vo2max, maxValue));
    return ((clampedValue - minValue) / (maxValue - minValue)) * 100;
  };

  const periodLabel = selectedPeriod === '4w' ? '4 Weeks' : 
                     selectedPeriod === '3m' ? '3 Months' : 
                     selectedPeriod === 'year' ? 'Year' : 'All Time';

  if (loading) {
    return (
      <div className="ftp-analysis">
        <div className="ftp-header">
          <h3 className="analitycs-heading">VO₂max</h3>
          <span className="ftp-period">{periodLabel}</span>
        </div>
        <div className="ftp-loading">Loading...</div>
      </div>
    );
  }

  if (!ftpData) {
    return null;
  }

  const ftpLevel = getFTPLevel(ftpData.minutes);
  const currentZone = ftpData.vo2max ? getVO2maxZone(ftpData.vo2max) : null;
  const vo2maxPosition = ftpData.vo2max ? getVO2maxPosition(ftpData.vo2max) : 0;

  return (
    <div className="ftp-analysis">
        {/* FTP Intervals блок */}
        <div className="ftp-workouts-block">
          <div className="ftp-stats-row">
          <div className="ftp-criterion">
           
            <b> FTP Workload for 4 weeks</b>
           
            <div>
               Heart rate ≥ {ftpData.hrThreshold} bpm for at least {ftpData.durationThreshold}s consecutively
            </div>
          </div>
            <div className="ftp-stat-item">
              <div className="ftp-stat-value ftp-data-value">{ftpData.minutes}</div>
              <div className="ftp-stat-label ftp-data-label">Minutes at threshold</div>
            </div>
            <div className="ftp-stat-divider"></div>
            <div className="ftp-stat-item">
              <div className="ftp-stat-value ftp-data-value">{ftpData.intervals}</div>
              <div className="ftp-stat-label ftp-data-label">High-intensity intervals</div>
            </div>
        
            <div className="ftp-stat-item">
              <div 
                className="ftp-stat-value"
                style={{ backgroundColor: ftpLevel.color }}
              >
                <div className="ftp-stat-label">FTP Workload: </div> <span style={{ color: '#fff', display: 'inlineBlock', fontWeight: 700 }}>{ftpLevel.level}</span>
              </div>
              
            </div>
          </div>

         
        </div>

      <div className="ftp-header">
        <h3 className="analitycs-heading">VO₂MAX</h3>
        <span className="ftp-period">{periodLabel}</span>
      </div>

      <div className="ftp-content">
        {/* VO2max Analytics блок */}
        {ftpData.vo2max && (
          <div className="vo2max-analytics">
           
        <div className="vo2max-analytics-content">
            {/* Горизонтальная шкала прогресса */}
            <div className="vo2max-scale-container">
              <div className="vo2max-scale">
                {vo2maxZones.map((zone, index) => {
                  const totalRange = 90; // 10-100
                  const width = ((zone.max - zone.min) / totalRange) * 100;
                  return (
                    <div 
                      key={index}
                      className="vo2max-zone"
                      style={{ 
                        width: `${width}%`,
                        backgroundColor: zone.color
                      }}
                    >
                      <div className="vo2max-zone-inner">
                        <div className="vo2max-zone-values">
                          <span className="vo2max-zone-min">{zone.min}</span>
                          {index === vo2maxZones.length - 1 && (
                            <span className="vo2max-zone-max"> &nbsp;- {zone.max}+</span>
                          )}
                        </div>
                        <div className="vo2max-zone-label">{zone.label}</div>
                      </div>
                     
                    </div>
                  );
                })}
                {/* Индикатор текущего значения */}
                <div 
                  className="vo2max-indicator"
                  style={{ left: `${vo2maxPosition}%` }}
                >
                  <div className="vo2max-indicator-line"></div>
                  <div className="vo2max-indicator-value">{ftpData.vo2max} <span style={{fontSize: '0.55em', display: 'block', width: '100%', textAlign: 'center', fontWeight: 500, opacity: 0.5}}>ml/kg/min</span></div>
                </div>
              </div>
            </div>

            {/* Дополнительная информация */}
             {/* Информационные блоки */}
            
              <div className="vo2max-info-item">
                <div className="vo2max-info-title">
                  <b>Highest VO₂max:</b>  97.5 - Oskar Svendsen (Cyclist)   |   78.6 - Joan Benoit (Distance Runner)   |   240  -  Sled-dog Huskies</div>
              </div>
             </div>
           
            <div className="vo2max-facts">
              <div className="vo2max-fact">
                <span className="vo2max-fact-label">About VO₂max:</span>
                <span className="vo2max-fact-value">Your body uses oxygen to burn fuel to produce energy. The more oxygen your body can use, the more energy you can produce</span>
              </div>
              <div className="vo2max-fact">
                <span className="vo2max-fact-label">Physical fitness indicator:</span>
                <span className="vo2max-fact-value">Your Vomax is the single best indicator of physical fitness and cardiovascular health</span>
              </div>
              <div className="vo2max-fact">
                <span className="vo2max-fact-label">The Heart Association:</span>
                <span className="vo2max-fact-value">"The most important overall correlate of health...and the strongest predictor of all cause mortality"</span>
              </div>
             
            </div>
          </div>
        )}

      
        
      </div>
    </div>
  );
}

