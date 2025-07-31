import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import './TrainingDayModal.css';

const TrainingDayModal = ({ 
  isOpen, 
  onClose, 
  dayKey, 
  dayName, 
  currentTraining, 
  onSave,
  userProfile
}) => {
  const [trainingTypes, setTrainingTypes] = useState([]);
  const [isRestDay, setIsRestDay] = useState(currentTraining?.type === 'rest');
  const [selectedType, setSelectedType] = useState(
    currentTraining?.type === 'rest' ? 'rest' : (currentTraining?.type || 'endurance')
  );
  const [loading, setLoading] = useState(false);
  const [trainingParts, setTrainingParts] = useState(
    currentTraining?.parts || []
  );
  const [selectedTypes, setSelectedTypes] = useState([]);

  // Загрузка доступных типов тренировок
  useEffect(() => {
    const loadTrainingTypes = async () => {
      try {
        const response = await apiFetch('/api/training-types');
        if (response.ok) {
          const types = await response.json();
          setTrainingTypes(types);
        }
      } catch (error) {
        console.error('Error loading training types:', error);
      }
    };

    if (isOpen) {
      loadTrainingTypes();
      
      // Восстанавливаем состояние из текущих тренировок
      if (currentTraining?.type === 'rest') {
        setIsRestDay(true);
        setSelectedType('rest');
        setTrainingParts([]);
        setSelectedTypes([]);
      } else if (currentTraining?.parts && currentTraining.parts.length > 0) {
        // Составная тренировка
        setIsRestDay(false);
        setSelectedType('composite');
        setTrainingParts(currentTraining.parts);
        setSelectedTypes([]);
      } else if (currentTraining?.type && currentTraining.type !== 'rest') {
        // Простая тренировка
        setIsRestDay(false);
        setSelectedType(currentTraining.type);
        setTrainingParts([]);
        setSelectedTypes([]);
      } else {
        // Пустое состояние
        setIsRestDay(false);
        setSelectedType('endurance');
        setTrainingParts([]);
        setSelectedTypes([]);
      }
    }
  }, [isOpen, currentTraining]);



  const handleRestDayToggle = () => {
    const newIsRestDay = !isRestDay;
    setIsRestDay(newIsRestDay);
    
    if (newIsRestDay) {
      setSelectedType('rest');
      // Автоматически сохраняем день отдыха
      onSave(dayKey, { type: 'rest', name: 'День отдыха' });
    } else {
      setSelectedType('endurance');
      // Сбрасываем состояние тренировок при переключении обратно
      setTrainingParts([]);
      setSelectedTypes([]);
      
      // Сохраняем пустое состояние
      onSave(dayKey, null);
    }
  };

  const toggleTrainingType = (typeKey) => {
    setSelectedTypes(prev => {
      if (prev.includes(typeKey)) {
        return prev.filter(t => t !== typeKey);
      } else {
        return [...prev, typeKey];
      }
    });
  };

  const addSelectedTypes = () => {
    const newParts = selectedTypes.map(typeKey => ({
      type: typeKey,
      duration: getDefaultDuration(typeKey),
      intensity: getDefaultIntensity(typeKey)
    }));
    const updatedParts = [...trainingParts, ...newParts];
    setTrainingParts(updatedParts);
    setSelectedTypes([]);
    
    // Автоматически сохраняем после добавления
    const selectedTraining = trainingTypes.find(t => t.key === selectedType);
    onSave(dayKey, {
      type: 'composite',
      name: generateCompositeName(updatedParts),
      details: selectedTraining,
      parts: updatedParts
    });
  };

  const removeTrainingPart = (indexToRemove) => {
    const updatedParts = trainingParts.filter((_, index) => index !== indexToRemove);
    setTrainingParts(updatedParts);
    
    // Автоматически сохраняем после удаления
    if (updatedParts.length === 0) {
      // Если удалили все тренировки, сохраняем пустое состояние
      onSave(dayKey, null);
    } else {
      const selectedTraining = trainingTypes.find(t => t.key === selectedType);
      onSave(dayKey, {
        type: 'composite',
        name: generateCompositeName(updatedParts),
        details: selectedTraining,
        parts: updatedParts
      });
    }
  };

  const clearAllTrainings = () => {
    // Очищаем все тренировки и возвращаем в пустое состояние
    setTrainingParts([]);
    setSelectedTypes([]);
    
    // Сохраняем пустое состояние (null или undefined)
    onSave(dayKey, null);
  };

  const generateCompositeName = (parts) => {
    if (parts.length === 1) {
      const training = trainingTypes.find(t => t.key === parts[0].type);
      return training?.name || parts[0].type;
    }
    return `${parts.length} частей`;
  };

  const getDefaultDuration = (type) => {
    const durations = {
      'endurance': 120,
      'tempo': 45,
      'intervals': 30,
      'sweet_spot': 40,
      'recovery': 45,
      'hill_climbing': 60,
      'sprint': 20
    };
    return durations[type] || 60;
  };

  const getDefaultIntensity = (type) => {
    const training = trainingTypes.find(t => t.key === type);
    return training?.intensity || '70-80% FTP';
  };

  // Функция для генерации краткого описания типа тренировки
  const getTrainingDescription = (type) => {
    const descriptions = {
      endurance: 'Long rides for aerobic base development',
      tempo: 'Moderate-high intensity for lactate threshold improvement',
      intervals: 'Short high-intensity intervals for power development',
      sweet_spot: 'Optimal zone for FTP improvement without overtraining',
      recovery: 'Easy rides for recovery and active rest',
      hill_climbing: 'Hill training for leg strength development',
      sprint: 'Maximum efforts for sprint qualities development'
    };
    return descriptions[type] || 'Training for endurance development';
  };



  if (!isOpen) return null;

  return (
    <div className="training-modal-overlay" onClick={onClose}>
      <div className="training-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-content">
            <h3>Training Setup for {dayName}</h3>
            <div className="rest-day-toggle">
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={isRestDay}
                  onChange={handleRestDayToggle}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">Rest Day</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {isRestDay ? (
            <div className="rest-day-content">
              <div className="rest-day-message">
                <div className="rest-icon-large">😴</div>
                <h4>Rest Day</h4>
                <p>Complete recovery and rest from training</p>
              </div>
            </div>
          ) : (
            <div className="composite-training-content">
              <div className="training-parts-header">
                <h4>Select Training Types</h4>
                {selectedTypes.length > 0 && (
                  <button 
                    type="button" 
                    className="btn-add-selected"
                    onClick={addSelectedTypes}
                  >
                    + Add Selected ({selectedTypes.length})
                  </button>
                )}
              </div>

              <div className="training-types-grid">
                {trainingTypes.map((training) => (
                  <div 
                    key={training.key}
                    className={`training-type-card ${selectedTypes.includes(training.key) ? 'selected' : ''}`}
                    onClick={() => toggleTrainingType(training.key)}
                  >
                    <div className="card-header">
                      <div className="card-icon">{training.icon || '🚴'}</div>
                      <div className="card-name">{training.name}</div>
                    </div>
                    <div className="card-details">
                      <div className="card-duration">{getDefaultDuration(training.key)} мин</div>
                      <div className="card-intensity">{training.intensity}</div>
                      {training.cadence && (
                        <div className="card-cadence">Каденс: {training.cadence}</div>
                      )}
                      {training.hr_zones && (
                        <div className="card-hr-zones">Пульс: {training.hr_zones}</div>
                      )}
                    </div>
                    <div className="card-description">
                      {getTrainingDescription(training.key)}
                    </div>
                    {training.benefits && training.benefits.length > 0 && (
                      <div className="card-benefits">
                        <strong>Benefits:</strong>
                        <ul>
                          {training.benefits.slice(0, 2).map((benefit, index) => (
                            <li key={index}>{benefit}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {trainingParts.length > 0 && (
                <div className="added-trainings-section">
                  <div className="added-trainings-header">
                    <h4>Added Trainings</h4>
                    <button 
                      className="btn-clear-all"
                      onClick={clearAllTrainings}
                      title="Clear all trainings"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="added-trainings-list">
                    {trainingParts.map((part, index) => {
                      const training = trainingTypes.find(t => t.key === part.type);
                      return (
                        <div key={index} className="added-training-item">
                          <div className="added-training-info">
                            <div className="added-training-icon">{training?.icon || '🚴'}</div>
                            <div className="added-training-details">
                              <div className="added-training-name">{training?.name || part.type}</div>
                              <div className="added-training-stats">
                                {part.duration} мин • {part.intensity}
                              </div>
                            </div>
                          </div>
                          <button 
                            className="remove-training-btn"
                            onClick={() => removeTrainingPart(index)}
                            title="Remove training"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {trainingParts.length > 0 && (
                <div className="composite-summary">
                  <h4>Summary</h4>
                  <div className="summary-stats">
                                          <div className="summary-item">
                        <strong>Total Time:</strong> {trainingParts.reduce((sum, part) => sum + (part.duration || 0), 0)} min
                      </div>
                      <div className="summary-item">
                        <strong>Number of Parts:</strong> {trainingParts.length}
                      </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingDayModal; 