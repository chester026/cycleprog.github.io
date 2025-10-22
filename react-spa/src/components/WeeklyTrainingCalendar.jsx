import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import TrainingDayModal from './TrainingDayModal';
import TrainingDetailsModal from './TrainingDetailsModal';
import TrainingCard from './TrainingCard';
import TrainingLibraryModal from './TrainingLibraryModal';
import './WeeklyTrainingCalendar.css';

const WeeklyTrainingCalendar = ({ showProfileSettingsProp = false }) => {
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [customPlan, setCustomPlan] = useState({});
  const [trainingTypes, setTrainingTypes] = useState([]);
  const [viewMode, setViewMode] = useState('generated'); // 'generated' или 'manual'
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [showTipsTip, setShowTipsTip] = useState(false);
  const [showAITip, setShowAITip] = useState(false);
  const [showTrainingTypesTip, setShowTrainingTypesTip] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);

  // Загрузка плана тренировок
  const loadTrainingPlan = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiFetch('/api/training-plan');
      setWeeklyPlan(data);
      
      // Загружаем кастомный план в отдельное состояние
      setCustomPlan(data.customPlan || {});
    } catch (err) {
      setError('Ошибка загрузки плана тренировок');
      console.error('Error loading training plan:', err);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка профиля пользователя
  const loadUserProfile = async () => {
    try {
      const profile = await apiFetch('/api/user-profile');
      setUserProfile(profile);
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  };

  // Сохранение профиля пользователя
  const saveUserProfile = async (profileData) => {
    try {
      setSavingProfile(true);
      
      const updatedProfile = await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      
      setUserProfile(updatedProfile);
      setShowProfileSettings(false);
      // Перезагружаем план с новыми настройками
      await loadTrainingPlan();
    } catch (err) {
      setError('Ошибка сохранения профиля');
      console.error('Error saving profile:', err);
    } finally {
      setSavingProfile(false);
    }
  };

  // Обработчик изменения профиля
  const handleProfileChange = (field, value) => {
    setUserProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Обработчик отправки формы профиля
  const handleProfileSubmit = (e) => {
    e.preventDefault();
    saveUserProfile(userProfile);
  };

  // Обработчик клика по дню недели
  const handleDayClick = (dayKey, dayPlan) => {
    setSelectedDay({ key: dayKey, plan: dayPlan });
    setModalOpen(true);
  };

  // Обработчик клика по ссылке "Как ехать?"
  const handleHowToRideClick = (training) => {
    setSelectedTraining(training);
    setDetailsModalOpen(true);
  };

  // Обработчик сохранения тренировки
  const handleSaveTraining = async (dayKey, training) => {
    try {
      // Если training === null, удаляем кастомную тренировку
      if (training === null) {
        await apiFetch(`/api/training-plan/custom/${dayKey}`, {
          method: 'DELETE'
        });
        
        // Перезагружаем план для обновления состояния
        await loadTrainingPlan();
      } else {
        // Сохраняем в базу данных
        await apiFetch('/api/training-plan/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayKey, training })
        });
        
        // Перезагружаем план для обновления состояния
        await loadTrainingPlan();
      }
    } catch (error) {
      console.error('Error saving custom training:', error);
    }
  };

  // Получение тренировки для дня (кастомная или из плана)
  const getDayTraining = (dayKey) => {
    // В ручном режиме показываем только кастомные тренировки
    if (viewMode === 'manual') {
      return customPlan[dayKey] || weeklyPlan?.customPlan?.[dayKey];
    }
    // В сгенерированном режиме показываем оригинальный план
    return customPlan[dayKey] || weeklyPlan?.customPlan?.[dayKey] || weeklyPlan?.plan?.[dayKey];
  };

  // Загрузка типов тренировок
  const loadTrainingTypes = async () => {
    try {
      const types = await apiFetch('/api/training-types');
      setTrainingTypes(types);
    } catch (error) {
      console.error('Error loading training types:', error);
    }
  };

  // Функция для получения всех тренировок из плана (не rest дни)
  const getAllTrainings = () => {
    if (!weeklyPlan?.plan) return [];
    
    const trainings = [];
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    daysOfWeek.forEach(day => {
      const dayPlan = weeklyPlan.plan[day];
      if (dayPlan && dayPlan.type !== 'rest') {
        trainings.push({
          ...dayPlan,
          day: day
        });
      }
    });
    
    return trainings;
  };

  // Функция для сортировки тренировок по приоритетам
  const sortTrainingsByPriority = () => {
    const allTrainings = getAllTrainings();
    const priorities = weeklyPlan?.priorities || [];
    
    // Добавляем score к каждой тренировке на основе индекса в priorities
    const trainingsWithScore = allTrainings.map(training => {
      const priorityIndex = priorities.indexOf(training.trainingType);
      // Чем меньше индекс, тем выше приоритет (инвертируем)
      const score = priorityIndex !== -1 ? (priorities.length - priorityIndex) : 0;
      
      return {
        ...training,
        priorityScore: score
      };
    });
    
    // Сортируем по score (от большего к меньшему)
    return trainingsWithScore.sort((a, b) => b.priorityScore - a.priorityScore);
  };

  // Функция для получения номера недели (для ротации)
  const getWeekNumber = () => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.floor((now - startOfYear) / (7 * 24 * 60 * 60 * 1000));
    return weekNumber % 3; // 3 варианта ротации
  };

  // Функция для ротации Priority Workouts (чтобы каждую неделю был разный порядок)
  const rotatePriorityWorkouts = (trainings) => {
    if (!trainings || trainings.length < 4) return trainings;
    
    const rotated = [...trainings];
    const weekVariation = getWeekNumber();
    
    switch (weekVariation) {
      case 1:
        // Swap 1-й и 2-й элементы
        if (rotated.length > 1) {
          [rotated[0], rotated[1]] = [rotated[1], rotated[0]];
        }
        break;
      case 2:
        // Циклический сдвиг - последний становится первым
        if (rotated.length > 2) {
          const last = rotated.pop();
          rotated.unshift(last);
        }
        break;
      default:
        // Неделя 0 - оставляем исходный порядок
        break;
    }
    
    return rotated;
  };

  // Функция для группировки тренировок
  const groupTrainings = () => {
    const sortedTrainings = sortTrainingsByPriority();
    
    // Применяем ротацию к топ-4 тренировкам для разнообразия
    const top4Trainings = sortedTrainings.slice(0, 4);
    const rotatedTop4 = rotatePriorityWorkouts(top4Trainings);
    
    // Most Recommended - первая тренировка после ротации
    const mostRecommended = rotatedTop4[0];
    
    // Оставшиеся 3 приоритетные тренировки (2-4) после ротации
    const priorityTrainings = rotatedTop4.slice(1, 4);
    
    return {
      mostRecommended: mostRecommended,
      priority: priorityTrainings,
      all: sortedTrainings
    };
  };

  // Загрузка данных при монтировании компонента
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        loadTrainingPlan(),
        loadUserProfile(),
        loadTrainingTypes()
      ]);
    };
    
    loadData();
  }, []);

  // Получение названия дня недели
    const getDayName = (dayKey) => {
    const dayNames = {
      monday: 'Mon',
      tuesday: 'Tue', 
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun'
    };
    return dayNames[dayKey] || dayKey;
  };

  // Получение полного названия дня недели
    const getFullDayName = (dayKey) => {
    const dayNames = {
      monday: 'Monday',
      tuesday: 'Tuesday', 
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday'
    };
    return dayNames[dayKey] || dayKey;
  };

  // Функция для генерации краткого описания составной тренировки
  const getCompositeDescription = (parts) => {
    if (!parts || parts.length === 0) return '';
    
    const totalDuration = parts.reduce((sum, part) => sum + (parseInt(part.duration) || 0), 0);
    const mainTypes = parts.map(part => {
      const trainingType = trainingTypes.find(t => t.key === part.type);
      return trainingType?.name || part.type;
    });
    
    const uniqueTypes = [...new Set(mainTypes)];
    
          let description = `${totalDuration} min`;
    if (uniqueTypes.length > 0) {
      description += ` • ${uniqueTypes.join(' + ')}`;
    }
    
    return description;
  };



  // Рендер дня календаря
  const renderCalendarDay = (dayKey, dayPlan) => {
    if (!dayPlan) return null;

    const currentTraining = getDayTraining(dayKey);
    const isCustom = customPlan[dayKey] || weeklyPlan?.customPlan?.[dayKey];
    
    if (viewMode === 'generated') {
      // Режим сгенерированного плана - только для просмотра

      const hasDetails = dayPlan.details;
      const isTraining = dayPlan.type !== 'rest';
      
      return (
        <div 
          key={dayKey} 
          className={`calendar-day ${dayPlan.type}`}
          data-type={dayPlan.trainingType}
          style={{ cursor: 'default' }}
        >
          <div className="day-header">
            <span className="day-name">{getDayName(dayKey)}</span>
            <span className="day-type">
              {dayPlan.type === 'rest' ? 'Отдых' : dayPlan.name || 'Тренировка'}
            </span>
          </div>
          <div className="day-content">
            {dayPlan.type === 'rest' ? (
              <div className="rest-day-content">
                <div className="rest-icon">
                  <span className="material-symbols-outlined">bed</span>
                </div>
                <div className="rest-text">Rest day</div>
                {dayPlan.recommendation && (
                  <div className="recommendation">{dayPlan.recommendation}</div>
                )}
              </div>
            ) : dayPlan.type !== 'rest' && hasDetails ? (
              <div className="workout-details">
                <div className="recommendation">{dayPlan.recommendation}</div>
                
                {/* Дополнительная информация о тренировке */}
                {dayPlan.details && (
                  <div style={{ 
                    fontSize: '0.7rem', 
                    color: '#666', 
                    marginTop: '8px',
                    lineHeight: '1.3'
                  }}>
                    {dayPlan.details.intensity && (
                      <div><strong>Intencity:</strong> {dayPlan.details.intensity}</div>
                    )}
                   
                    {dayPlan.details.cadence && (
                      <div><strong>Cadence:</strong> {dayPlan.details.cadence}</div>
                    )}
                    {dayPlan.details.hr_zones && (
                      <div><strong>HR:</strong> {dayPlan.details.hr_zones}</div>
                    )}
                  </div>
                )}
                
                <button 
                  className="how-to-ride-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHowToRideClick(dayPlan);
                  }}
                >
                  How to train?
                </button>
              </div>
            ) : null}
          </div>
        </div>
      );
    } else {
      // Режим ручного плана - показываем только кастомные тренировки
      const displayClass = isCustom ? 'custom' : 'empty';
      
      return (
        <div 
          key={dayKey} 
          className={`calendar-day ${displayClass}`}
          data-type={currentTraining?.type || 'empty'}
          onClick={() => handleDayClick(dayKey, currentTraining || null)}
          style={{ cursor: 'pointer' }}
        >
          <div className="day-header">
            <span className="day-name">{getDayName(dayKey)}</span>
            <span className="day-type">
              {currentTraining?.type === 'rest' ? 'Rest' : currentTraining?.type ? 'Training' : 'Empty'}
            </span>
            {isCustom && <span className="custom-indicator">✏️</span>}
          </div>
          <div className="day-content">
            {currentTraining?.type === 'composite' && currentTraining?.parts ? (
              <div className="composite-workout-details">
                <div style={{ 
                  fontSize: '0.8rem', 
                  color: '#666', 
                  marginBottom: '8px',
                  fontWeight: 500
                }}>
                  {getCompositeDescription(currentTraining.parts)}
                </div>
                {currentTraining.parts.map((part, index) => (
                  <div key={index} className="workout-part">
                    <div className="part-name">
                      {trainingTypes.find(t => t.key === part.type)?.name || part.type}
                    </div>
                    <div className="part-info">
                      <span>{part.duration} min</span>
                      <span>{part.intensity}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : currentTraining?.type === 'rest' ? (
              <div className="rest-day-content">
                <div className="rest-icon">😴</div>
                <div className="rest-text">Rest day</div>
              </div>
            ) : currentTraining?.details && currentTraining?.type !== 'rest' ? (
              <div className="workout-details">
                <div><strong>Intensity:</strong> {currentTraining.details.intensity}</div>
                <div><strong>Duration:</strong> {currentTraining.details.duration}</div>
                <div><strong>Cadence:</strong> {currentTraining.details.cadence}</div>
              </div>
            ) : !currentTraining ? (
              <div className="empty-day-content">
                <div className="empty-icon">+</div>
                <div className="empty-text">Add training</div>
              </div>
            ) : null}
          </div>
        </div>
      );
    }
  };

  // Рендер Training Center (AI-Generated режим)
  const renderTrainingCenter = () => {
    const grouped = groupTrainings();
    
    return (
      <div className="training-center">
        {/* Топ-4 приоритетные тренировки */}
        <div className="training-section">
        
          <div className="priority-grid">
            {/* Most Recommended - первая карточка */}
            {grouped.mostRecommended && (
              <TrainingCard
                key={`most-recommended-${grouped.mostRecommended.day}-${grouped.mostRecommended.trainingType}`}
                cardId={`training-most-recommended-${grouped.mostRecommended.trainingType}`}
                cardClass="priority-workout-card most-recommended-card"
                title={grouped.mostRecommended.name}
                description={grouped.mostRecommended.recommendation}
                intensity={grouped.mostRecommended.details?.intensity}
                duration={grouped.mostRecommended.details?.duration}
                trainingType={grouped.mostRecommended.trainingType}
                size="normal"
                variant="most-recommended"
                showBadge={true}
                badgeText="Most Recommended"
                onClick={() => handleHowToRideClick(grouped.mostRecommended)}
              />
            )}
            
            {/* Оставшиеся 3 приоритетные тренировки */}
            {grouped.priority.map((training, index) => (
              <TrainingCard
                key={`priority-${training.day}-${training.trainingType}`}
                cardId={`training-priority-${index + 1}-${training.trainingType}`}
                cardClass={`priority-workout-card priority-card-${index + 1}`}
                title={training.name}
                description={training.recommendation}
                intensity={training.details?.intensity}
                duration={training.details?.duration}
                trainingType={training.trainingType}
                size="normal"
                variant="priority"
                showBadge={true}
                badgeText="Recommended"
                onClick={() => handleHowToRideClick(training)}
              />
            ))}
          </div>
        </div>

        {/* Секция Recovery + Preferable + More */}
        <div className="training-section secondary-section">
        
          <div className="secondary-grid">
            {/* Recovery Strategy - статическая карточка */}
            <div className="recovery-card-wrapper">
              <div className="recovery-strategy-card">
                <div>
                <div className="training-card-badge">
                  <span className="material-symbols-outlined">auto_awesome</span>
                  <span>AI-powered feature</span>
                </div>
                <h3>Recovery Strategy</h3>
                <p>Smart recovery recommendations based on your training load and progress. AI-powered analysis coming soon.</p>
                </div>
                <button className="training-card-btn">Will be available soon</button>
              </div>
              <span className="material-symbols-outlined"> health_and_safety</span>
            </div>

            {/* Preferable + More trainings */}
            <div className="preferable-more-wrapper">
              <div className="preferable-grid">
                {/* Recovery тренировка - статическая */}
                <TrainingCard
                  title="Recovery Ride"
                  description="Easy spinning for active recovery"
                  intensity="50-65% FTP"
                  duration="45"
                  trainingType="recovery"
                  size="small"
                  variant="preferable"
                  showBadge={true}
                  badgeText="+ Preferable"
                  onClick={() => handleHowToRideClick({
                    name: 'Recovery',
                    type: 'recovery',
                    trainingType: 'recovery',
                    recommendation: 'Easy spinning for active recovery',
                    details: {
                      intensity: '50-65% FTP',
                      duration: '45 min',
                      cadence: '70-80 rpm',
                      hr_zones: 'Z1-Z2',
                      benefits: [
                        'Accelerate recovery',
                        'Improve blood circulation'
                      ]
                    }
                  })}
                />
                
                {/* Group Ride тренировка - статическая */}
                <TrainingCard
                  title="Group Ride"
                  description="Social training with variable intensity"
                  intensity="70-90% FTP"
                  duration="120"
                  trainingType="group_ride"
                  size="small"
                  variant="preferable"
                  showBadge={true}
                  badgeText="+ Preferable"
                  onClick={() => handleHowToRideClick({
                    name: 'Group Ride',
                    type: 'group_ride',
                    trainingType: 'group_ride',
                    recommendation: 'Social training with variable intensity',
                    details: {
                      intensity: '70-90% FTP',
                      duration: '120 min',
                      cadence: '80-95 rpm',
                      hr_zones: 'Z2-Z4',
                      benefits: [
                        'Develop group riding skills',
                        'Social aspect of training'
                      ]
                    }
                  })}
                />
                
                {/* Кнопка More trainings */}
                <div 
                  className="more-trainings-card"
                  onClick={() => setLibraryModalOpen(true)}
                >
                 <div>
                 <h3>More Trainings</h3>
                 <p>If you feel frustrating about recomended trainings you can find many more here</p>
                 </div>
                 
                  <span className="training-card-btn">EXPLORE MORE →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Рендер анализа целей
  const renderGoalsAnalysis = () => {
    if (!weeklyPlan?.analysis || weeklyPlan.analysis.length === 0) return null;

    return (
      <div className="goals-analysis">
        <h4>Goal Priority Analysis</h4>
        {weeklyPlan.analysis.map((goal, index) => (
          <div key={index} className="goal-priority">
            <div className="goal-info">
              <div className="goal-name">{goal.goalType}</div>
              <div className="goal-progress">
                Progress: {(goal.progress || 0).toFixed(1)}% ({goal.currentValue || 0} / {goal.targetValue || 0} {goal.unit || ''})
              </div>
            </div>
            <div className="goal-priority-score">
              {(goal.priority || 0).toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Функция для рендера настроек профиля
  const renderProfileSettings = () => {
    if (!userProfile || !showProfileSettings) return null;

    return (
      <div className="profile-settings"> 
        <form onSubmit={handleProfileSubmit} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                Experience Level:
              </label>
              <select 
                value={userProfile?.experience_level || 'intermediate'} 
                onChange={(e) => handleProfileChange('experience_level', e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  fontSize: '0.9rem',
                  background: 'white'
                }}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                Training Time (hours per week):
              </label>
              <input 
                type="number" 
                min="1" 
                max="10"
                value={userProfile?.time_available || 5} 
                onChange={(e) => handleProfileChange('time_available', parseInt(e.target.value))}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  fontSize: '0.9rem',
                  background: 'white'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                Number of Workouts per Week:
              </label>
              <select 
                value={userProfile?.workouts_per_week || 5} 
                onChange={(e) => {
                  const newWorkoutsPerWeek = parseInt(e.target.value);
                  const currentDays = userProfile?.preferred_days || [];
                  
                  // Если новое количество меньше выбранных дней, обрезаем список
                  if (newWorkoutsPerWeek < currentDays.length) {
                    const trimmedDays = currentDays.slice(0, newWorkoutsPerWeek);
                    handleProfileChange('preferred_days', trimmedDays);
                  }
                  
                  handleProfileChange('workouts_per_week', newWorkoutsPerWeek);
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  fontSize: '0.9rem',
                  background: 'white'
                }}
              >
                <option value="3">3 workouts</option>
                <option value="4">4 workouts</option>
                <option value="5">5 workouts</option>
                <option value="6">6 workouts</option>
                <option value="7">7 workouts</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff', marginBottom: '8px' }}>
                Preferred Training Days:
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                gap: '8px'
              }}>
                {[
                  { key: 'monday', label: 'Monday' },
                  { key: 'tuesday', label: 'Tuesday' },
                  { key: 'wednesday', label: 'Wednesday' },
                  { key: 'thursday', label: 'Thursday' },
                  { key: 'friday', label: 'Friday' },
                  { key: 'saturday', label: 'Saturday' },
                  { key: 'sunday', label: 'Sunday' }
                ].map(day => (
                  <label key={day.key} className={`day-checkbox ${(userProfile?.preferred_days || []).includes(day.key) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={(userProfile?.preferred_days || []).includes(day.key)}
                      onChange={(e) => {
                        const currentDays = userProfile?.preferred_days || [];
                        const workoutsPerWeek = userProfile?.workouts_per_week || 5;
                        
                        if (e.target.checked) {
                          // Проверяем, не превышает ли количество дней количество тренировок
                          if (currentDays.length >= workoutsPerWeek) {
                            alert(`You can only select up to ${workoutsPerWeek} training days per week.`);
                            return;
                          }
                          const newDays = [...currentDays, day.key];
                          handleProfileChange('preferred_days', newDays);
                        } else {
                          const newDays = currentDays.filter(d => d !== day.key);
                          handleProfileChange('preferred_days', newDays);
                        }
                      }}
                      style={{ margin: 0 }}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: '#ccc',
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                Selected days will have training sessions. Other days will be rest days.
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: '#4caf50',
                marginTop: '4px',
                fontWeight: '500'
              }}>
                Selected: {(userProfile?.preferred_days || []).length} / {userProfile?.workouts_per_week || 5} days
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={savingProfile}
              style={{
                gridColumn: '1 / -1',
                background: '#274dd3',
                color: 'white',
                border: 'none',
                padding: '10px 16px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'block',
              }}
            >
              {savingProfile ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
      </div>
    );
  };

  // Состояние загрузки
  if (loading) {
    return (
      <div className="weekly-calendar">
        
        <div className="calendar-loading">
          <div className="spinner"></div>
          Loading training plan...
        </div>
      </div>
    );
  }

  // Состояние ошибки
  if (error) {
    return (
      <div className="weekly-calendar"> <h3>Weekly Training Recommendations</h3>
        <div className="calendar-message">
          <h4>Loading Error</h4>
          <p>{error}</p>
          <button 
            onClick={loadTrainingPlan}
            style={{
              background: '#667eea',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Удалено - теперь всегда показываем план, даже если нет целей

  // Основной рендер
  return (
    <div className="weekly-calendar">
      {/* Уведомление о fallback плане */}
      {weeklyPlan?.isFallbackPlan && (
        <div className="fallback-plan-notice">
          <span className="material-symbols-outlined">info</span>
          <div className="fallback-plan-text">
            <strong>Basic Training Plan</strong>
            <p>{weeklyPlan.fallbackMessage}</p>
          </div>
        </div>
      )}
      
      <div className="calendar-header">
       
        <div className="view-mode-toggle">
          <button 
            className={`toggle-btn ${viewMode === 'generated' ? 'active' : ''}`}
            onClick={() => setViewMode('generated')}
          >
            <span className="material-symbols-outlined">star_shine</span> AI-Generated
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'manual' ? 'active' : ''}`}
            onClick={() => setViewMode('manual')}
          >
            Manual Plan
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Ссылка "How it works" для AI */}
          <span
            style={{
              color: '#274dd3',
              cursor: 'pointer',
              fontSize: '14px',
              marginRight: '16px',
              fontWeight: 700
            }}
            onMouseEnter={() => setShowAITip(true)}
            onMouseLeave={() => setShowAITip(false)}
            title="How AI generates your plan"
          >
            How it works?
          </span>
          {showAITip && (
            <div style={{
              position: 'absolute',
              top: 50,
              right: 140,
              background: '#23272f',
              color: '#f6f8ff',
              border: '1.5px solid #7eaaff',
              borderRadius: 8,
              padding: '16px',
              fontSize: 14,
              zIndex: 10,
              width: 400,
              boxShadow: '0 2px 12px #0005',
              whiteSpace: 'normal',
              lineHeight: '1.6'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <strong>Goal Analysis:</strong> AI analyzes your current goals and progress to determine training priorities.
              </div>
              <div style={{ marginBottom: '12px' }}>
                <strong>Fitness Assessment:</strong> Your recent activities help assess current fitness level and areas for improvement.
              </div>
              <div style={{ marginBottom: '12px' }}>
                <strong>Personalization:</strong> Training types are selected based on your experience level, available time, and preferences.
              </div>
              <div>
                <strong>Adaptive Updates:</strong> The plan automatically adjusts as you progress and achieve your goals.
              </div>
            </div>
          )}

          {/* Вопросик для типов тренировок */}
          <span
            style={{
              display: 'none',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#353a44',
              color: '#fff',
              opacity: 0.7,
              fontWeight: 700,
              fontSize: 17,
              textAlign: 'center',
              lineHeight: '22px',
              cursor: 'pointer',
              border: '1.5px solid #444',
              boxShadow: '0 1px 4px #0002'
            }}
            onMouseEnter={() => setShowTrainingTypesTip(true)}
            onMouseLeave={() => setShowTrainingTypesTip(false)}
            title="Available training types"
          >
            🚴
          </span>
          {showTrainingTypesTip && (
            <div style={{
              position: 'absolute',
              top: 60,
              right: 80,
              background: '#23272f',
              color: '#f6f8ff',
              border: '1.5px solid #7eaaff',
              borderRadius: 8,
              padding: '16px',
              fontSize: 14,
              zIndex: 10,
              width: 500,
              boxShadow: '0 2px 12px #0005',
              whiteSpace: 'normal',
              lineHeight: '1.6'
            }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '12px',
                fontSize: '13px'
              }}>
                <div><strong>Endurance:</strong> Long rides for aerobic base</div>
                <div><strong>Tempo:</strong> Sustained efforts for lactate threshold</div>
                <div><strong>Intervals:</strong> High-intensity intervals for VO2max</div>
                <div><strong>Sweet Spot:</strong> Optimal FTP improvement zone</div>
                <div><strong>Threshold:</strong> Lactate threshold training</div>
                <div><strong>Over/Under:</strong> Variable intensity intervals</div>
                <div><strong>Pyramid:</strong> Progressive intensity intervals</div>
                <div><strong>Cadence:</strong> Pedaling technique work</div>
                <div><strong>Strength:</strong> Low cadence power work</div>
                <div><strong>Hill Climbing:</strong> Specific climbing training</div>
                <div><strong>Time Trial:</strong> Race simulation</div>
                <div><strong>Group Ride:</strong> Social training sessions</div>
              </div>
            </div>
          )}

          {/* Вопросик для советов */}
          <span
            style={{
              display: 'none',
              width: 22,
              height: 22,
              borderRadius: '50%',
             
              color: '#000',
              opacity: 0.7,
              fontWeight: 700,
              fontSize: 17,
              textAlign: 'center',
              lineHeight: '22px',
              cursor: 'pointer',
             
             
            }}
            onMouseEnter={() => setShowTipsTip(true)}
            onMouseLeave={() => setShowTipsTip(false)}
            title="Training tips and recommendations"
          >
           <span className="material-symbols-outlined">info</span> Tips
          </span>
          {showTipsTip && (
            <div style={{
              position: 'absolute',
              top: 60,
              right: 40,
              background: '#23272f',
              color: '#f6f8ff',
              border: '1.5px solid #7eaaff',
              borderRadius: 8,
              padding: '16px',
              fontSize: 14,
              zIndex: 10,
              width: 450,
              boxShadow: '0 2px 12px #0005',
              whiteSpace: 'normal',
              lineHeight: '1.6'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <strong>Weekly Structure:</strong> 2-3 high-intensity sessions, 2-3 endurance/recovery rides, 1-2 rest days
              </div>
              <div style={{ marginBottom: '12px' }}>
                <strong>Recovery Guidelines:</strong> Listen to your body, quality sleep, proper nutrition, active recovery
              </div>
              <div>
                <strong>Progression Tips:</strong> Increase volume by 10% weekly, maintain intensity for 3-4 weeks, include recovery weeks
              </div>
            </div>
          )}

          <button 
            className="settings-btn"
            onClick={() => setShowProfileSettings(!showProfileSettings)}
          >
            Personal settings
          </button>
        </div>
      </div>
      
      {/* Условный рендер в зависимости от режима */}
      {viewMode === 'generated' ? (
        renderTrainingCenter()
      ) : (
        <div className="calendar-grid">
          {weeklyPlan?.plan && Object.entries(weeklyPlan.plan).map(([dayKey, dayPlan]) => 
            renderCalendarDay(dayKey, dayPlan)
          )}
        </div>
      )}

      {renderGoalsAnalysis()}



      {/* Модальное окно для настройки тренировки */}
      <TrainingDayModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        dayKey={selectedDay?.key}
        dayName={selectedDay?.key ? getFullDayName(selectedDay.key) : ''}
        currentTraining={selectedDay?.plan}
        onSave={handleSaveTraining}
        userProfile={userProfile}
      />

      {/* Модальное окно с деталями тренировки */}
      <TrainingDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        training={selectedTraining}
      />

      {/* Модальное окно с библиотекой тренировок */}
      <TrainingLibraryModal
        isOpen={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onTrainingClick={(trainingType) => {
          // При клике на тип тренировки создаем объект тренировки для модалки деталей
          const trainingData = {
            name: trainingType.name,
            type: trainingType.key,
            trainingType: trainingType.key,
            recommendation: trainingType.description,
            details: {
              intensity: trainingType.intensity,
              duration: trainingType.duration,
              cadence: trainingType.cadence,
              hr_zones: trainingType.hr_zones,
              structure: trainingType.structure,
              benefits: trainingType.benefits
            }
          };
          handleHowToRideClick(trainingData);
          setLibraryModalOpen(false);
        }}
      />

      {renderProfileSettings()}
    </div>
  );
};

export default WeeklyTrainingCalendar; 