import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { analyzeHighIntensityTime } from '../utils/vo2max';
import { calculateGoalProgress } from '../utils/goalsCache';
import './GoalsManager.css';



export default function GoalsManager({ activities, onGoalsUpdate, isOpen, onClose, initialGoals = [], onGoalsRefresh }) {
  const [goals, setGoals] = useState(initialGoals);
  const [loading, setLoading] = useState(false);
  const prevGoalsRef = useRef(initialGoals);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [vo2maxValue, setVo2maxValue] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_value: '',
    unit: '',
    goal_type: 'custom',
    period: '4w',
    hr_threshold: 160,
    duration_threshold: 120
  });

  const GOAL_TYPES = [
    { value: 'distance', label: 'Distance (km)', unit: 'km' },
    { value: 'elevation', label: 'Elevation Gain (m)', unit: 'm' },
    { value: 'time', label: 'Moving Time (hours)', unit: 'h' },
    { value: 'speed_flat', label: 'Average Speed on Flat (km/h)', unit: 'km/h' },
    { value: 'speed_hills', label: 'Average Speed on Hills (km/h)', unit: 'km/h' },
    { value: 'pulse', label: 'Average Heart Rate (bpm)', unit: 'bpm' },
    { value: 'avg_hr_flat', label: 'Average HR Flat (bpm)', unit: 'bpm' },
    { value: 'avg_hr_hills', label: 'Average HR Hills (bpm)', unit: 'bpm' },
    { value: 'avg_power', label: 'Average Power (W)', unit: 'W' },
    { value: 'ftp_vo2max', label: 'FTP/VO₂max Workouts', unit: 'minutes' },
    { value: 'long_rides', label: 'Long Rides Count', unit: 'rides' },
    { value: 'intervals', label: 'Interval Workouts', unit: 'workouts' },
    { value: 'recovery', label: 'Recovery Rides', unit: 'rides' },
    { value: 'custom', label: 'Custom Goal', unit: '' }
  ];

  const PERIODS = [
    { value: '4w', label: '4 weeks' },
    { value: '3m', label: '3 months' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All time' }
  ];

  // Инициализация целей при изменении initialGoals
  useEffect(() => {
    if (initialGoals.length === 0) {
      loadGoals();
    } else {
      setGoals(initialGoals);
    }
  }, [initialGoals]);

  // Синхронизируем состояние с базой данных при открытии модального окна
  useEffect(() => {
    if (isOpen && activities && activities.length > 0) {
      // Загружаем актуальные цели из базы данных
      loadGoals();
    } else if (isOpen) {
      // Даже если нет активностей, загружаем цели для нового пользователя
      loadGoals();
    }
  }, [isOpen]);

  // Убираем автоматический вызов onGoalsUpdate, так как теперь используем onGoalsRefresh

  // Блокировка скролла при открытом модальном окне
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }

    // Очистка при размонтировании компонента
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  // Обработка клавиши Escape для закрытия модального окна
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const loadGoals = async () => {
    if (loading) {
      return; // Уже загружаем, пропускаем
    }
    
    try {
      setLoading(true);
      console.log('🔄 GoalsManager: загружаем цели...');
      const data = await apiFetch('/api/goals');
      setGoals(data || []);
      console.log('✅ GoalsManager: загружено', data?.length || 0, 'целей');
      
      // Загружаем VO₂max значение если есть FTP цели
      const hasFTPGoals = data && data.some(goal => goal.goal_type === 'ftp_vo2max');
      if (hasFTPGoals) {
        try {
          const analytics = await apiFetch('/api/analytics/summary');
          if (analytics && analytics.summary && analytics.summary.vo2max) {
            setVo2maxValue(analytics.summary.vo2max);
            console.log('✅ VO₂max загружен:', analytics.summary.vo2max);
          }
        } catch (error) {
          console.warn('Не удалось загрузить VO₂max:', error);
        }
      }
    } catch (e) {
      console.error('Error loading goals:', e);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingGoal ? `/api/goals/${editingGoal.id}` : '/api/goals';
      const method = editingGoal ? 'PUT' : 'POST';
      
      const newGoal = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      setShowAddForm(false);
      setEditingGoal(null);
      setFormData({
        title: '',
        description: '',
        target_value: '',
        unit: '',
        goal_type: 'custom',
        period: '4w',
        hr_threshold: 160,
        duration_threshold: 120
      });
      
      // После создания цели сразу обновляем её значение в базе данных
      if (activities.length > 0) {
        // Для FTP/VO2max целей загружаем streams данные только для нужного периода
        if (formData.goal_type === 'ftp_vo2max') {
          const { loadStreamsForFTPGoals } = await import('../utils/goalsCache');
          await loadStreamsForFTPGoals(activities, newGoal);
        }
        
        // Используем calculateGoalProgress из goalsCache для правильного расчета
        const { calculateGoalProgress: calculateFromCache } = await import('../utils/goalsCache');
        const currentValue = calculateFromCache(newGoal, activities);
        
        // Для FTP/VO2max целей обрабатываем объект с минутами и интервалами
        let updateData = {
          title: newGoal.title,
          description: newGoal.description,
          unit: newGoal.unit,
          goal_type: newGoal.goal_type,
          period: newGoal.period,
          hr_threshold: newGoal.hr_threshold !== null && newGoal.hr_threshold !== undefined ? newGoal.hr_threshold : formData.hr_threshold,
          duration_threshold: newGoal.duration_threshold !== null && newGoal.duration_threshold !== undefined ? newGoal.duration_threshold : formData.duration_threshold
        };
        
        if (formData.goal_type === 'ftp_vo2max' && typeof currentValue === 'object') {
          // Для FTP целей: минуты в target_value, интервалы в current_value
          updateData.target_value = currentValue.minutes || 0;
          updateData.current_value = currentValue.intervals || 0;
          console.log('🔄 FTP цель: минуты =', currentValue.minutes, 'интервалы =', currentValue.intervals);
        } else {
          // Для остальных целей: обычная логика
          updateData.target_value = newGoal.target_value || 0;
          updateData.current_value = currentValue || 0;
          console.log('🔄 Обычная цель: значение =', currentValue);
        }
        
        // Обновляем цель с правильным значением
        console.log('📊 Обновляем цель в базе:', updateData);
        await apiFetch(`/api/goals/${newGoal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        console.log('✅ Цель обновлена в базе');
      }
      
      // Уведомляем родительский компонент об обновлении целей
      if (onGoalsRefresh) {
        await onGoalsRefresh();
      }
      
      // Обновляем локальное состояние после успешного создания/редактирования
      await loadGoals();
    } catch (e) {
      console.error('Error saving goal:', e);
    }
  };

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this goal?')) return;
    
    // Предотвращаем множественные вызовы
    const goalToDelete = goals.find(goal => goal.id === id);
    if (!goalToDelete) return;
    
    try {
      await apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
      
      // Уведомляем родительский компонент об обновлении целей
      if (onGoalsRefresh) {
        await onGoalsRefresh();
      }
      
      // Обновляем локальное состояние
      await loadGoals();
    } catch (e) {
      console.error('Error deleting goal:', e);
    }
  }, [goals]);

  const handleEdit = (goal) => {
    setEditingGoal(goal);

    setFormData({
      title: goal.title,
      description: goal.description,
      target_value: goal.goal_type === 'ftp_vo2max' ? null : (goal.target_value || ''), // Для FTP целей устанавливаем null
      unit: goal.unit,
      goal_type: goal.goal_type,
      period: goal.period,
      hr_threshold: goal.hr_threshold !== null && goal.hr_threshold !== undefined && !isNaN(goal.hr_threshold) ? goal.hr_threshold : 160,
      duration_threshold: goal.duration_threshold !== null && goal.duration_threshold !== undefined && !isNaN(goal.duration_threshold) ? goal.duration_threshold : 120
    });
    setShowAddForm(true);
  };

  const handleGoalTypeChange = (goalType) => {
    const selectedType = GOAL_TYPES.find(t => t.value === goalType);
    setFormData({
      ...formData,
      goal_type: goalType,
      unit: selectedType ? selectedType.unit : '',
      target_value: goalType === 'ftp_vo2max' ? null : formData.target_value, // Для FTP целей устанавливаем null
      hr_threshold: goalType === 'ftp_vo2max' ? 160 : formData.hr_threshold,
      duration_threshold: goalType === 'ftp_vo2max' ? 120 : formData.duration_threshold
    });
  };

  const calculateProgress = (goal) => {
    try {
      if (!goal) return 0;
      
      const currentValue = parseFloat(goal.current_value) || 0;
      const targetValue = parseFloat(goal.target_value) || 0;
      
      if (!targetValue || targetValue === 0) return 0;
      
      // Для целей пульса инвертируем прогресс - чем меньше, тем лучше
      if (goal.goal_type === 'pulse' || goal.goal_type === 'avg_hr_flat' || goal.goal_type === 'avg_hr_hills') {
        // Если текущий пульс меньше целевого - это хорошо (больше прогресса)
        const progress = (targetValue / currentValue) * 100;
        return Math.round(Math.max(0, progress)); // Убираем ограничение в 100%
      }
      
      // Для elevation целей тоже убираем ограничение в 100% - можно набрать больше высоты
      if (goal.goal_type === 'elevation') {
        const progress = (currentValue / targetValue) * 100;
        return Math.round(Math.max(0, progress)); // Убираем ограничение в 100%
      }
      
      // Для остальных целей обычная логика
      const progress = (currentValue / targetValue) * 100;
      return Math.round(Math.min(100, Math.max(0, progress)));
    } catch (error) {
      console.error('Error in calculateProgress:', error);
      return 0;
    }
  };

  const getFTPLevel = (minutes) => {
    if (minutes < 30) return { level: 'Low', color: '#bdbdbd' };
    if (minutes < 60) return { level: 'Normal', color: '#4caf50' };
    if (minutes < 120) return { level: 'Good', color: '#4caf50' };
    if (minutes < 180) return { level: 'Excellent', color: '#ff9800' };
    return { level: 'Outstanding', color: '#f44336' };
  };

  // Функция для правильного форматирования чисел в зависимости от типа цели
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
    
    // Все остальные цели - целые числа
    return Math.round(numValue).toString();
  };

  const progressBar = (pct, current, target, unit, goalType) => {
    const currentValue = parseFloat(current) || 0;
    const targetValue = parseFloat(target) || 0;
    
    return (
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
          {formatGoalValue(currentValue, goalType)} / {formatGoalValue(targetValue, goalType)} {unit}
        </div>
      </>
    );
  };

  // Убираем функцию updateGoalProgress - теперь обновление происходит только в PlanPage

  // Убираем автоматическое обновление прогресса при каждом изменении
  // Теперь обновление происходит только при создании/удалении целей
  // и при появлении новых тренировок (через PlanPage)

  if (!isOpen) return null;

  if (loading && goals.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Manage Personal Goals</h2>
            <button onClick={onClose} className="modal-close-btn">×</button>
          </div>
          <div className="goals-loading">Loading goals...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
            <div className="goals-header">
            <h2>Manage Personal Goals</h2>
          {!showAddForm && (
          <button 
            className="add-goal-btn"
            onClick={() => setShowAddForm(true)}
          >
            + Add Goal
          </button>
        )}
            </div>
         
          <button onClick={onClose} className="modal-close-btn material-symbols-outlined">Close</button>
        </div>
        
        <div className="goals-manager">
      <div className="goals-header">
       
       
      </div>

      {showAddForm && (
        <div className="goal-form-container">
          <form onSubmit={handleSubmit} className="goal-form">
            <h3>{editingGoal ? 'Edit Goal' : 'Add New Goal'}</h3>
            
            <div className="form-group">
              <label>Title:</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="e.g., Average Speed on Flat"
                required
              />
            </div>

            <div className="form-group">
              <label>Description:</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="e.g., Improve average speed on flat terrain"
                rows="3"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Goal Type:</label>
                <select
                  value={formData.goal_type}
                  onChange={(e) => handleGoalTypeChange(e.target.value)}
                >
                  {GOAL_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Period:</label>
                <select
                  value={formData.period}
                  onChange={(e) => setFormData({...formData, period: e.target.value})}
                >
                  {PERIODS.map(period => (
                    <option key={period.value} value={period.value}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formData.goal_type === 'ftp_vo2max' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Threshold HR (BPM):</label>
                  <input
                    type="number"
                    min="120"
                    max="200"
                    value={isNaN(formData.hr_threshold) ? '' : formData.hr_threshold}
                    onChange={(e) => setFormData({...formData, hr_threshold: parseInt(e.target.value)})}
                    placeholder="160"
                  />
                </div>

                <div className="form-group">
                  <label>Time spent in Threshold (seconds):</label>
                  <input
                    type="number"
                    min="30"
                    max="600"
                    value={isNaN(formData.duration_threshold) ? '' : formData.duration_threshold}
                    onChange={(e) => setFormData({...formData, duration_threshold: parseInt(e.target.value)})}
                    placeholder="120"
                  />
                </div>
              </div>
            )}

            <div className="form-row">
              {/* Скрываем Target Value для FTP/VO2max целей */}
              {formData.goal_type !== 'ftp_vo2max' && (
                <div className="form-group">
                  <label>Target Value:</label>
                  <input
                    type="number"
                    step="0.1"
                    value={isNaN(formData.target_value) ? '' : formData.target_value}
                    onChange={(e) => setFormData({...formData, target_value: e.target.value})}
                    placeholder="e.g., 30"
                    required
                  />
                </div>
              )}

              {/* Информационное сообщение для FTP целей */}
              {formData.goal_type === 'ftp_vo2max' && (
                <div className="form-group">
                  <div className="info-message">
                    <span className="material-symbols-outlined">info</span>
                    Target value will be calculated automatically from your activity data
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Unit:</label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  placeholder="e.g., km/h"
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="accent-btn">
                {editingGoal ? 'Update Goal' : 'Add Goal'}
              </button>
              <button 
                type="button" 
                className="cancel-btn"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingGoal(null);
                  setFormData({
                    title: '',
                    description: '',
                    target_value: '',
                    unit: '',
                    goal_type: 'custom',
                    period: '4w',
                    hr_threshold: 160,
                    duration_threshold: 120
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="no-goals">
          <p>No goals set yet. Click "Add Goal" to create your first personal goal!</p>
        </div>
      ) : (
        <div className="goals-grid" id="goal-manage">
          {goals.map(goal => {
            try {
              const progress = calculateProgress(goal);
              const periodLabel = PERIODS.find(p => p.value === goal.period)?.label;
            
            return (
              <div key={goal.id} className={`goal-card ${goal.goal_type === 'ftp_vo2max' ? 'goal-card-ftp' : ''}`}>
                <div className="goal-header">
                  <h3>{goal.title}</h3>
                  <div className="goal-actions">
                    <button 
                      onClick={() => handleEdit(goal)}
                      className="edit-btn material-symbols-outlined"
                      title="Edit goal"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(goal.id)}
                      className="delete-btn material-symbols-outlined"
                      title="Delete goal"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                {goal.description && (
                  <p className="goal-description">{goal.description}</p>
                )}
                
                <div className="goal-period">
                  Period: {periodLabel}
                </div>
                
                <div className="goal-progress">
                  {goal.goal_type === 'ftp_vo2max' ? (
                    <div>
                      {(() => {
                        // Используем данные из базы для отображения
                        const displayValue = parseFloat(goal.target_value) || 0;  // минуты из target_value
                        const totalIntervals = parseFloat(goal.current_value) || 0; // интервалы из current_value
                        
                        const ftpLevel = getFTPLevel(displayValue);
                        
                        return (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '0.5em' }}>
                              <span style={{
                                display: 'inline-block',
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: ftpLevel.color,
                                border: '2px solid #fff'
                              }}></span>
                              <span style={{ fontSize: '1.3em', fontWeight: '800', color: '#000' }}>
                                {displayValue} min / {totalIntervals} ints
                              </span>
                              <span style={{ fontSize: '0.9em', opacity: '0.5', color: '#000', marginTop: '0.12em' }}>
                                {ftpLevel.level}
                              </span>
                            </div>
                            
                            {/* VO₂max значение */}
                            {vo2maxValue && (
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.5em', 
                                marginBottom: '0.5em',
                                fontSize: '1.1em',
                                fontWeight: '600',
                                color: '#333'
                              }}>
                                <span style={{ fontSize: '0.9em', color: '#666' }}>VO₂max:</span>
                                <span style={{ 
                                  fontSize: '1.2em', 
                                  fontWeight: '700', 
                                  color: '#274DD3',
                                  background: '#f0f4ff',
                                  padding: '2px 8px',
                                  borderRadius: '4px'
                                }}>
                                  {vo2maxValue}
                                </span>
                              </div>
                            )}
                            
                            <div className="goal-progress-bar-label" style={{ marginTop: '0.5em', fontSize: '0.8em', color: '#666' }}>
                              Criterion: pulse ≥{goal.hr_threshold !== null && goal.hr_threshold !== undefined ? goal.hr_threshold : 160} for at least {goal.duration_threshold !== null && goal.duration_threshold !== undefined ? goal.duration_threshold : 120} seconds in a row
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    progressBar(progress, goal.current_value, goal.target_value, goal.unit, goal.goal_type)
                  )}
                </div>
              </div>
            );
            } catch (error) {
              console.error('Error rendering goal:', goal?.id, error);
              return null;
            }
          })}
        </div>
      )}
        </div>
      </div>
    </div>
  );
} 