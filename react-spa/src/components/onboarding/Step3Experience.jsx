import React from 'react';
import { EXPERIENCE_LEVELS } from './lib';

/** Step 3 of OnboardingModal's wizard (T-6.3 decomposition). */
export default function Step3Experience({ formData, onChange }) {
  return (
    <div className="step-content">
      <h2>Experience Level</h2>
      <p className="step-description">You can always add or change this information later in your profile</p>

      <div className="experience-levels">
        {EXPERIENCE_LEVELS.map((level) => (
          <div
            key={level.value}
            className={`experience-level ${formData.experience_level === level.value ? 'selected' : ''}`}
            onClick={() => onChange('experience_level', level.value)}
          >
            <div className="level-header">
              <input
                type="radio"
                name="experience_level"
                value={level.value}
                checked={formData.experience_level === level.value}
                onChange={() => onChange('experience_level', level.value)}
              />
              <label>{level.label}</label>
            </div>
            <p className="level-description">{level.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
