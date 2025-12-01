import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { analyzeHighIntensityTime } from '../utils/vo2max';
import { calculateGoalProgress } from '../utils/goalsCache';
import GoalCard from './GoalCard';
import './GoalsManager.css';



export default function GoalsManager({ activities, onGoalsUpdate, isOpen, onClose, initialGoals = [], onGoalsRefresh, onVO2maxRefresh }) {
  const [goals, setGoals] = useState(initialGoals);
  const [loading, setLoading] = useState(false);
  const prevGoalsRef = useRef(initialGoals);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  // VO2max теперь сохраняется в базе данных в поле goal.vo2max_value
  const [userProfile, setUserProfile] = useState(null);
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
    { value: 'cadence', label: 'Average Cadence (RPM)', unit: 'RPM' },
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

  // Загружаем профиль пользователя для получения lactate threshold
  const loadUserProfile = useCallback(async () => {
    try {
      const profile = await apiFetch('/api/user-profile');
      setUserProfile(profile);
      return profile;
    } catch (error) {
      console.error('Error loading user profile for goals:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadUserProfile();
    }
  }, [isOpen, loadUserProfile]);

  // Обновляем HR threshold в форме при изменении профиля пользователя
  useEffect(() => {
    if (userProfile?.lactate_threshold && formData.goal_type === 'ftp_vo2max') {
      const newThreshold = parseInt(userProfile.lactate_threshold);
      // Обновляем только если текущее значение - это дефолтное (160) или старое значение из профиля
      if (formData.hr_threshold === 160 || 
          (userProfile.lactate_threshold && formData.hr_threshold !== newThreshold)) {
        setFormData(prev => ({
          ...prev,
          hr_threshold: newThreshold
        }));
      }
    }
  }, [userProfile?.lactate_threshold, formData.goal_type]);

  // VO2max теперь вычисляется и сохраняется на сервере автоматически

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
      
      // VO2max теперь загружается вместе с целями из базы данных
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
        hr_threshold: userProfile?.lactate_threshold ? parseInt(userProfile.lactate_threshold) : 160,
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
        const currentValue = calculateFromCache(newGoal, activities, userProfile);
        
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
    
    // VO2max теперь сохранен в goal.vo2max_value
    
    setShowAddForm(true);
  };

  const handleGoalTypeChange = (goalType) => {
    const selectedType = GOAL_TYPES.find(t => t.value === goalType);
    
    // Определяем HR threshold из профиля пользователя
    let defaultHRThreshold = 160; // fallback значение
    if (goalType === 'ftp_vo2max' && userProfile?.lactate_threshold) {
      defaultHRThreshold = parseInt(userProfile.lactate_threshold);
    }
    
    setFormData({
      ...formData,
      goal_type: goalType,
      unit: selectedType ? selectedType.unit : '',
      target_value: goalType === 'ftp_vo2max' ? null : formData.target_value, // Для FTP целей устанавливаем null
      hr_threshold: goalType === 'ftp_vo2max' ? defaultHRThreshold : formData.hr_threshold,
      duration_threshold: goalType === 'ftp_vo2max' ? 120 : formData.duration_threshold
    });

    // VO2max будет вычислен автоматически при сохранении FTP цели
  };

  const handlePeriodChange = (period) => {
    setFormData({...formData, period});
    
    // VO2max будет пересчитан автоматически при сохранении изменений
    // Уведомляем PlanPage о необходимости обновить отображение
    if (formData.goal_type === 'ftp_vo2max' && onVO2maxRefresh) {
      onVO2maxRefresh(period);
    }
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
                  onChange={(e) => handlePeriodChange(e.target.value)}
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                    <input
                      type="number"
                      min="120"
                      max="200"
                      value={isNaN(formData.hr_threshold) ? '' : formData.hr_threshold}
                      onChange={(e) => setFormData({...formData, hr_threshold: parseInt(e.target.value)})}
                      placeholder="160"
                      style={{ flex: 1 }}
                    />
                    {userProfile?.lactate_threshold && (
                      <button
                        type="button"
                        onClick={async () => {
                          const freshProfile = await loadUserProfile(); // Перезагружаем профиль
                          if (freshProfile?.lactate_threshold) {
                            setFormData(prev => ({
                              ...prev,
                              hr_threshold: parseInt(freshProfile.lactate_threshold)
                            }));
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.8em',
                          background: '#7eaaff',
                          color: '#23272f',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                        title="Refresh from profile"
                      >
                        🔄
                      </button>
                    )}
                  </div>
                  {userProfile?.lactate_threshold && formData.hr_threshold === parseInt(userProfile.lactate_threshold) && (
                    <div style={{ 
                      fontSize: '0.8em', 
                      color: '#10b981', 
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      ✓ Auto-filled from your profile lactate threshold
                    </div>
                  )}
                  {userProfile?.lactate_threshold && formData.hr_threshold !== parseInt(userProfile.lactate_threshold) && (
                    <div style={{ 
                      fontSize: '0.8em', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>Profile lactate threshold: {userProfile.lactate_threshold} BPM</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            hr_threshold: parseInt(userProfile.lactate_threshold)
                          }));
                        }}
                        style={{
                          padding: '2px 6px',
                          fontSize: '0.7em',
                          background: 'transparent',
                          color: '#7eaaff',
                          border: '1px solid #7eaaff',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        Use this value
                      </button>
                    </div>
                  )}
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
                  <div style={{ 
                    fontSize: '0.8em', 
                    color: '#6b7280', 
                    marginTop: '4px'
                  }}>
                    Minimum continuous time in threshold zone to count as interval
                  </div>
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
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              showActions={true}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
        </div>
      </div>
    </div>
  );
} 