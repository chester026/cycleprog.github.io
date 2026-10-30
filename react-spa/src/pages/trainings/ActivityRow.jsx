// Single activity row, extracted from TrainingsPage (T-6.3, audit W-26).
// Styled by the page's own `activity-*`/`col-item` classes in
// `../TrainingsPage.css` — unchanged.
import React from 'react';

export function ActivityRow({ activity, onAnalyze }) {
  const a = activity;
  return (
    <div className="activity-row">
      <div className="activity-name-col col-item">
        <div className="activity-name">{a.name || 'No name'}</div>
        <div className="activity-date">{a.start_date ? new Date(a.start_date).toLocaleDateString('en-GB') : ''}</div>
      </div>
      <div className="activity-distance-col col-item">{a.distance ? (a.distance / 1000).toFixed(1) : '-'} km</div>
      <div className="activity-speed-col col-item">{a.average_speed ? (a.average_speed * 3.6).toFixed(1) : '-'} km/h</div>
      <div className="activity-hr-col col-item">
        <span className="material-symbols-outlined">ecg_heart</span> {a.average_heartrate ? Math.round(a.average_heartrate) : '-'}
      </div>
      <div className="activity-elevation-col col-item">
        <span className="material-symbols-outlined">altitude</span> {a.total_elevation_gain ? Math.round(a.total_elevation_gain) : '-'}
      </div>
      <div className="activity-actions-col">
        <button type="button" onClick={() => onAnalyze(a)} className="activity-btn ai-btn">
          Analyze
        </button>
      </div>
    </div>
  );
}
