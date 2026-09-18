import React from 'react';

/**
 * Step 2 of OnboardingModal's wizard (T-6.3 decomposition).
 *
 * `hr_zones` is always server-derived (T-3.1) — this used to recompute a
 * client-side preview from the wizard's unsaved draft fields via
 * `computeHrZones` (BikeLabApp's mobile wizard still does this). The web
 * SPA instead just shows the profile's current `hr_zones` (from
 * `useProfile()`, already reflecting whatever was last saved), so there is
 * exactly one place — the server — that ever runs the calc.
 */
export default function Step2HrZones({ formData, errors, onChange, profile }) {
  const hrZones = profile?.hr_zones;

  return (
    <div className="step-content">
      <h2>Heart Rate Zones</h2>
      <p className="step-description">You can always add or change this information later in your profile</p>

      <div className="hr-zones-section">
        <div className="hr-fields-grid">
          <div className="form-group">
            <label htmlFor="max_hr">Maximum Heart Rate (bpm)</label>
            <input
              type="number"
              id="max_hr"
              value={formData.max_hr}
              onChange={(e) => onChange('max_hr', e.target.value)}
              placeholder="190"
              min="100"
              max="220"
            />
            {errors.max_hr && <span className="error">{errors.max_hr}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="resting_hr">Resting Heart Rate (bpm)</label>
            <input
              type="number"
              id="resting_hr"
              value={formData.resting_hr}
              onChange={(e) => onChange('resting_hr', e.target.value)}
              placeholder="60"
              min="40"
              max="100"
            />
            {errors.resting_hr && <span className="error">{errors.resting_hr}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="lactate_threshold">Lactate Threshold HR (bpm)</label>
            <input
              type="number"
              id="lactate_threshold"
              value={formData.lactate_threshold}
              onChange={(e) => onChange('lactate_threshold', e.target.value)}
              placeholder="165"
              min="120"
              max="200"
            />
            {errors.lactate_threshold && <span className="error">{errors.lactate_threshold}</span>}
            <p className="field-hint">From lactate test or FTP test (optional)</p>
          </div>
        </div>

        {hrZones?.zones?.length > 0 && (
          <div className="zones-preview">
            <h4>Your Current Heart Rate Zones:</h4>
            <div className="zones-display">
              {hrZones.zones.map((zone) => (
                <div className="zone-row" key={zone.key}>
                  <span className="zone-label">
                    Zone {zone.id} ({zone.name}):
                  </span>
                  <span className="zone-range">
                    {zone.min} - {zone.max ?? `${hrZones.basis.max_hr}+`} bpm
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="field-hint">* Leave fields empty to estimate based on age and experience level. Zones above update once you finish this step.</p>
      </div>
    </div>
  );
}
