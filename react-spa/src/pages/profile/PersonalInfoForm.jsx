import React from 'react';
import { ageFromBirthDate } from '@bikelab/shared/calc';

const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

/**
 * ProfilePage's "Personal Information" and "Training Settings" tabs
 * (T-6.3 decomposition). Both edit the same page-level `profile` draft via
 * `onChange`, saved together by ProfilePage's single "Save Changes" button
 * (PUT /api/user-profile through `useUpdateProfile`).
 */
export default function PersonalInfoForm({ tab, profile, errors, onChange }) {
  if (tab === 'personal') {
    const age = ageFromBirthDate(profile.birth_date);

    return (
      <div className="profile-section">
        <h2>Personal Information</h2>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="height">Height (cm)</label>
            <input
              type="number"
              id="height"
              value={profile.height || ''}
              onChange={(e) => onChange('height', e.target.value)}
              placeholder="175"
              min="100"
              max="250"
            />
            {errors.height && <span className="error">{errors.height}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="weight">Weight (kg)</label>
            <input
              type="number"
              id="weight"
              value={profile.weight || ''}
              onChange={(e) => onChange('weight', e.target.value)}
              placeholder="70"
              min="30"
              max="200"
              step="0.1"
            />
            {errors.weight && <span className="error">{errors.weight}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="birth_date">Date of birth</label>
            <input
              type="date"
              id="birth_date"
              value={profile.birth_date || ''}
              onChange={(e) => onChange('birth_date', e.target.value)}
            />
            {age != null && <p className="field-hint">Age: {age}</p>}
            {errors.birth_date && <span className="error">{errors.birth_date}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="gender">Gender</label>
            <select id="gender" value={profile.gender || ''} onChange={(e) => onChange('gender', e.target.value)}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            {errors.gender && <span className="error">{errors.gender}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="bike_weight">Bike Weight (kg)</label>
            <input
              type="number"
              id="bike_weight"
              value={profile.bike_weight || ''}
              onChange={(e) => onChange('bike_weight', e.target.value)}
              placeholder="8.5"
              min="5"
              max="25"
              step="0.1"
            />
            {errors.bike_weight && <span className="error">{errors.bike_weight}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-section">
      <h2>Training Settings</h2>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="experience_level">Experience Level</label>
          <select
            id="experience_level"
            value={profile.experience_level || 'intermediate'}
            onChange={(e) => onChange('experience_level', e.target.value)}
          >
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="time_available">Training Time Available (hours/day)</label>
          <input
            type="number"
            id="time_available"
            value={profile.time_available || ''}
            onChange={(e) => onChange('time_available', e.target.value)}
            placeholder="2"
            min="0.5"
            max="10"
            step="0.5"
          />
          {errors.time_available && <span className="error">{errors.time_available}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="workouts_per_week">Workouts per Week</label>
          <input
            type="number"
            id="workouts_per_week"
            value={profile.workouts_per_week || ''}
            onChange={(e) => onChange('workouts_per_week', e.target.value)}
            placeholder="5"
            min="1"
            max="7"
          />
          {errors.workouts_per_week && <span className="error">{errors.workouts_per_week}</span>}
        </div>
      </div>
    </div>
  );
}
