import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { analyzeHighIntensityTime } from '../utils/vo2max';
import './GoalsManager.css';



export default function GoalsManager({ activities, onGoalsUpdate, isOpen, onClose, initialGoals = [] }) {
  const [goals, setGoals] = useState(initialGoals);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
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
    { value: 'pulse_flat_hills', label: 'AVG HR Flat&Hills (%)', unit: '%' },
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

  useEffect(() => {
    if (initialGoals.length === 0) {
      loadGoals();
    } else {
      setGoals(initialGoals);
    }
  }, [initialGoals]);

  useEffect(() => {
    if (activities.length > 0 && goals.length > 0) {
      updateGoalProgress();
    }
  }, [activities, goals.length]);

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
    try {
      setLoading(true);
      const res = await apiFetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
        if (onGoalsUpdate) onGoalsUpdate(data);
      }
    } catch (e) {
      console.error('Error loading goals:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateGoalProgress = async () => {
    try {
      // Рассчитываем прогресс на фронтенде вместо отправки всех активностей
      const updatedGoals = goals.map(goal => {
        const currentValue = calculateGoalProgress(goal, activities);
        return { ...goal, current_value: currentValue };
      });
      
      // Обновляем цели в базе данных по одной
      for (const goal of updatedGoals) {
        try {
          const res = await apiFetch(`/api/goals/${goal.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: goal.title,
              description: goal.description,
              target_value: goal.target_value,
              current_value: goal.current_value,
              unit: goal.unit,
              goal_type: goal.goal_type,
              period: goal.period
            })
          });
          
          // Если цель не найдена (404), пропускаем её
          if (!res.ok && res.status === 404) {
            console.log(`Goal ${goal.id} not found, skipping update`);
            continue;
          }
          
          if (!res.ok) {
            throw new Error(`Failed to update goal ${goal.id}: ${res.status}`);
          }
        } catch (error) {
          console.error(`Error updating goal ${goal.id}:`, error);
          // Продолжаем с другими целями
        }
      }
      
      setGoals(updatedGoals);
      if (onGoalsUpdate) onGoalsUpdate(updatedGoals);
    } catch (e) {
      console.error('Error updating goal progress:', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingGoal ? `/api/goals/${editingGoal.id}` : '/api/goals';
      const method = editingGoal ? 'PUT' : 'POST';
      
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
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
        loadGoals();
      }
    } catch (e) {
      console.error('Error saving goal:', e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return;
    try {
      const res = await apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Обновляем локальное состояние вместо перезагрузки всех целей
        setGoals(prevGoals => prevGoals.filter(goal => goal.id !== id));
        if (onGoalsUpdate) {
          const updatedGoals = goals.filter(goal => goal.id !== id);
          onGoalsUpdate(updatedGoals);
        }
      } else {
        console.error('Failed to delete goal:', res.status);
      }
    } catch (e) {
      console.error('Error deleting goal:', e);
    }
  };

  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setFormData({
      title: goal.title,
      description: goal.description,
      target_value: goal.target_value,
      unit: goal.unit,
      goal_type: goal.goal_type,
      period: goal.period,
      hr_threshold: goal.hr_threshold || 160,
      duration_threshold: goal.duration_threshold || 120
    });
    setShowAddForm(true);
  };

  const handleGoalTypeChange = (goalType) => {
    const selectedType = GOAL_TYPES.find(t => t.value === goalType);
    setFormData({
      ...formData,
      goal_type: goalType,
      unit: selectedType ? selectedType.unit : '',
      target_value: goalType === 'ftp_vo2max' ? '0' : formData.target_value, // Автоматически устанавливаем 0 для FTP целей
      hr_threshold: goalType === 'ftp_vo2max' ? 160 : formData.hr_threshold,
      duration_threshold: goalType === 'ftp_vo2max' ? 120 : formData.duration_threshold
    });
  };

  const calculateProgress = (goal) => {
    const currentValue = parseFloat(goal.current_value) || 0;
    const targetValue = parseFloat(goal.target_value) || 0;
    
    if (!targetValue || targetValue === 0) return 0;
    const progress = (currentValue / targetValue) * 100;
    return Math.round(Math.min(100, Math.max(0, progress)));
  };

  const getFTPLevel = (minutes) => {
    if (minutes < 30) return { level: 'Low', color: '#bdbdbd' };
    if (minutes < 60) return { level: 'Normal', color: '#4caf50' };
    if (minutes < 120) return { level: 'Good', color: '#4caf50' };
    if (minutes < 180) return { level: 'Excellent', color: '#ff9800' };
    return { level: 'Outstanding', color: '#f44336' };
  };

  const calculateGoalProgress = (goal, activities) => {
    if (!activities || activities.length === 0) return 0;
    
    // Фильтруем активности по периоду цели
    let filteredActivities = activities;
    const now = new Date();
    
    if (goal.period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (goal.period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (goal.period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }
    // 'all' - используем все активности
    
    // Вычисляем прогресс в зависимости от типа цели
    switch (goal.goal_type) {
      case 'distance':
        return filteredActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000; // км
      case 'elevation':
        return filteredActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0); // метры
      case 'time':
        return filteredActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600; // часы
      case 'speed_flat':
        // Плоские маршруты: мало подъемов относительно дистанции
        const flatActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          // Подъем менее 3% от дистанции считается плоским (было 1%)
          return distance > 3000 && elevation < distance * 0.03;
        });
        if (flatActivities.length === 0) return 0;
        // Средняя скорость всех плоских активностей
        const flatSpeeds = flatActivities.map(a => (a.average_speed || 0) * 3.6); // м/с -> км/ч
        const avgSpeed = flatSpeeds.reduce((sum, speed) => sum + speed, 0) / flatSpeeds.length;
        

        
        return avgSpeed;
      case 'speed_hills':
        // Холмистые маршруты: много подъемов относительно дистанции
        const hillActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          // Подъем более 2.5% от дистанции считается холмистым
          return distance > 3000 && elevation >= distance * 0.025;
        });
        if (hillActivities.length === 0) return 0;
        // Средняя скорость всех холмистых активностей
        const hillSpeeds = hillActivities.map(a => (a.average_speed || 0) * 3.6); // м/с -> км/ч
        const avgHillSpeed = hillSpeeds.reduce((sum, speed) => sum + speed, 0) / hillSpeeds.length;
        
        // Отладочная информация для холмистых маршрутов
        console.log(`Hill activities: ${hillActivities.length}`);
        console.log(`Hill speeds:`, hillSpeeds);
        console.log(`Average hill speed: ${avgHillSpeed} km/h`);
        
        // Показываем несколько примеров активностей, которые не прошли фильтр
        const nonHillActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return !(distance > 3000 && elevation >= distance * 0.025);
        }).slice(0, 5);
        
        console.log(`Sample non-hill activities:`, nonHillActivities.map(a => ({
          name: a.name,
          distance: (a.distance || 0) / 1000,
          elevation: a.total_elevation_gain || 0,
          elevationPercent: a.distance ? ((a.total_elevation_gain || 0) / (a.distance || 1) * 100).toFixed(2) : 0
        })));
        
        return avgHillSpeed;
      case 'long_rides':
        return filteredActivities.filter(a => (a.distance || 0) >= 50000).length; // >50km
      case 'intervals':
        return filteredActivities.filter(a => a.type === 'Workout' || a.workout_type === 3).length;
      case 'pulse':
        const pulseActivities = filteredActivities.filter(a => a.average_heartrate && a.average_heartrate > 0);
        if (pulseActivities.length === 0) return 0;
        const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
        return totalPulse / pulseActivities.length; // средний пульс в bpm
      case 'pulse_flat_hills':
        // Фильтруем плоские маршруты (как в speed_flat)
        const flatPulseActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation < distance * 0.03 && a.average_heartrate && a.average_heartrate > 0;
        });
        
        // Фильтруем холмистые маршруты (как в speed_hills)
        const hillPulseActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation >= distance * 0.025 && a.average_heartrate && a.average_heartrate > 0;
        });
        
        // Рассчитываем процент времени в целевых зонах (как в демо)
        const flatsInZone = flatPulseActivities.filter(a => 
          a.average_heartrate && a.average_heartrate >= 109 && a.average_heartrate < 145
        ).length;
        const flatZonePct = flatPulseActivities.length ? Math.round(flatsInZone / flatPulseActivities.length * 100) : 0;
        
        const hillsInZone = hillPulseActivities.filter(a => 
          a.average_heartrate && a.average_heartrate >= 145 && a.average_heartrate < 163
        ).length;
        const hillZonePct = hillPulseActivities.length ? Math.round(hillsInZone / hillPulseActivities.length * 100) : 0;
        
        // Возвращаем средний процент (как в демо)
        if (flatPulseActivities.length && hillPulseActivities.length) {
          return Math.round((flatZonePct + hillZonePct) / 2);
        } else if (flatPulseActivities.length) {
          return flatZonePct;
        } else if (hillPulseActivities.length) {
          return hillZonePct;
        } else {
          return 0;
        }
      case 'ftp_vo2max':
        // Используем ту же логику, что и в PlanPage для консистентности
        const { totalTimeMin } = analyzeHighIntensityTime(filteredActivities, 
          goal.period === '4w' ? 28 : 
          goal.period === '3m' ? 92 : 
          goal.period === 'year' ? 365 : 28,
          {
            hr_threshold: goal.hr_threshold || 160,
            duration_threshold: goal.duration_threshold || 120
          }
        );
        return totalTimeMin;
      case 'recovery':
        return filteredActivities.filter(a => a.type === 'Ride' && (a.average_speed || 0) < 20).length;
      default:
        return parseFloat(goal.current_value) || 0;
    }
  };

  const progressBar = (pct, current, target, unit) => {
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
          {currentValue.toFixed(1)} / {targetValue} {unit}
        </div>
      </>
    );
  };



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
                    value={formData.hr_threshold}
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
                    value={formData.duration_threshold}
                    onChange={(e) => setFormData({...formData, duration_threshold: parseInt(e.target.value)})}
                    placeholder="120"
                  />
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Target Value:</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.target_value}
                  onChange={(e) => setFormData({...formData, target_value: e.target.value})}
                  placeholder={formData.goal_type === 'ftp_vo2max' ? 'Auto-calculated' : 'e.g., 30'}
                  required={formData.goal_type !== 'ftp_vo2max'}
                  disabled={formData.goal_type === 'ftp_vo2max'}
                />
              </div>

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
            const progress = calculateProgress(goal);
            const periodLabel = PERIODS.find(p => p.value === goal.period)?.label;
            
            return (
              <div key={goal.id} className="goal-card">
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
                        const currentValue = parseFloat(goal.current_value) || 0;
                        const targetValue = parseFloat(goal.target_value) || 0;
                        
                        // Получаем время и количество интервалов из той же функции
                        const { totalTimeMin, totalIntervals } = analyzeHighIntensityTime(activities, 
                          goal.period === '4w' ? 28 : 
                          goal.period === '3m' ? 92 : 
                          goal.period === 'year' ? 365 : 28,
                          {
                            hr_threshold: goal.hr_threshold || 160,
                            duration_threshold: goal.duration_threshold || 120
                          }
                        );
                        
                        // Используем рассчитанное время вместо сохраненного в базе
                        const displayValue = totalTimeMin;
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
                            <div className="goal-progress-bar-label" style={{ marginTop: '0.5em', fontSize: '0.8em', color: '#666' }}>
                              Criterion: pulse ≥{goal.hr_threshold || 160} for at least {goal.duration_threshold || 120} seconds in a row
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    progressBar(progress, goal.current_value, goal.target_value, goal.unit)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      </div>
    </div>
  );
} 