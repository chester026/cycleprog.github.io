import React from 'react';
import { computeHrZones } from '@bikelab/shared/calc';

// Estimated resting HR from experience level, used only as a form-preview
// fallback (T-3.1) when the user hasn't entered one yet — computeHrZones
// itself doesn't know about experience levels.
function estimateRestingHrFromExperience(experienceLevel) {
  switch (experienceLevel) {
    case 'beginner':
      return 75;
    case 'intermediate':
      return 65;
    case 'advanced':
      return 55;
    default:
      return 70;
  }
}

/**
 * ProfilePage's "Heart Rate Zones" tab (T-6.3 decomposition).
 *
 * The saved `profile.hr_zones` is always server-derived (T-3.1,
 * docs/audit/00-AUDIT-AND-PLAN.md T-3.1), but this still recomputes a live
 * preview locally with the same shared implementation while the user is
 * typing unsaved thresholds — unlike OnboardingModal's Step2HrZones, which
 * dropped this preview (see that file's comment), ProfilePage's "type,
 * see the zones shift, then Save" flow is existing behaviour this
 * decomposition keeps unchanged.
 */
export default function HrZonesCard({ profile, errors, onChange }) {
  const calculateHeartRateZones = () => {
    if (!profile.max_hr && !profile.age) return null;

    const restingHr = profile.resting_hr
      ? parseInt(profile.resting_hr)
      : estimateRestingHrFromExperience(profile.experience_level);
    return computeHrZones({
      max_hr: profile.max_hr ? parseInt(profile.max_hr) : null,
      resting_hr: restingHr,
      lactate_threshold: profile.lactate_threshold ? parseInt(profile.lactate_threshold) : null,
      age: profile.age ? parseInt(profile.age) : null,
    });
  };

  const zones = calculateHeartRateZones();

  return (
    <div className="profile-section">
      <h2>Heart Rate Zones</h2>
      <div className="hr-zones-section">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="max_hr">Maximum Heart Rate (bpm)</label>
            <input
              type="number"
              id="max_hr"
              value={profile.max_hr || ''}
              onChange={(e) => onChange('max_hr', e.target.value)}
              placeholder="190"
              min="100"
              max="220"
            />
            {errors.max_hr && <span className="error">{errors.max_hr}</span>}
            <p className="field-hint">Leave empty to estimate based on age (220 - age)</p>
          </div>

          <div className="form-group">
            <label htmlFor="resting_hr">Resting Heart Rate (bpm)</label>
            <input
              type="number"
              id="resting_hr"
              value={profile.resting_hr || ''}
              onChange={(e) => onChange('resting_hr', e.target.value)}
              placeholder="60"
              min="40"
              max="100"
            />
            {errors.resting_hr && <span className="error">{errors.resting_hr}</span>}
            <p className="field-hint">Leave empty to estimate based on experience level</p>
          </div>

          <div className="form-group">
            <label htmlFor="lactate_threshold">Lactate Threshold HR (bpm)</label>
            <input
              type="number"
              id="lactate_threshold"
              value={profile.lactate_threshold || ''}
              onChange={(e) => onChange('lactate_threshold', e.target.value)}
              placeholder="165"
              min="120"
              max="200"
            />
            {errors.lactate_threshold && <span className="error">{errors.lactate_threshold}</span>}
            <p className="field-hint">Optional: from lactate test or FTP test for more accurate zones</p>
          </div>
        </div>

        {zones ? (
          <div className="calculated-zones">
            <h3>Current Heart Rate Zones:</h3>
            <div className="zones-display">
              {zones.zones.map((zone) => (
                <div className="zone-row" key={zone.key}>
                  <span className="zone-label">
                    Zone {zone.id} ({zone.name}):
                  </span>
                  <span className="zone-range">
                    {zone.min} - {zone.max ?? `${zones.basis.max_hr}+`} bpm
                  </span>
                </div>
              ))}
            </div>
            <div className="hr-summary">
              <p>
                <strong>Max HR:</strong> {zones.basis.max_hr} bpm {!profile.max_hr && '(estimated)'}
              </p>
              {zones.basis.resting_hr != null && (
                <p>
                  <strong>Resting HR:</strong> {zones.basis.resting_hr} bpm {!profile.resting_hr && '(estimated)'}
                </p>
              )}
              {zones.basis.lactate_threshold != null && (
                <p>
                  <strong>Lactate Threshold:</strong> {zones.basis.lactate_threshold} bpm
                </p>
              )}
            </div>
            <p className="field-hint">
              {zones.method === 'lthr'
                ? 'Zones calculated based on lactate threshold HR'
                : zones.method === 'karvonen'
                  ? 'Zones calculated using Karvonen formula (HR Reserve)'
                  : 'Zones calculated as a percentage of max HR'}
            </p>
          </div>
        ) : (
          <p className="field-hint">Enter your age in Personal Information to see calculated zones</p>
        )}
      </div>
    </div>
  );
}
