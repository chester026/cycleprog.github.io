import React, { useState } from 'react';
import { call, goals } from '../data/api';
import { Button, Modal, useToast } from '../ui';
import './AddGoalModal.css';
import { logError } from '../lib/log';

// Short delay before the parent refetches after a successful create.
const PARENT_REFRESH_DELAY_MS = 200;

const GOAL_TYPES = [
  { value: 'distance', label: 'Distance', unit: 'km' },
  { value: 'elevation', label: 'Elevation Gain', unit: 'm' },
  { value: 'time', label: 'Moving Time', unit: 'hours' },
  { value: 'speed_flat', label: 'Avg Speed on Flat', unit: 'km/h' },
  { value: 'speed_hills', label: 'Avg Speed on Hills', unit: 'km/h' },
  { value: 'pulse', label: 'Average Heart Rate', unit: 'bpm' },
  { value: 'avg_hr_flat', label: 'Avg HR Flat', unit: 'bpm' },
  { value: 'avg_hr_hills', label: 'Avg HR Hills', unit: 'bpm' },
  { value: 'avg_power', label: 'Average Power', unit: 'W' },
  { value: 'cadence', label: 'Average Cadence', unit: 'RPM' },
  { value: 'long_rides', label: 'Long Rides Count', unit: 'rides' },
  { value: 'intervals', label: 'Interval Workouts', unit: 'workouts' },
  { value: 'recovery', label: 'Recovery Rides', unit: 'rides' },
  { value: 'custom', label: 'Custom Goal', unit: '' }
];

export default function AddGoalModal({ isOpen, onClose, onGoalCreated, metaGoalId }) {
  const [selectedType, setSelectedType] = useState('distance');
  const [targetValue, setTargetValue] = useState('');
  const [period, setPeriod] = useState('4w');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const selectedGoalType = GOAL_TYPES.find(g => g.value === selectedType);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!targetValue) {
      toast.error('Please enter a target value');
      return;
    }

    setSaving(true);

    const goalData = {
      title: selectedGoalType.label,
      goal_type: selectedType,
      target_value: parseFloat(targetValue),
      unit: selectedGoalType.unit,
      period: period,
      meta_goal_id: metaGoalId || null
    };

    try {
      // call() attaches the Authorization header from AuthProvider's
      // in-memory access token (T-6.1) — no manual localStorage read here.
      await call(goals.create, { body: goalData });

      setTargetValue('');
      setSelectedType('distance');
      setPeriod('4w');
      onClose();

      if (onGoalCreated) {
        // Short delay so the parent's refetch sees the committed row.
        setTimeout(() => {
          onGoalCreated();
        }, PARENT_REFRESH_DELAY_MS);
      }
    } catch (error) {
      logError(error, 'Error creating goal');
      toast.error(`Failed to create goal: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTargetValue('');
    setSelectedType('distance');
    setPeriod('4w');
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Add New Goal" className="add-goal-modal">
      <div className="add-goal-modal-content">
        <div className="goal-types-list">
          {GOAL_TYPES.map(type => (
            <div
              key={type.value}
              className={`goal-type-item ${selectedType === type.value ? 'selected' : ''}`}
              onClick={() => setSelectedType(type.value)}
              role="button"
              tabIndex={0}
              aria-pressed={selectedType === type.value}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedType(type.value);
                }
              }}
            >
              <span className="goal-type-label">{type.label}</span>
              {selectedType === type.value && (
                <span className="goal-type-check">✓</span>
              )}
            </div>
          ))}
        </div>

        <div className="goal-form-container">
          <form onSubmit={handleSubmit}>
            <h3 className="goal-form-title">{selectedGoalType?.label}</h3>
            
            <div className="add-goal-form-section">
              <label className="add-goal-label" htmlFor="add-goal-target-value">
                Target Value {selectedGoalType?.unit && `(${selectedGoalType.unit})`}
              </label>
              <input
                id="add-goal-target-value"
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="Enter target value"
                className="add-goal-input"
                step="0.1"
                required
              />
            </div>

            <div className="add-goal-form-section">
              <label className="add-goal-label" htmlFor="add-goal-period">Period</label>
              <select
                id="add-goal-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="add-goal-select"
              >
                <option value="4w">4 weeks</option>
                <option value="3m">3 months</option>
                <option value="year">Year</option>
              </select>
            </div>

            <div className="add-goal-modal-actions">
              <Button onClick={handleClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Goal'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}

