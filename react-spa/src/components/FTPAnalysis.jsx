import React from 'react';
import { getFTPLevel } from '@bikelab/shared/calc';
import { useFtp } from '../data/hooks';
import { ErrorMessage, Skeleton } from '../ui';
import './FTPAnalysis.css';

// selectedPeriod -> days for GET /api/analytics/ftp?days=. 'all' has no
// natural day count — a large-enough window (10 years) covers it.
const PERIOD_DAYS = { '4w': 28, '3m': 92, year: 365, all: 3650 };
const PERIOD_LABELS = { '4w': '4 Weeks', '3m': '3 Months', year: 'Year', all: 'All Time' };

// Fallback when neither the server nor the profile knows the rider's LTHR.
const DEFAULT_HR_THRESHOLD_BPM = 160;
// An "interval" is HR >= threshold held for at least this long (server rule).
const INTERVAL_MIN_DURATION_S = 120;

// VO2max bands (ml/kg/min) drawn on the horizontal scale.
const VO2MAX_ZONES = [
  { label: 'BEGINNER', min: 10, max: 30, color: '#f97316' },
  { label: 'AMATEUR', min: 30, max: 50, color: '#fbbf24' },
  { label: 'ADVANCED', min: 50, max: 75, color: '#4ade80' },
  { label: 'ELITE', min: 75, max: 85, color: '#06b6d4' },
  { label: 'WORLD CLASS', min: 85, max: 100, color: '#3b82f6' },
];
const VO2MAX_SCALE_MIN = 10;
const VO2MAX_SCALE_MAX = 100;

const getVO2maxPosition = (vo2max) => {
  if (!vo2max) return 0;
  const clampedValue = Math.max(VO2MAX_SCALE_MIN, Math.min(vo2max, VO2MAX_SCALE_MAX));
  return ((clampedValue - VO2MAX_SCALE_MIN) / (VO2MAX_SCALE_MAX - VO2MAX_SCALE_MIN)) * 100;
};

function FtpHeader({ periodLabel }) {
  return (
    <div className="ftp-header">
      <h3 className="analitycs-heading">VO₂max</h3>
      <span className="ftp-period">{periodLabel}</span>
    </div>
  );
}

export default function FTPAnalysis({ activities, selectedPeriod, userProfile, summary }) {
  const days = PERIOD_DAYS[selectedPeriod] || PERIOD_DAYS['4w'];
  const periodLabel = PERIOD_LABELS[selectedPeriod] || PERIOD_LABELS.all;
  const hasActivities = activities.length > 0;
  const { data, isLoading, isError, error } = useFtp(days, { enabled: hasActivities });

  if (!hasActivities) {
    return (
      <div className="ftp-analysis">
        <FtpHeader periodLabel={periodLabel} />
        <div className="ftp-loading">No rides in this period yet — FTP workload appears after your first ride.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="ftp-analysis">
        <FtpHeader periodLabel={periodLabel} />
        <div className="ftp-loading">
          <Skeleton label="Loading FTP analysis" height={96} radius={12} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ftp-analysis">
        <FtpHeader periodLabel={periodLabel} />
        <ErrorMessage>Couldn&apos;t load FTP analysis: {error?.message || 'unknown error'}</ErrorMessage>
      </div>
    );
  }

  const ftpData = {
    minutes: data?.totalMinutes || 0,
    intervals: data?.totalIntervals || 0,
    vo2max: summary?.vo2max || null,
    hrThreshold: data?.hrThreshold || userProfile?.lactate_threshold || DEFAULT_HR_THRESHOLD_BPM,
    durationThreshold: INTERVAL_MIN_DURATION_S,
  };

  const ftpLevel = getFTPLevel(ftpData.minutes);
  const vo2maxPosition = ftpData.vo2max ? getVO2maxPosition(ftpData.vo2max) : 0;

  return (
    <div className="ftp-analysis">
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
        {ftpData.vo2max && (
          <div className="vo2max-analytics">
           
        <div className="vo2max-analytics-content">
            <div className="vo2max-scale-container">
              <div className="vo2max-scale">
                {VO2MAX_ZONES.map((zone, index) => {
                  const totalRange = VO2MAX_SCALE_MAX - VO2MAX_SCALE_MIN;
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
                          {index === VO2MAX_ZONES.length - 1 && (
                            <span className="vo2max-zone-max"> &nbsp;- {zone.max}+</span>
                          )}
                        </div>
                        <div className="vo2max-zone-label">{zone.label}</div>
                      </div>
                     
                    </div>
                  );
                })}
                <div 
                  className="vo2max-indicator"
                  style={{ left: `${vo2maxPosition}%` }}
                >
                  <div className="vo2max-indicator-line"></div>
                  <div className="vo2max-indicator-value">{ftpData.vo2max} <span style={{fontSize: '0.55em', display: 'block', width: '100%', textAlign: 'center', fontWeight: 500, opacity: 0.5}}>ml/kg/min</span></div>
                </div>
              </div>
            </div>

            
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

