import React from 'react';
import './GoalsManager.css'; // Используем существующие стили

const GoalCard = ({ 
  goal, 
  showActions = false, 
  onEdit, 
  onDelete, 
  vo2maxValue = null // Deprecated: will use goal.vo2max_value instead
}) => {
  // Форматирование значений целей
  const formatGoalValue = (value, goalType) => {
    const numValue = parseFloat(value) || 0;
    
    // Distance цели - два знака после запятой
    if (goalType === 'distance') {
      return numValue.toFixed(2);
    }
    
    // Цели, связанные со скоростью - один знак после запятой
    if (goalType === 'speed_flat' || goalType === 'speed_hills') {
      return numValue.toFixed(1);
    }
    
    // Цели, связанные со временем - один знак после запятой
    if (goalType === 'time') {
      return numValue.toFixed(1);
    }
    
    // Цели каденса - округление до целого
    if (goalType === 'cadence') {
      return Math.round(numValue);
    }
    
    // Все остальные цели - округление до целого
    return Math.round(numValue);
  };

  // Компонент прогресс-бара
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

  // Функция для определения уровня FTP
  const getFTPLevel = (minutes) => {
    if (minutes < 30) return { level: 'Low', color: '#bdbdbd' };
    if (minutes < 60) return { level: 'Normal', color: '#4caf50' };
    if (minutes < 120) return { level: 'Good', color: '#4caf50' };
    if (minutes < 180) return { level: 'Excellent', color: '#ff9800' };
    return { level: 'Outstanding', color: '#f44336' };
  };

  // Расчет прогресса
  const currentValue = parseFloat(goal.current_value) || 0;
  const targetValue = parseFloat(goal.target_value) || 0;
  
  let progress = 0;
  if (targetValue > 0) {
    if (goal.goal_type === 'pulse' || goal.goal_type === 'avg_hr_flat' || goal.goal_type === 'avg_hr_hills') {
      // Если текущий пульс меньше целевого - это хорошо (больше прогресса)
      // Защита от деления на ноль
      if (currentValue > 0) {
        progress = Math.round(Math.max(0, (targetValue / currentValue) * 100));
      } else {
        progress = 0; // Нет данных о пульсе
      }
    } else {
      // Для всех остальных целей - можно перевыполнять план (прогресс > 100%)
      progress = Math.round(Math.max(0, (currentValue / targetValue) * 100));
    }
  }

  // Форматирование периода
  const periodLabel = goal.period === '4w' ? '4 weeks' : 
                     goal.period === '3m' ? '3 months' : 
                     goal.period === 'year' ? 'Year' : 'All time';

  // Рендер FTP/VO2max карточки
  const renderFTPCard = () => {
    const totalTimeMin = parseFloat(goal.target_value) || 0;  // минуты из target_value
    const totalIntervals = parseFloat(goal.current_value) || 0; // интервалы из current_value
    const ftpLevel = getFTPLevel(totalTimeMin);
    
    // Используем сохраненное значение из базы или fallback на переданное значение
    const displayVO2max = goal.vo2max_value || vo2maxValue;

    return (
      <>
        <div className="ftp-card-container">
          <div>
            {/* VO₂max значение */}
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
              <button 
                onClick={() => onEdit && onEdit(goal)}
                className="edit-btn material-symbols-outlined"
                title="Edit goal"
              >
                Edit
              </button>
              <button 
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
