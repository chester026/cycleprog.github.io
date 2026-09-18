import React, { useEffect, useState } from 'react';
import { GOAL_TYPES, PERIODS } from './lib';

const BLANK_FORM = {
  title: '',
  description: '',
  target_value: '',
  unit: '',
  goal_type: 'custom',
  period: '4w',
  hr_threshold: 160,
  duration_threshold: 120,
};

function formFromGoal(goal, userProfile) {
  return {
    title: goal.title,
    description: goal.description,
    target_value: goal.goal_type === 'ftp_vo2max' ? null : (goal.target_value || ''),
    unit: goal.unit,
    goal_type: goal.goal_type,
    period: goal.period,
    hr_threshold: goal.hr_threshold !== null && goal.hr_threshold !== undefined && !isNaN(goal.hr_threshold)
      ? goal.hr_threshold
      : (userProfile?.lactate_threshold ? parseInt(userProfile.lactate_threshold) : 160),
    duration_threshold: goal.duration_threshold !== null && goal.duration_threshold !== undefined && !isNaN(goal.duration_threshold)
      ? goal.duration_threshold
      : 120,
  };
}

/**
 * The add/edit goal form extracted from GoalsManager (T-6.3 part 2,
 * "GoalsManager → GoalList + GoalForm"). `editingGoal` (null for "add")
 * seeds the initial values; `onSubmit(formData)` is called on submit —
 * saving (via `useSaveGoal`) stays the caller's job so this component has
 * no data-layer dependency of its own.
 */
export default function GoalForm({ editingGoal, userProfile, saving, onSubmit, onCancel }) {
  const [formData, setFormData] = useState(() =>
    editingGoal ? formFromGoal(editingGoal, userProfile) : BLANK_FORM
  );

  // Re-seed whenever the target goal changes (switching from "add" to
  // "edit", or between two different goals) — mirrors GoalsManager's
  // original `handleEdit`/reset-on-cancel behaviour.
  useEffect(() => {
    setFormData(editingGoal ? formFromGoal(editingGoal, userProfile) : BLANK_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGoal]);

  // Обновляем HR threshold в форме при изменении профиля пользователя
  useEffect(() => {
    if (userProfile?.lactate_threshold && formData.goal_type === 'ftp_vo2max') {
      const newThreshold = parseInt(userProfile.lactate_threshold);
      if (formData.hr_threshold === 160 ||
          (userProfile.lactate_threshold && formData.hr_threshold !== newThreshold)) {
        setFormData((prev) => ({ ...prev, hr_threshold: newThreshold }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.lactate_threshold, formData.goal_type]);

  const handleGoalTypeChange = (goalType) => {
    const selectedType = GOAL_TYPES.find((t) => t.value === goalType);
    let defaultHRThreshold = 160;
    if (goalType === 'ftp_vo2max' && userProfile?.lactate_threshold) {
      defaultHRThreshold = parseInt(userProfile.lactate_threshold);
    }

    setFormData({
      ...formData,
      goal_type: goalType,
      unit: selectedType ? selectedType.unit : '',
      target_value: goalType === 'ftp_vo2max' ? null : formData.target_value,
      hr_threshold: goalType === 'ftp_vo2max' ? defaultHRThreshold : formData.hr_threshold,
      duration_threshold: goalType === 'ftp_vo2max' ? 120 : formData.duration_threshold,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="goal-form-container">
      <form onSubmit={handleSubmit} className="goal-form">
        <h3>{editingGoal ? 'Edit Goal' : 'Add New Goal'}</h3>

        <div className="form-group">
          <label>Title:</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Average Speed on Flat"
            required
          />
        </div>

        <div className="form-group">
          <label>Description:</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="e.g., Improve average speed on flat terrain"
            rows="3"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Goal Type:</label>
            <select value={formData.goal_type} onChange={(e) => handleGoalTypeChange(e.target.value)}>
              {GOAL_TYPES.map((type) => (
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
              onChange={(e) => setFormData({ ...formData, period: e.target.value })}
            >
              {PERIODS.map((period) => (
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
                  onChange={(e) => setFormData({ ...formData, hr_threshold: parseInt(e.target.value) })}
                  placeholder="160"
                  style={{ flex: 1 }}
                />
                {userProfile?.lactate_threshold && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, hr_threshold: parseInt(userProfile.lactate_threshold) }))
                    }
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8em',
                      background: '#7eaaff',
                      color: '#23272f',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    title="Refresh from profile"
                  >
                    🔄
                  </button>
                )}
              </div>
              {userProfile?.lactate_threshold && formData.hr_threshold === parseInt(userProfile.lactate_threshold) && (
                <div style={{ fontSize: '0.8em', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Auto-filled from your profile lactate threshold
                </div>
              )}
              {userProfile?.lactate_threshold && formData.hr_threshold !== parseInt(userProfile.lactate_threshold) && (
                <div style={{ fontSize: '0.8em', color: '#6b7280', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Profile lactate threshold: {userProfile.lactate_threshold} BPM</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, hr_threshold: parseInt(userProfile.lactate_threshold) }))
                    }
                    style={{
                      padding: '2px 6px',
                      fontSize: '0.7em',
                      background: 'transparent',
                      color: '#7eaaff',
                      border: '1px solid #7eaaff',
                      borderRadius: '3px',
                      cursor: 'pointer',
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
                onChange={(e) => setFormData({ ...formData, duration_threshold: parseInt(e.target.value) })}
                placeholder="120"
              />
              <div style={{ fontSize: '0.8em', color: '#6b7280', marginTop: '4px' }}>
                Minimum continuous time in threshold zone to count as interval
              </div>
            </div>
          </div>
        )}

        <div className="form-row">
          {formData.goal_type !== 'ftp_vo2max' && (
            <div className="form-group">
              <label>Target Value:</label>
              <input
                type="number"
                step="0.1"
                value={isNaN(formData.target_value) ? '' : formData.target_value}
                onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                placeholder="e.g., 30"
                required
              />
            </div>
          )}

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
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="e.g., km/h"
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="accent-btn" disabled={saving}>
            {editingGoal ? 'Update Goal' : 'Add Goal'}
          </button>
          <button type="button" className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
