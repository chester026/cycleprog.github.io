import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './ProfilePage.css';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [showStravaSection, setShowStravaSection] = useState(false);

  const experienceLevels = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' }
  ];

  // Calculate heart rate zones based on age and experience level
  const calculateHeartRateZones = () => {
    if (!profile || !profile.age) return null;
    
    // Maximum heart rate estimation (220 - age)
    const maxHR = 220 - profile.age;
    
    // Resting heart rate estimation based on experience level
    let restingHR = 70; // default
    switch (profile.experience_level) {
      case 'beginner':
        restingHR = 75;
        break;
      case 'intermediate':
        restingHR = 65;
        break;
      case 'advanced':
        restingHR = 55;
        break;
      default:
        restingHR = 70;
    }
    
    // Heart rate reserve
    const hrReserve = maxHR - restingHR;
    
    // Calculate zones using Karvonen formula
    const zones = {
      zone1: {
        min: Math.round(restingHR + (hrReserve * 0.5)),
        max: Math.round(restingHR + (hrReserve * 0.6)),
        name: 'Active Recovery',
        description: 'Very light effort, recovery rides'
      },
      zone2: {
        min: Math.round(restingHR + (hrReserve * 0.6)),
        max: Math.round(restingHR + (hrReserve * 0.7)),
        name: 'Endurance',
        description: 'Long, steady rides, aerobic base building'
      },
      zone3: {
        min: Math.round(restingHR + (hrReserve * 0.7)),
        max: Math.round(restingHR + (hrReserve * 0.8)),
        name: 'Tempo',
        description: 'Moderate intensity, sustainable effort'
      },
      zone4: {
        min: Math.round(restingHR + (hrReserve * 0.8)),
        max: Math.round(restingHR + (hrReserve * 0.9)),
        name: 'Threshold',
        description: 'Lactate threshold, hard but sustainable'
      },
      zone5: {
        min: Math.round(restingHR + (hrReserve * 0.9)),
        max: maxHR,
        name: 'VO2 Max',
        description: 'Maximum effort, short intervals'
      }
    };
    
    return { maxHR, restingHR, zones };
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await apiFetch('/api/user-profile');
      setProfile(response);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (profile.height && (profile.height < 100 || profile.height > 250)) {
      newErrors.height = 'Height must be between 100 and 250 cm';
    }
    
    if (profile.weight && (profile.weight < 30 || profile.weight > 200)) {
      newErrors.weight = 'Weight must be between 30 and 200 kg';
    }
    
    if (profile.age && (profile.age < 10 || profile.age > 100)) {
      newErrors.age = 'Age must be between 10 and 100 years';
    }
    
    if (profile.gender && !['male', 'female', 'other'].includes(profile.gender)) {
      newErrors.gender = 'Please select a valid gender';
    }
    
    if (profile.bike_weight && (profile.bike_weight < 5 || profile.bike_weight > 25)) {
      newErrors.bike_weight = 'Bike weight must be between 5 and 25 kg';
    }
    
    if (profile.time_available && (profile.time_available < 1 || profile.time_available > 10)) {
      newErrors.time_available = 'Time available must be between 1 and 10 hours';
    }
    
    if (profile.workouts_per_week && (profile.workouts_per_week < 1 || profile.workouts_per_week > 7)) {
      newErrors.workouts_per_week = 'Workouts per week must be between 1 and 7';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }
    
    setSaving(true);
    
    try {
      await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profile)
      });
      
      // Show success message
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      setErrors({ submit: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkStrava = async () => {
    if (!confirm('Are you sure you want to unlink your Strava account? This will remove access to your Strava activities.')) {
      return;
    }
    
    try {
      await apiFetch('/api/unlink_strava', {
        method: 'POST'
      });
      
      alert('Strava account unlinked successfully!');
      
      // Clear any cached data
      localStorage.removeItem('strava_token');
      sessionStorage.clear();
      
      // Reload profile to update strava_id status
      await loadProfile();
    } catch (error) {
      console.error('Error unlinking Strava:', error);
      alert('Failed to unlink Strava account. Please try again.');
    }
  };

  const handleLinkStrava = () => {
    const clientId = '165560';
    const redirectUri = `${window.location.origin}/exchange_token`;
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`;
    
    window.location.href = authUrl;
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>Profile Settings</h1>
      </div>

      <div className="profile-content">
        <div className="profile-section">
          <h2>Personal Information</h2>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="height">Height (cm)</label>
              <input
                type="number"
                id="height"
                value={profile.height || ''}
                onChange={(e) => handleInputChange('height', e.target.value)}
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
                onChange={(e) => handleInputChange('weight', e.target.value)}
                placeholder="70"
                min="30"
                max="200"
                step="0.1"
              />
              {errors.weight && <span className="error">{errors.weight}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="age">Age</label>
              <input
                type="number"
                id="age"
                value={profile.age || ''}
                onChange={(e) => handleInputChange('age', e.target.value)}
                placeholder="30"
                min="10"
                max="100"
              />
              {errors.age && <span className="error">{errors.age}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="gender">Gender</label>
              <select
                id="gender"
                value={profile.gender || ''}
                onChange={(e) => handleInputChange('gender', e.target.value)}
              >
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
                onChange={(e) => handleInputChange('bike_weight', e.target.value)}
                placeholder="8.5"
                min="5"
                max="25"
                step="0.1"
              />
              {errors.bike_weight && <span className="error">{errors.bike_weight}</span>}
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Training Preferences</h2>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="experience_level">Experience Level</label>
              <select
                id="experience_level"
                value={profile.experience_level || 'intermediate'}
                onChange={(e) => handleInputChange('experience_level', e.target.value)}
              >
                {experienceLevels.map(level => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="time_available">Time Available (hours/week)</label>
              <input
                type="number"
                id="time_available"
                value={profile.time_available || ''}
                onChange={(e) => handleInputChange('time_available', e.target.value)}
                placeholder="5"
                min="1"
                max="10"
              />
              {errors.time_available && <span className="error">{errors.time_available}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="workouts_per_week">Workouts per Week</label>
              <input
                type="number"
                id="workouts_per_week"
                value={profile.workouts_per_week || ''}
                onChange={(e) => handleInputChange('workouts_per_week', e.target.value)}
                placeholder="5"
                min="1"
                max="7"
              />
              {errors.workouts_per_week && <span className="error">{errors.workouts_per_week}</span>}
            </div>
          </div>
        </div>

        <div className="profile-section">
          <h2>Heart Rate Zones</h2>
          <div className="hr-zones-section">
            {profile.hr_zones ? (
              <div className="custom-zones">
                <p className="section-description">Your custom heart rate zones (from lactate test or other testing):</p>
                <textarea
                  value={profile.hr_zones}
                  onChange={(e) => handleInputChange('hr_zones', e.target.value)}
                  placeholder="Zone 1: 120-140, Zone 2: 140-160, Zone 3: 160-170, Zone 4: 170-180, Zone 5: 180+"
                  rows="6"
                />
                <div className="zones-help">
                  <p className="field-hint">
                    <strong>💡 Tips:</strong> You can format your zones in any way that's clear to you. 
                    Common formats: "Zone 1: 120-140", "Z1: 120-140", or just "120-140, 140-160, 160-170, 170-180, 180+"
                  </p>
                  <p className="field-hint">
                    <strong>🔬 From lactate test?</strong> Use your actual threshold values for more accurate training zones.
                  </p>
                </div>
                                 <button
                   type="button"
                   className="secondary-btn"
                   onClick={() => handleInputChange('hr_zones', '')}
                 >
                   Use Calculated Zones
                 </button>
              </div>
            ) : (
              <div className="calculated-zones">
                {profile && profile.age ? (
                  <>
                    <p className="section-description">Calculated zones based on your age ({profile.age}) and experience level:</p>
                    <div className="zones-grid">
                      {(() => {
                        const hrData = calculateHeartRateZones();
                        if (!hrData) return null;
                        
                        return Object.entries(hrData.zones).map(([zoneKey, zone]) => (
                          <div key={zoneKey} className="zone-card">
                            <div className="zone-header">
                              <span className="zone-name">{zone.name}</span>
                              <span className="zone-range">{zone.min}-{zone.max} bpm</span>
                            </div>
                            <p className="zone-description">{zone.description}</p>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="hr-summary">
                      <p><strong>Max HR:</strong> {calculateHeartRateZones()?.maxHR} bpm</p>
                      <p><strong>Resting HR:</strong> {calculateHeartRateZones()?.restingHR} bpm (estimated)</p>
                    </div>
                    <p className="field-hint">These zones are calculated using the Karvonen formula. You can set custom zones above.</p>
                  </>
                                 ) : (
                   <div className="no-age-warning">
                     <p>Please enter your age to see calculated heart rate zones.</p>
                   </div>
                 )}
                 
                 <div className="custom-zones-option">
                   <p className="section-description">Have your zones from a lactate test or other testing?</p>
                   <button
                     type="button"
                     className="text-btn"
                     onClick={() => handleInputChange('hr_zones', 'Zone 1: \nZone 2: \nZone 3: \nZone 4: \nZone 5: ')}
                   >
                     Set Custom Zones
                   </button>
                   <p className="field-hint">
                     This will override calculated zones with your actual test results for more accurate training.
                   </p>
                   
                   <div className="zones-examples">
                     <details>
                       <summary>📋 See examples of different zone formats</summary>
                       <div className="examples-content">
                         <div className="example-group">
                           <h4>From Lactate Threshold Test:</h4>
                           <pre>Zone 1: 120-140 (Active Recovery)
Zone 2: 140-155 (Endurance)
Zone 3: 155-165 (Tempo)
Zone 4: 165-175 (Threshold)
Zone 5: 175+ (VO2 Max)</pre>
                         </div>
                         
                         <div className="example-group">
                           <h4>From FTP Test:</h4>
                           <pre>Zone 1: 110-130
Zone 2: 130-150
Zone 3: 150-165
Zone 4: 165-180
Zone 5: 180+</pre>
                         </div>
                         
                         <div className="example-group">
                           <h4>Simple Format:</h4>
                           <pre>120-140, 140-160, 160-170, 170-180, 180+</pre>
                         </div>
                       </div>
                     </details>
                   </div>
                 </div>
              </div>
            )}
          </div>
        </div>

        <div className="profile-section">
          <h2>Strava Integration</h2>
          <div className="strava-section">
            <p>Connect your Strava account to automatically sync your activities and get personalized recommendations.</p>
            
            <div className="strava-actions">
              {profile.strava_id ? (
                <button
                  className="strava-unlink-button"
                  onClick={handleUnlinkStrava}
                >
                  Unlink Strava
                </button>
              ) : (
                <button
                  className="strava-link-button"
                  onClick={handleLinkStrava}
                >
                  Connect Strava
                </button>
              )}
            </div>
          </div>
        </div>

        {errors.submit && (
          <div className="error-message">
            {errors.submit}
          </div>
        )}

        <div className="profile-actions">
          <button
            className="save-button accent-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
} 