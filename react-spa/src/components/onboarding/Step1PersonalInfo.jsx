import React from 'react';

/** Step 1 of OnboardingModal's wizard (T-6.3 decomposition). */
export default function Step1PersonalInfo({ formData, errors, onChange }) {
  return (
    <div className="step-content">
      <h2>Personal Information</h2>
      <p className="step-description">You can always add or change this information later in your profile</p>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="height">Height (cm)</label>
          <input
            type="number"
            id="height"
            value={formData.height}
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
            value={formData.weight}
            onChange={(e) => onChange('weight', e.target.value)}
            placeholder="70"
            min="30"
            max="200"
            step="0.1"
          />
          {errors.weight && <span className="error">{errors.weight}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="age">Age</label>
          <input
            type="number"
            id="age"
            value={formData.age}
            onChange={(e) => onChange('age', e.target.value)}
            placeholder="30"
            min="10"
            max="100"
          />
          {errors.age && <span className="error">{errors.age}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="gender">Gender</label>
          <select id="gender" value={formData.gender} onChange={(e) => onChange('gender', e.target.value)}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          {errors.gender && <span className="error">{errors.gender}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="bike_weight">Bike Weight (kg)</label>
          <input
            type="number"
            id="bike_weight"
            value={formData.bike_weight}
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
