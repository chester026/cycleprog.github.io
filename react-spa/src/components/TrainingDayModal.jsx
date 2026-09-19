import React, { useEffect, useState } from 'react';
import { useTrainingTypes, useSaveCustomTraining, useDeleteCustomTraining } from '../data/hooks';
import { Modal } from '../ui';
import dialogReset from './training/ModalDialogReset.module.css';
import './TrainingDayModal.css';

const TrainingDayModal = ({ isOpen, onClose, dayKey, dayName, currentTraining }) => {
  const { data: trainingTypes = [] } = useTrainingTypes(isOpen);
  const saveCustomTraining = useSaveCustomTraining();
  const deleteCustomTraining = useDeleteCustomTraining();

  const [isRestDay, setIsRestDay] = useState(currentTraining?.type === 'rest');
  const [selectedType, setSelectedType] = useState(
    currentTraining?.type === 'rest' ? 'rest' : currentTraining?.type || 'endurance'
  );
  const [trainingParts, setTrainingParts] = useState(currentTraining?.parts || []);
  const [selectedTypes, setSelectedTypes] = useState([]);

  // Restores the editor's local state from `currentTraining` whenever the
  // modal opens for a (possibly different) day.
  useEffect(() => {
    if (!isOpen) return;

    if (currentTraining?.type === 'rest') {
      setIsRestDay(true);
      setSelectedType('rest');
      setTrainingParts([]);
      setSelectedTypes([]);
    } else if (currentTraining?.parts && currentTraining.parts.length > 0) {
      setIsRestDay(false);
      setSelectedType('composite');
      setTrainingParts(currentTraining.parts);
      setSelectedTypes([]);
    } else if (currentTraining?.type && currentTraining.type !== 'rest') {
      setIsRestDay(false);
      setSelectedType(currentTraining.type);
      setTrainingParts([]);
      setSelectedTypes([]);
    } else {
      setIsRestDay(false);
      setSelectedType('endurance');
      setTrainingParts([]);
      setSelectedTypes([]);
    }
  }, [isOpen, currentTraining]);

  // `training === null` deletes the day's custom training (reverting it to
  // the generated plan / empty); otherwise it's saved as-is.
  const saveTraining = (training) => {
    if (training === null) {
      deleteCustomTraining.mutate(dayKey);
    } else {
      saveCustomTraining.mutate({ dayKey, training });
    }
  };

  const handleRestDayToggle = () => {
    const newIsRestDay = !isRestDay;
    setIsRestDay(newIsRestDay);

    if (newIsRestDay) {
      setSelectedType('rest');
      saveTraining({ type: 'rest', name: 'Rest day' });
    } else {
      setSelectedType('endurance');
      setTrainingParts([]);
      setSelectedTypes([]);
      saveTraining(null);
    }
  };

  const toggleTrainingType = (typeKey) => {
    setSelectedTypes((prev) => (prev.includes(typeKey) ? prev.filter((t) => t !== typeKey) : [...prev, typeKey]));
  };

  const getDefaultDuration = (type) => {
    const durations = {
      endurance: 120,
      tempo: 45,
      intervals: 30,
      sweet_spot: 40,
      recovery: 45,
      hill_climbing: 60,
      sprint: 20,
    };
    return durations[type] || 60;
  };

  const getDefaultIntensity = (type) => {
    const training = trainingTypes.find((t) => t.key === type);
    return training?.intensity || '70-80% FTP';
  };

  const generateCompositeName = (parts) => {
    if (parts.length === 1) {
      const training = trainingTypes.find((t) => t.key === parts[0].type);
      return training?.name || parts[0].type;
    }
    return `${parts.length} parts`;
  };

  const addSelectedTypes = () => {
    const newParts = selectedTypes.map((typeKey) => ({
      type: typeKey,
      duration: getDefaultDuration(typeKey),
      intensity: getDefaultIntensity(typeKey),
    }));
    const updatedParts = [...trainingParts, ...newParts];
    setTrainingParts(updatedParts);
    setSelectedTypes([]);

    const selectedTraining = trainingTypes.find((t) => t.key === selectedType);
    saveTraining({
      type: 'composite',
      name: generateCompositeName(updatedParts),
      details: selectedTraining,
      parts: updatedParts,
    });
  };

  const removeTrainingPart = (indexToRemove) => {
    const updatedParts = trainingParts.filter((_, index) => index !== indexToRemove);
    setTrainingParts(updatedParts);

    if (updatedParts.length === 0) {
      saveTraining(null);
    } else {
      const selectedTraining = trainingTypes.find((t) => t.key === selectedType);
      saveTraining({
        type: 'composite',
        name: generateCompositeName(updatedParts),
        details: selectedTraining,
        parts: updatedParts,
      });
    }
  };

  const clearAllTrainings = () => {
    setTrainingParts([]);
    setSelectedTypes([]);
    saveTraining(null);
  };

  // Short blurb per training type — same lookup table as before (T-6.3, audit W-21).
  const getTrainingDescription = (type) => {
    const descriptions = {
      endurance: 'Long rides for aerobic base development',
      tempo: 'Moderate-high intensity for lactate threshold improvement',
      intervals: 'Short high-intensity intervals for power development',
      sweet_spot: 'Optimal zone for FTP improvement without overtraining',
      recovery: 'Easy rides for recovery and active rest',
      hill_climbing: 'Hill training for leg strength development',
      sprint: 'Maximum efforts for sprint qualities development',
    };
    return descriptions[type] || 'Training for endurance development';
  };

  return (
    <Modal open={isOpen} onClose={onClose} className={`${dialogReset.bare} training-modal`}>
      <div className="modal-header">
        <div className="header-content">
          <h3>Training Setup for {dayName}</h3>
          <div className="rest-day-toggle">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={isRestDay}
                onChange={handleRestDayToggle}
                aria-label="Rest Day"
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Rest Day</span>
          </div>
        </div>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
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
            {trainingParts.length > 0 && (
              <div className="added-trainings-section">
                <div className="added-trainings-header">
                  <h4>Added Trainings</h4>
                  <button className="btn-clear-all" onClick={clearAllTrainings} title="Clear all trainings">
                    Clear All
                  </button>
                </div>
                <div className="added-trainings-list">
                  {trainingParts.map((part, index) => {
                    const training = trainingTypes.find((t) => t.key === part.type);
                    return (
                      <div key={index} className="added-training-item">
                        <div className="added-training-info">
                          <div className="added-training-details">
                            <div className="added-training-name">{training?.name || part.type}</div>
                            <div className="added-training-stats">
                              {part.duration} min • {part.intensity}
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
            <br />
            <div className="training-parts-header">
              <h4>Select Training Types</h4>
              {selectedTypes.length > 0 && (
                <button type="button" className="btn-add-selected" onClick={addSelectedTypes}>
                  + Add Selected ({selectedTypes.length})
                </button>
              )}
            </div>

            <div className="training-types-grid">
              {trainingTypes.map((training) => (
                <div
                  key={training.key}
                  className={`training-type-card ${selectedTypes.includes(training.key) ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedTypes.includes(training.key)}
                  onClick={() => toggleTrainingType(training.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleTrainingType(training.key);
                    }
                  }}
                >
                  <div className="card-header">
                    <div className="card-name">{training.name}</div>
                  </div>
                  <div className="card-details">
                    <div className="card-details-row">
                      <div className="card-intensity">
                        <span className="label">Intensity:</span>
                        <span className="value">
                          <b>{training.intensity}</b>
                        </span>
                      </div>
                      <div className="card-duration">
                        <span className="label">Time:</span>
                        <span className="value">{getDefaultDuration(training.key)} min</span>
                      </div>
                    </div>
                    <div className="card-details-row">
                      {training.cadence && (
                        <div className="card-cadence">
                          <span className="label">Cadence:</span>
                          <span className="value">{training.cadence}</span>
                        </div>
                      )}
                      {training.hr_zones && (
                        <div className="card-hr-zones">
                          <span className="label">Heart rate:</span>
                          <span className="value">{training.hr_zones}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="card-description">{getTrainingDescription(training.key)}</div>
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
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TrainingDayModal;
