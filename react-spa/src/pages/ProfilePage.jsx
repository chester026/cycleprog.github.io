import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { startStravaLink } from '../utils/strava';
import { computeHrZones } from '@bikelab/shared/calc';
import './ProfilePage.css';

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Инициализируем таб на основе URL параметра или default
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');
    if (tab && ['personal', 'account', 'heart-rate', 'training', 'strava'].includes(tab)) {
      return tab;
    }
    return 'personal';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const experienceLevels = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' }
  ];

  // Обработка изменений URL параметров (для навигации браузера)
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');

    if (tab && ['personal', 'account', 'heart-rate', 'training', 'strava'].includes(tab)) {
      setActiveTab(tab);
    } else if (!tab) {
      setActiveTab('personal');
    }
  }, [location.search]);

  // Возврат из GET /link_strava (см. server.js): ?strava=linked|error.
  // Открываем вкладку Strava, тянем свежий профиль и убираем query.
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const strava = urlParams.get('strava');
    if (strava === 'linked' || strava === 'error') {
      setActiveTab('strava');
      if (strava === 'linked') {
        loadProfile();
      } else {
        setErrors((prev) => ({ ...prev, strava: 'Failed to link Strava account. Please try again.' }));
      }
      urlParams.delete('strava');
      const rest = urlParams.toString();
      navigate(`/profile${rest ? `?${rest}` : ''}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Estimated resting HR from experience level, used only as a form-preview
  // fallback (T-3.1) when the user hasn't entered one yet — computeHrZones
  // itself doesn't know about experience levels.
  const estimateRestingHrFromExperience = (experienceLevel) => {
    switch (experienceLevel) {
      case 'beginner': return 75;
      case 'intermediate': return 65;
      case 'advanced': return 55;
      default: return 70;
    }
  };

  // Live preview of heart rate zones for the values currently in the form
  // (T-3.1, docs/audit/00-AUDIT-AND-PLAN.md T-3.1): the server is the source
  // of truth for the saved `profile.hr_zones`, but while the user is typing
  // unsaved thresholds we recompute a preview locally with the same shared
  // implementation.
  const calculateHeartRateZones = () => {
    if (!profile) return null;
    if (!profile.max_hr && !profile.age) return null;

    const restingHr = profile.resting_hr ? parseInt(profile.resting_hr) : estimateRestingHrFromExperience(profile.experience_level);
    return computeHrZones({
      max_hr: profile.max_hr ? parseInt(profile.max_hr) : null,
      resting_hr: restingHr,
      lactate_threshold: profile.lactate_threshold ? parseInt(profile.lactate_threshold) : null,
      age: profile.age ? parseInt(profile.age) : null,
    });
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
      if (error.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
    
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
    if (profile.bike_weight && (profile.bike_weight < 5 || profile.bike_weight > 25)) {
      newErrors.bike_weight = 'Bike weight must be between 5 and 25 kg';
    }
    if (profile.email && !profile.email.includes('@')) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (profile.max_hr && (profile.max_hr < 100 || profile.max_hr > 220)) {
      newErrors.max_hr = 'Max HR must be between 100 and 220 bpm';
    }
    if (profile.resting_hr && (profile.resting_hr < 40 || profile.resting_hr > 100)) {
      newErrors.resting_hr = 'Resting HR must be between 40 and 100 bpm';
    }
    if (profile.lactate_threshold && (profile.lactate_threshold < 120 || profile.lactate_threshold > 200)) {
      newErrors.lactate_threshold = 'Lactate Threshold must be between 120 and 200 bpm';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    
    try {
      await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      setErrors({ submit: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkStrava = async () => {
    if (!confirm('Are you sure you want to unlink your Strava account?')) return;
    
    try {
      await apiFetch('/api/unlink_strava', { method: 'POST' });
      alert('Strava account unlinked successfully!');
      await loadProfile();
    } catch (error) {
      console.error('Error unlinking Strava:', error);
      alert('Failed to unlink Strava account. Please try again.');
    }
  };

  const handleLinkStrava = async () => {
    try {
      // Previously used the LOGIN redirect (/exchange_token) — that logs the
      // user into whatever account is attached to that Strava id instead of
      // linking Strava to the account they're already in. See
      // docs/audit/layers/02-bikelabapp.md A-01 (same bug, mobile side).
      await startStravaLink();
    } catch (e) {
      console.error('Failed to start Strava link:', e);
    }
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
      

      <div className="profile-layout">
        {/* Sidebar Navigation */}
        <div className="profile-sidebar">
          <div className="profile-header">
            <h3>Profile Settings</h3>
         </div>
          <div className="profile-tabs">
            <button 
              id="profile-tab-btn"
              className={`profile-tab-btn ${activeTab === 'personal' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <span className="tab-text">Personal Information</span>
            </button>
            <button 
              className={`profile-tab-btn ${activeTab === 'account' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <span className="tab-text">Account Settings</span>
            </button>
            <button 
              className={`profile-tab-btn ${activeTab === 'heart-rate' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('heart-rate')}
            >
              <span className="tab-text">Heart Rate Zones</span>
            </button>
            <button 
              id="training-tab-btn"
              className={`profile-tab-btn ${activeTab === 'training' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('training')}
            >
              <span className="tab-text">Training Settings</span>
            </button>
            <button 
              className={`profile-tab-btn ${activeTab === 'strava' ? 'profile-tab-active' : ''}`}
              onClick={() => setActiveTab('strava')}
            >
              <span className="tab-text">Strava Integration</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="profile-content">
          {activeTab === 'personal' && (
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
          )}

          {activeTab === 'account' && (
            <div className="profile-section">
              <h2>Account Settings</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    value={profile.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="your.email@example.com"
                  />
                  {errors.email && <span className="error">{errors.email}</span>}
                  <p className="field-hint">Used for account recovery and notifications</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'heart-rate' && (
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
                      onChange={(e) => handleInputChange('max_hr', e.target.value)}
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
                      onChange={(e) => handleInputChange('resting_hr', e.target.value)}
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
                      onChange={(e) => handleInputChange('lactate_threshold', e.target.value)}
                      placeholder="165"
                      min="120"
                      max="200"
                    />
                    {errors.lactate_threshold && <span className="error">{errors.lactate_threshold}</span>}
                    <p className="field-hint">Optional: from lactate test or FTP test for more accurate zones</p>
                  </div>
                </div>
                
                {(() => {
                  const zones = calculateHeartRateZones();
                  return zones ? (
                    <div className="calculated-zones">
                      <h3>Current Heart Rate Zones:</h3>
                      <div className="zones-display">
                        {zones.zones.map((zone) => (
                          <div className="zone-row" key={zone.key}>
                            <span className="zone-label">Zone {zone.id} ({zone.name}):</span>
                            <span className="zone-range">{zone.min} - {zone.max ?? `${zones.basis.max_hr}+`} bpm</span>
                          </div>
                        ))}
                      </div>
                      <div className="hr-summary">
                        <p><strong>Max HR:</strong> {zones.basis.max_hr} bpm {!profile.max_hr && '(estimated)'}</p>
                        {zones.basis.resting_hr != null && (
                          <p><strong>Resting HR:</strong> {zones.basis.resting_hr} bpm {!profile.resting_hr && '(estimated)'}</p>
                        )}
                        {zones.basis.lactate_threshold != null && (
                          <p><strong>Lactate Threshold:</strong> {zones.basis.lactate_threshold} bpm</p>
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
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'training' && (
            <div className="profile-section">
              <h2>Training Settings</h2>
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
                  <label htmlFor="time_available">Training Time Available (hours/day)</label>
                  <input
                    type="number"
                    id="time_available"
                    value={profile.time_available || ''}
                    onChange={(e) => handleInputChange('time_available', e.target.value)}
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
                    onChange={(e) => handleInputChange('workouts_per_week', e.target.value)}
                    placeholder="5"
                    min="1"
                    max="7"
                  />
                  {errors.workouts_per_week && <span className="error">{errors.workouts_per_week}</span>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'strava' && (
            <div className="profile-section">
              <h2>Strava Integration</h2>
              <div className="strava-section">
                <p>Connect your Strava account to automatically sync your activities and get personalized recommendations.</p>
                
                <div className="strava-actions">
                  {profile.strava_id ? (
                    <div className="strava-connected">
                      <p className="strava-status">✅ Strava account connected</p>
                      <button
                        className="accent-btn"
                        onClick={handleUnlinkStrava}
                      >
                        Unlink Strava
                      </button>
                    </div>
                  ) : (
                    <button
                      className="strava-link-button accent-btn"
                      onClick={handleLinkStrava}
                    >
                      Connect Strava
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {errors.submit && (
            <div className="error-message">
              {errors.submit}
            </div>
          )}

          <div className="profile-actions">
            <button
              className="accent-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}