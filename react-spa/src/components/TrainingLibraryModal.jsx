import React from 'react';
import { useTrainingTypes } from '../data/hooks';
import { Modal } from '../ui';
import dialogReset from './training/ModalDialogReset.module.css';
import './TrainingLibraryModal.css';

// Training-type descriptions/durations not carried by the /api/training-types
// catalog itself — same lookup tables as before (T-6.3, audit W-21).
const DESCRIPTIONS = {
  endurance: 'Long steady rides to build aerobic base',
  tempo: 'Sustained efforts at lactate threshold',
  intervals: 'High-intensity intervals for VO2max',
  sweet_spot: 'Optimal zone for FTP improvement',
  recovery: 'Easy spinning for active recovery',
  hill_climbing: 'Climbing-specific power development',
  sprint: 'Maximum power and speed development',
  threshold: 'Lactate threshold training',
  over_under: 'Variable intensity threshold work',
  pyramid: 'Progressive interval training',
  cadence: 'High cadence pedaling technique',
  strength: 'Low cadence power development',
  time_trial: 'Race simulation and pacing',
  group_ride: 'Social training with variable intensity',
};

const DURATIONS = {
  endurance: 120,
  tempo: 60,
  intervals: 60,
  sweet_spot: 90,
  recovery: 45,
  hill_climbing: 90,
  sprint: 45,
  threshold: 60,
  over_under: 60,
  pyramid: 60,
  cadence: 60,
  strength: 60,
  time_trial: 60,
  group_ride: 120,
};

const TrainingLibraryModal = ({ isOpen, onClose, onTrainingClick }) => {
  const { data: trainingTypes = [] } = useTrainingTypes(isOpen);

  return (
    <Modal open={isOpen} onClose={onClose} className={`${dialogReset.bare} training-library-modal`}>
      <div className="training-library-header">
        <h2>Training Library</h2>
        <button className="close-modal-btn" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="training-library-content">
        <div className="training-types-grid">
          {trainingTypes.map((training) => (
            <div key={training.key} className="training-type-card" onClick={() => onTrainingClick(training)}>
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
                    <span className="label">Duration:</span>
                    <span className="value">{DURATIONS[training.key] || 60} min</span>
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
                      <span className="label">HR:</span>
                      <span className="value">{training.hr_zones}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="card-description">{DESCRIPTIONS[training.key] || ''}</div>
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
    </Modal>
  );
};

export default TrainingLibraryModal;
