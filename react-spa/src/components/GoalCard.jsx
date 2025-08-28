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
            style={{ width: `${pct}%` }}
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
    } else if (goal.goal_type === 'elevation') {
      // Для elevation целей тоже убираем ограничение в 100% - можно набрать больше высоты
      progress = Math.round(Math.max(0, (currentValue / targetValue) * 100));
    } else {
      // Для остальных целей обычная логика
      progress = Math.round(Math.min(100, Math.max(0, (currentValue / targetValue) * 100)));
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', marginBottom: '0.5em', flexDirection: 'row' }}>
          <div>
            {/* VO₂max значение */}
            {displayVO2max && (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                marginTop: '5px',
                marginBottom: '0.5em',
                fontSize: '1.1em',
                fontWeight: '600',
                color: '#333'
              }}>
                <span style={{ 
                  fontSize: '3.4em', 
                  fontWeight: '800', 
                  color: '#000',
                  height: '72px',
                  borderRadius: '4px'
                }}>
                  {displayVO2max}
                </span>
                <span style={{ fontSize: '16px', color: '#000', opacity: '0.3', marginBottom: '11px' }}>
                  VO₂max
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5em', marginTop: '20px', fontSize: '0.9em', fontWeight: '600', color: '#333', flexDirection: 'column' }}>
            <span style={{ fontSize: '1em', opacity: '0.5', color: '#000', marginTop: '0.12em' }}>
              FTP workouts: {ftpLevel.level}
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5em', marginBottom: '8px'}}>
              <span style={{ fontSize: '1.4em', fontWeight: '800', color: '#000' }}>
                {totalTimeMin} min / {totalIntervals} ints
              </span>
              <span style={{
                display: 'inline-block',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: ftpLevel.color,
                border: '2px solid #fff'
              }}></span>
            </div>
            <span style={{ fontSize: '1em', opacity: '0.5', color: '#000', marginTop: '0.12em' }}>
              Criterion: pulse ≥{goal.hr_threshold || 160} for at least {goal.duration_threshold || 120} seconds in a row
            </span>
          </div>
        </div>
      </>
    );
  };

  return (
    <div key={goal.id} className={`goal-card ${goal.goal_type === 'ftp_vo2max' ? 'goal-card-ftp' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <b>{goal.title}</b>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '0.8em', color: '#9ca3af' }}>
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
        <div style={{ color: '#6b7280', fontSize: '0.9em', marginBottom: '12px' }}>
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
