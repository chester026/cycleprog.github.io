// Ride analysis modal, lifted out of HeroTrackBanner so the new garage card
// can reuse it without duplicating the advice logic. The markup and the
// .analysis-modal-* styles are unchanged — the stylesheet is imported from
// HeroTrackBanner.css, which is where those rules already live.
import React from 'react';
import './HeroTrackBanner.css';

const RideAnalysisModal = React.memo(({ open, onClose, lastRide }) => {
  if (!open) return null;
  if (!lastRide) return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={e => e.stopPropagation()}>
        <h2>Analysis</h2>
        <div className="analysis-modal-no-data">No data for analysis</div>
        <button className="modal-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  // Determine workout type
  let type = 'Regular';
  if (lastRide.distance && lastRide.distance / 1000 > 60) type = 'Long';
  else if (lastRide.average_speed && lastRide.average_speed * 3.6 < 20 && lastRide.moving_time && lastRide.moving_time / 60 < 60) type = 'Recovery';
  else if (lastRide.total_elevation_gain && lastRide.total_elevation_gain > 800) type = 'Mountain';
  else if ((lastRide.name || '').toLowerCase().includes('интервал') || (lastRide.type || '').toLowerCase().includes('interval')) type = 'Interval';

  const generateAdvice = () => {
    const advice = [];
    if (lastRide.average_speed && lastRide.average_speed * 3.6 < 25) {
      advice.push('Average speed below 25 km/h. To improve speed, include interval training (e.g., 4×4 min in Z4-Z5 with 4 min rest), work on pedaling technique (cadence 90-100), monitor body position on the bike and aerodynamics.');
    }
    if (lastRide.average_heartrate && lastRide.average_heartrate > 155) {
      advice.push('Heart rate above 155 bpm. This may indicate high intensity or insufficient recovery. Check sleep quality, stress levels, add recovery workouts, monitor hydration and nutrition.');
    }
    if (lastRide.total_elevation_gain && lastRide.total_elevation_gain > 500 && lastRide.average_speed * 3.6 < 18) {
      advice.push('Mountain workout with low speed. To improve results, add strength training off the bike and hill intervals (e.g., 5×5 min in Z4).');
    }
    if (!lastRide.average_heartrate) {
      advice.push('No heart rate data. Add a heart rate sensor for more accurate intensity and recovery monitoring.');
    }
    if (!lastRide.distance || lastRide.distance / 1000 < 30) {
      advice.push('Short distance. For endurance development, plan at least one long ride (60+ km) per week. Gradually increase distance, don\'t forget nutrition and hydration on the road.');
    }
    if (type === 'Recovery') {
      advice.push('Recovery workout. Excellent! Don\'t forget to alternate such workouts with interval and long rides for progress.');
    }
    if (type === 'Interval' && lastRide.average_heartrate && lastRide.average_heartrate < 140) {
      advice.push('Interval workout with low heart rate. Intervals should be performed with higher intensity (Z4-Z5) to get maximum training effect.');
    }
    if (!lastRide.average_cadence) {
      advice.push('No cadence data. Using a cadence sensor will help track pedaling technique and avoid excessive fatigue.');
    }
    if (advice.length === 0) {
      advice.push('Workout completed excellently! Keep up the good work and gradually increase load for further progress.');
    }
    return advice;
  };

  const advice = generateAdvice();

  return (
    <div className="analysis-modal-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={e => e.stopPropagation()}>
        <h2 className="analysis-modal-title">Ride Analysis</h2>
        <div className="analysis-modal-date">
          {lastRide.start_date ? new Date(lastRide.start_date).toLocaleString('ru-RU') : ''}
        </div>

        {/* Metrics */}
        <div className="analysis-modal-metrics">
          <b>Distance:</b> <span>{lastRide.distance ? (lastRide.distance / 1000).toFixed(1) + ' km' : '—'}</span><br />
          <b>Time:</b> <span>{lastRide.moving_time ? (lastRide.moving_time / 60).toFixed(0) + ' min' : '—'}</span><br />
          <b>Average speed:</b> <span>{lastRide.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) + ' km/h' : '—'}</span><br />
          <b>Max speed:</b> <span>{lastRide.max_speed ? (lastRide.max_speed * 3.6).toFixed(1) + ' km/h' : '—'}</span><br />
          <b>Elevation gain:</b> <span>{lastRide.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) + ' m' : '—'}</span><br />
          <b>Average heart rate:</b> <span className="analysis-modal-hr-value" style={{ color: lastRide.average_heartrate ? (lastRide.average_heartrate < 145 ? '#4caf50' : lastRide.average_heartrate < 160 ? '#ff9800' : '#e53935') : '#888' }}>{lastRide.average_heartrate ? Math.round(lastRide.average_heartrate) + ' bpm' : '—'}</span><br />
          <b>Max heart rate:</b> <span>{lastRide.max_heartrate ? Math.round(lastRide.max_heartrate) + ' bpm' : '—'}</span><br />
          <b>Cadence:</b> <span>{lastRide.average_cadence ? Math.round(lastRide.average_cadence) + ' rpm' : '—'}</span><br />
          <b>Type:</b> <span>{type}</span><br />
        </div>

        {/* Advice */}
        <hr className="analysis-modal-hr" />
        <b className="analysis-modal-advice-title">What to improve:</b>
        <ul className="analysis-modal-advice-list">
          {advice.map((item, index) => (
            <li key={index} className="analysis-modal-advice-item"><b>{item.split('.')[0]}.</b> {item.split('.').slice(1).join('.')}</li>
          ))}
        </ul>

        <button className="modal-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
});

export default RideAnalysisModal;
