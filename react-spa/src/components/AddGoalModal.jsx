import React, { useState } from 'react';
import './AddGoalModal.css';

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

  if (!isOpen) return null;

  const selectedGoalType = GOAL_TYPES.find(g => g.value === selectedType);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!targetValue) {
      alert('Please enter a target value');
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
    
    console.log('📝 Creating goal with data:', goalData);

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(goalData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Server error:', errorData);
        throw new Error(errorData.error || 'Failed to create goal');
      }

      const newGoal = await response.json();
      console.log('✅ Goal created successfully:', newGoal);
      console.log('✅ Goal meta_goal_id:', newGoal.meta_goal_id);

      // Сбрасываем форму
      setTargetValue('');
      setSelectedType('distance');
      setPeriod('4w');

      // Закрываем модалку
      onClose();

      // Обновляем данные родителя
      if (onGoalCreated) {
        // Небольшая задержка для уверенности, что транзакция в БД завершена
        setTimeout(() => {
          onGoalCreated();
        }, 200);
      }
    } catch (error) {
      console.error('Error creating goal:', error);
      alert(`Failed to create goal: ${error.message}`);
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
    <div className="add-goal-modal-overlay" onClick={handleClose}>
      <div className="add-goal-modal" onClick={e => e.stopPropagation()}>
        <div className="add-goal-modal-header">
          <h2>Add New Goal</h2>
          <button className="add-goal-modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="add-goal-modal-content">
          {/* Левая колонка - список типов целей */}
          <div className="goal-types-list">
            {GOAL_TYPES.map(type => (
              <div
                key={type.value}
                className={`goal-type-item ${selectedType === type.value ? 'selected' : ''}`}
                onClick={() => setSelectedType(type.value)}
              >
                <span className="goal-type-label">{type.label}</span>
                {selectedType === type.value && (
                  <span className="goal-type-check">✓</span>
                )}
              </div>
            ))}
          </div>

          {/* Правая колонка - форма */}
          <div className="goal-form-container">
            <form onSubmit={handleSubmit}>
              <h3 className="goal-form-title">{selectedGoalType?.label}</h3>
              
              <div className="add-goal-form-section">
                <label className="add-goal-label">
                  Target Value {selectedGoalType?.unit && `(${selectedGoalType.unit})`}
                </label>
                <input
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
                <label className="add-goal-label">Period</label>
                <select 
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
                <button 
                  type="button" 
                  onClick={handleClose}
                  className="add-goal-btn-cancel"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="add-goal-btn-save"
                  disabled={saving}
                >
                  {saving ? 'Creating...' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

