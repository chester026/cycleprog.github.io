import React from 'react';
import './GoalsManager.css';

const GoalCard = ({ 
  goal, 
  showActions = false, 
  onEdit, 
  onDelete, 
  vo2maxValue = null // Deprecated: will use goal.vo2max_value instead
}) => {
  const formatGoalValue = (value, goalType) => {
    const numValue = parseFloat(value) || 0;
    
    if (goalType === 'distance') {
      return numValue.toFixed(2);
    }
    
    if (goalType === 'speed_flat' || goalType === 'speed_hills') {
      return numValue.toFixed(1);
    }
    
    if (goalType === 'time') {
      return numValue.toFixed(1);
    }
    
    if (goalType === 'cadence') {
      return Math.round(numValue);
    }
    
    return Math.round(numValue);
  };

  const ProgressBar = ({ pct, label }) => (
    <>
      <div className="goal-progress-bar-outer">
        <div className="goal-progress-bar">
          <div 
            className="goal-progress-bar-inner" 
            style={{ width: `${Math.min(100, pct)}%` }}
          ></div>
        </div>
        <div className="goal-progress-bar-pct">
          {pct}%
        </div>
      </div>
      <div className="goal-progress-bar-label">
{label}
      </div>
    </>
  );

  const getFTPLevel = (minutes) => {
    if (minutes < 30) return { level: 'Low', color: '#bdbdbd' };
    if (minutes < 60) return { level: 'Normal', color: '#4caf50' };
    if (minutes < 120) return { level: 'Good', color: '#4caf50' };
    if (minutes < 180) return { level: 'Excellent', color: '#ff9800' };
    return { level: 'Outstanding', color: '#f44336' };
  };

  // `percent` is computed server-side (GET /api/goals, server/services/
  // goals.js `withGoalProgress`) — don't recompute it here (audit W-08: the
  // client's inverted HR formula diverged from the server's).
  const progress = Math.round(Number(goal.percent) || 0);

  const periodLabel = goal.period === '4w' ? '4 weeks' : 
                     goal.period === '3m' ? '3 months' : 
                     goal.period === 'year' ? 'Year' : 'All time';

  const renderFTPCard = () => {
    const totalTimeMin = parseFloat(goal.target_value) || 0; // minutes
    const totalIntervals = parseFloat(goal.current_value) || 0; // intervals
    const ftpLevel = getFTPLevel(totalTimeMin);
    
    // Stored value wins; the prop is the legacy fallback.
    const displayVO2max = goal.vo2max_value || vo2maxValue;

    return (
      <>
        <div className="ftp-card-container">
          <div>
            {displayVO2max && (
              <div className="vo2max-display">
                <span className="vo2max-value">
                  {displayVO2max}
                </span>
                <span className="vo2max-label">
                  VO₂max
                </span>
              </div>
            )}
          </div>
          <div className="ftp-details">
            <span className="ftp-level-label">
              FTP workouts: {ftpLevel.level}
            </span>
            <div className="ftp-stats">
              <span className="ftp-stats-value">
                {totalTimeMin} min / {totalIntervals} ints
              </span>
              <span 
                className="ftp-level-indicator"
                style={{ background: ftpLevel.color }}
              ></span>
            </div>
            <span className="ftp-criterion">
              Criterion: pulse ≥{goal.hr_threshold || 160} for at least {goal.duration_threshold || 120} seconds in a row
            </span>
          </div>
        </div>
      </>
    );
  };

  return (
    <div key={goal.id} className={`goal-card ${goal.goal_type === 'ftp_vo2max' ? 'goal-card-ftp' : ''}`}>
      <div className="goal-card-header">
        <b>{goal.title}</b>
        <div className="goal-card-actions-container">
          <div className="goal-card-period">
            {periodLabel}
          </div>
          {showActions && (
            <div className="goal-actions">
              <button type="button" 
                onClick={() => onEdit && onEdit(goal)}
                className="edit-btn material-symbols-outlined"
                title="Edit goal"
              >
                Edit
              </button>
              <button type="button" 
                onClick={() => onDelete && onDelete(goal.id)}
                className="delete-btn material-symbols-outlined"
                title="Delete goal"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      
      {goal.description && (
        <div className="goal-card-description">
          {goal.description}
        </div>
      )}
      
      <span className="goal-progress">
        {goal.goal_type === 'ftp_vo2max' ? (
          renderFTPCard()
        ) : (
          <ProgressBar 
            pct={progress} 
            label={`${formatGoalValue(goal.current_value, goal.goal_type)} / ${formatGoalValue(goal.target_value, goal.goal_type)} ${goal.unit}`}
          />
        )}
      </span>
    </div>
  );
};

export default GoalCard;
