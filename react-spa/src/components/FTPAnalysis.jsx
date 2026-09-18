import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { getFTPLevel } from '@bikelab/shared/calc';
import './FTPAnalysis.css';

// selectedPeriod -> days for GET /api/analytics/ftp?days=. 'all' has no
// natural day count — a large-enough window (10 years) covers it.
const PERIOD_DAYS = { '4w': 28, '3m': 92, year: 365, all: 3650 };

export default function FTPAnalysis({ activities, selectedPeriod, userProfile, summary }) {
  const [ftpData, setFtpData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activities.length > 0) {
      loadFtpData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, selectedPeriod, userProfile, summary]);

  // FTP / high-intensity-interval analysis now runs server-side (T-3.6,
  // docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/04-cross-
  // layer.md §4.6) — this used to download every ride's full stream data
  // from localStorage/the API and analyze it here (see the now-deleted
  // utils/vo2max.js). GET /api/analytics/ftp computes and caches the same
  // per-activity result (server/services/ftpAnalysis.js,
  // `activity_analysis` table) — the first Analysis-page load after new
  // rides sync warms that cache; every later load for the same window is
  // effectively free.
  const loadFtpData = async () => {
    try {
      setLoading(true);
      const days = PERIOD_DAYS[selectedPeriod] || PERIOD_DAYS['4w'];
      const result = await apiFetch(`/api/analytics/ftp?days=${days}`);

      setFtpData({
        minutes: result.totalMinutes || 0,
        intervals: result.totalIntervals || 0,
        vo2max: summary?.vo2max || null,
        hrThreshold: result.hrThreshold || userProfile?.lactate_threshold || 160,
        durationThreshold: 120,
      });
    } catch (error) {
      console.error('Error loading FTP analysis:', error);
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

  // VO2max зоны с границами
  const vo2maxZones = [
    { label: 'BEGINNER', min: 10, max: 30, color: '#f97316' },
    { label: 'AMATEUR', min: 30, max: 50, color: '#fbbf24' },
    { label: 'ADVANCED', min: 50, max: 75, color: '#4ade80' },
    { label: 'ELITE', min: 75, max: 85, color: '#06b6d4' },
    { label: 'WORLD CLASS', min: 85, max: 100, color: '#3b82f6' }
  ];

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

