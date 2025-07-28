import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { analyzeHighIntensityTime } from '../utils/vo2max';
import './GoalsManager.css';



export default function GoalsManager({ activities, onGoalsUpdate, isOpen, onClose, initialGoals = [] }) {
  const [goals, setGoals] = useState(initialGoals);
  const [loading, setLoading] = useState(false);
  const prevGoalsRef = useRef(initialGoals);
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

  useEffect(() => {
    if (initialGoals.length === 0) {
      loadGoals();
    } else {
      setGoals(initialGoals);
    }
  }, [initialGoals]);



  // Вызываем onGoalsUpdate когда изменяется состояние goals
  useEffect(() => {
    if (onGoalsUpdate && goals && JSON.stringify(goals) !== JSON.stringify(prevGoalsRef.current)) {
      // Добавляем небольшую задержку для предотвращения частых вызовов
      const timeoutId = setTimeout(() => {
        prevGoalsRef.current = goals;
        onGoalsUpdate(goals);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [goals, onGoalsUpdate]);



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
        setGoals(data || []);
      } else {
        console.error('Failed to load goals:', res.status, res.statusText);
        setGoals([]);
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
        
        // После создания цели сразу обновляем её значение в базе данных
        if (activities.length > 0) {
          const newGoal = await res.json();
          const currentValue = calculateGoalProgress(newGoal, activities);
          
          // Обновляем цель с правильным значением
          await apiFetch(`/api/goals/${newGoal.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: newGoal.title,
              description: newGoal.description,
              target_value: newGoal.target_value,
              current_value: currentValue,
              unit: newGoal.unit,
              goal_type: newGoal.goal_type,
              period: newGoal.period
            })
          });
        }
        
        await loadGoals();
      }
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
      const res = await apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Добавляем небольшую задержку для стабилизации
        setTimeout(() => {
          setGoals(prevGoals => prevGoals.filter(goal => goal.id !== id));
        }, 100);
      } else if (res.status === 404) {
        // Если цель не найдена, удаляем её из локального состояния
        setTimeout(() => {
          setGoals(prevGoals => prevGoals.filter(goal => goal.id !== id));
        }, 100);
      } else {
        console.error('Failed to delete goal:', res.status);
      }
    } catch (e) {
      console.error('Error deleting goal:', e);
      // В случае ошибки также удаляем из локального состояния
      setTimeout(() => {
        setGoals(prevGoals => prevGoals.filter(goal => goal.id !== id));
      }, 100);
    }
  }, [goals]);

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

  const calculateGoalProgress = (goal, activities) => {
    try {
      if (!activities || activities.length === 0) return 0;
      if (!goal || !goal.goal_type) return 0;
    
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
        const totalMovingTime = filteredActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
        const totalHours = totalMovingTime / 3600;
        return totalHours;
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
        
        return avgHillSpeed;
      case 'long_rides':
        return filteredActivities.filter(a => (a.distance || 0) >= 50000).length; // >50km
      case 'intervals':
        const intervalActivities = filteredActivities.filter(a => {
          // 1. Проверяем тип активности (базовая логика)
          if (a.type === 'Workout' || a.workout_type === 3) {
            
            return true;
          }
          
          // 2. Анализируем название активности
          const name = (a.name || '').toLowerCase();
          const intervalKeywords = [
            'интервал', 'interval', 'tempo', 'темпо', 'threshold', 'порог',
            'vo2max', 'vo2', 'анаэробный', 'anaerobic', 'фартлек', 'fartlek',
            'спринт', 'sprint', 'ускорение', 'acceleration', 'повтор', 'repeat',
            'серия', 'series', 'блок', 'block', 'пирамида', 'pyramid'
          ];
          
          if (intervalKeywords.some(keyword => name.includes(keyword))) {
            
            return true;
          }
          
          // 3. Анализируем скоростные паттерны (если есть данные о скорости)
          if (a.average_speed && a.max_speed) {
            const avgSpeed = a.average_speed * 3.6; // м/с -> км/ч
            const maxSpeed = a.max_speed * 3.6;
            const speedVariation = maxSpeed / avgSpeed;
            
            // Если максимальная скорость значительно выше средней - это может быть интервал
            if (speedVariation > 1.4 && avgSpeed > 25) {
              
              return true;
            }
          }
          
          return false;
        });
        
        
        return intervalActivities.length;
      case 'pulse':
        const pulseActivities = filteredActivities.filter(a => a.average_heartrate && a.average_heartrate > 0);
        if (pulseActivities.length === 0) return 0;
        const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
        return totalPulse / pulseActivities.length; // средний пульс в bpm
      case 'avg_hr_flat':
        // Средний пульс на плоских маршрутах
        const flatPulseActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation < distance * 0.03 && a.average_heartrate && a.average_heartrate > 0;
        });
        
        if (flatPulseActivities.length === 0) return 0;
        const flatAvgHR = flatPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / flatPulseActivities.length;
        return Math.round(flatAvgHR);
        
      case 'avg_hr_hills':
        // Средний пульс на холмистых маршрутах
        const hillPulseActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation >= distance * 0.025 && a.average_heartrate && a.average_heartrate > 0;
        });
        
        if (hillPulseActivities.length === 0) return 0;
        const hillAvgHR = hillPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / hillPulseActivities.length;
        return Math.round(hillAvgHR);
      case 'avg_power':
        // Расчет средней мощности по формулам Strava
        const powerActivities = filteredActivities.filter(a => a.distance > 1000); // только поездки больше 1км
        if (powerActivities.length === 0) return 0;
        
        // Константы для расчетов (по данным Strava)
        const GRAVITY = 9.81; // м/с²
        const AIR_DENSITY_SEA_LEVEL = 1.225; // кг/м³ (стандартная плотность воздуха на уровне моря)
        const CD_A = 0.4; // аэродинамический профиль
        const CRR = 0.005; // коэффициент сопротивления качению (асфальт)
        const RIDER_WEIGHT = 75; // кг (можно сделать настраиваемым)
        const BIKE_WEIGHT = 8; // кг
        
        // Функция для расчета плотности воздуха с учетом температуры и высоты
        const calculateAirDensity = (temperature, elevation) => {
          // Температура в Кельвинах (если передана в Цельсиях)
          const tempK = temperature ? temperature + 273.15 : 288.15; // 15°C по умолчанию
          
          // Высота над уровнем моря в метрах
          const heightM = elevation || 0;
          
          // Формула для расчета плотности воздуха с учетом температуры и высоты
          // Атмосферное давление на высоте (барометрическая формула)
          const pressureAtHeight = 101325 * Math.exp(-heightM / 7400); // Па
          
          // Плотность воздуха = давление / (R * температура)
          // R = 287.05 Дж/(кг·К) - газовая постоянная для воздуха
          const R = 287.05;
          const density = pressureAtHeight / (R * tempK);
          
          return density;
        };
        
        const totalWeight = RIDER_WEIGHT + BIKE_WEIGHT;
        
        const powerValues = powerActivities.map(activity => {
          const distance = parseFloat(activity.distance) || 0;
          const time = parseFloat(activity.moving_time) || 0;
          const elevationGain = parseFloat(activity.total_elevation_gain) || 0;
          const averageSpeed = parseFloat(activity.average_speed) || 0;
          
          // Получаем данные о температуре и высоте
          const temperature = activity.average_temp; // °C
          const maxElevation = activity.elev_high; // максимальная высота в метрах
          
          // Рассчитываем плотность воздуха с учетом температуры и высоты
          const airDensity = calculateAirDensity(temperature, maxElevation);
          
          if (distance <= 0 || time <= 0 || averageSpeed <= 0) return 0;
          
          // Средний уклон
          const averageGrade = elevationGain / distance;
          
          // Гравитационная сила
          let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
          
          // Сопротивление качению
          const rollingPower = CRR * totalWeight * GRAVITY * averageSpeed;
          
          // Аэродинамическое сопротивление
          const aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);
          
          // Общая мощность
          let totalPower = rollingPower + aeroPower;
          
          if (averageGrade > 0) {
            totalPower += gravityPower;
          } else {
            totalPower += gravityPower;
            const minPowerOnDescent = 20;
            totalPower = Math.max(minPowerOnDescent, totalPower);
          }
          
          return isNaN(totalPower) || totalPower < 0 || totalPower > 10000 ? 0 : totalPower;
        }).filter(power => power > 0);
        
        if (powerValues.length === 0) return 0;
        return Math.round(powerValues.reduce((sum, power) => sum + power, 0) / powerValues.length);
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
    } catch (error) {
      console.error('Error in calculateGoalProgress:', error);
      return 0;
    }
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

  const updateGoalProgress = useCallback(async () => {
    if (!goals || goals.length === 0 || !activities || activities.length === 0) {
      return;
    }
    
    try {
      // Рассчитываем прогресс на фронтенде
      const updatedGoals = goals.map(goal => {
        try {
          const currentValue = calculateGoalProgress(goal, activities);
          return { ...goal, current_value: currentValue };
        } catch (error) {
          console.error('Error calculating progress for goal:', goal.id, error);
          return { ...goal, current_value: 0 };
        }
      });
      
      // Проверяем, действительно ли есть изменения
      const hasChanges = updatedGoals.some((updatedGoal, index) => {
        const originalGoal = goals[index];
        return updatedGoal.current_value !== originalGoal.current_value;
      });
      
      if (hasChanges) {
        setGoals(updatedGoals);
      }
    } catch (e) {
      console.error('Error updating goal progress:', e);
    }
  }, [goals, activities]);

  // useEffect для обновления прогресса целей
  useEffect(() => {
    if (activities && activities.length > 0 && goals && goals.length > 0) {
      try {
        updateGoalProgress();
      } catch (error) {
        console.error('Error in useEffect updateGoalProgress:', error);
      }
    }
  }, [activities, goals.length, updateGoalProgress]);

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
            try {
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