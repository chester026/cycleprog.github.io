import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import './OnboardingModal.css';
import bl_logo from '../assets/img/logo/bl_logo_white.png';

export default function OnboardingModal({ isOpen, onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    height: '',
    weight: '',
    age: '',
    bike_weight: '',
    hr_zones: '',
    max_hr: '',
    resting_hr: '',
    lactate_threshold: '',
    gender: '',
    experience_level: 'intermediate',
    email: '' // for Strava users
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [userProfile, setUserProfile] = useState(null);
  const [authType, setAuthType] = useState(null); // 'strava', 'email', or 'both'

  const experienceLevels = [
    { value: 'beginner', label: 'Beginner', description: 'New to cycling or returning after a long break. Focus on building basic fitness and getting comfortable on the bike.' },
    { value: 'intermediate', label: 'Intermediate', description: 'Regular cyclist with some training experience. Ready for structured workouts and performance improvement.' },
    { value: 'advanced', label: 'Advanced', description: 'Experienced cyclist with structured training. Looking for advanced techniques and race-specific preparation.' }
  ];

  // Calculate HR zones based on custom or estimated values
  const calculateHRZones = () => {
    const maxHR = formData.max_hr ? parseInt(formData.max_hr) : (formData.age ? 220 - parseInt(formData.age) : null);
    
    let restingHR = formData.resting_hr ? parseInt(formData.resting_hr) : null;
    if (!restingHR && formData.experience_level) {
      switch (formData.experience_level) {
        case 'beginner': restingHR = 75; break;
        case 'intermediate': restingHR = 65; break;
        case 'advanced': restingHR = 55; break;
        default: restingHR = 70;
      }
    }
    
    const lactateThreshold = formData.lactate_threshold ? parseInt(formData.lactate_threshold) : null;
    
    if (!maxHR || !restingHR) return null;
    
    if (lactateThreshold) {
      // Zone calculation based on lactate threshold HR (more accurate coefficients for HR)
      return {
        maxHR,
        restingHR,
        lactateThreshold,
        zone1: { min: Math.round(lactateThreshold * 0.75), max: Math.round(lactateThreshold * 0.85) },
        zone2: { min: Math.round(lactateThreshold * 0.85), max: Math.round(lactateThreshold * 0.92) },
        zone3: { min: Math.round(lactateThreshold * 0.92), max: Math.round(lactateThreshold * 0.97) },
        zone4: { min: Math.round(lactateThreshold * 0.97), max: Math.round(lactateThreshold * 1.03) },
        zone5: { min: Math.round(lactateThreshold * 1.03), max: maxHR }
      };
    } else {
      // Karvonen method
      const hrReserve = maxHR - restingHR;
      return {
        maxHR,
        restingHR,
        zone1: { min: Math.round(restingHR + (hrReserve * 0.5)), max: Math.round(restingHR + (hrReserve * 0.6)) },
        zone2: { min: Math.round(restingHR + (hrReserve * 0.6)), max: Math.round(restingHR + (hrReserve * 0.7)) },
        zone3: { min: Math.round(restingHR + (hrReserve * 0.7)), max: Math.round(restingHR + (hrReserve * 0.8)) },
        zone4: { min: Math.round(restingHR + (hrReserve * 0.8)), max: Math.round(restingHR + (hrReserve * 0.9)) },
        zone5: { min: Math.round(restingHR + (hrReserve * 0.9)), max: maxHR }
      };
    }
  };

  // Load user profile to determine auth type
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
        
        // Determine authentication type
        const hasStrava = !!profile.strava_id;
        const hasEmail = !!profile.email;
        

        
        if (hasStrava && hasEmail) {
          setAuthType('both');
        } else if (hasStrava && !hasEmail) {
          setAuthType('strava');
        } else if (!hasStrava && hasEmail) {
          setAuthType('email');
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    
    if (isOpen) {
      loadUserProfile();
    }
  }, [isOpen]);

  // Calculate total steps based on auth type
  const getTotalSteps = () => {
    const baseSteps = 3; // Personal info, HR zones, Experience level
    if (authType === 'strava') {
      return baseSteps + 1; // + Email collection
    } else if (authType === 'email') {
      return baseSteps + 1; // + Strava connection
    }
    return baseSteps;
  };

  const totalSteps = getTotalSteps();

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
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

  const validateCurrentStep = () => {
    const newErrors = {};
    
    switch (currentStep) {
      case 1:
        if (formData.height && (formData.height < 100 || formData.height > 250)) {
          newErrors.height = 'Height must be between 100 and 250 cm';
        }
        if (formData.weight && (formData.weight < 30 || formData.weight > 200)) {
          newErrors.weight = 'Weight must be between 30 and 200 kg';
        }
        if (formData.age && (formData.age < 10 || formData.age > 100)) {
          newErrors.age = 'Age must be between 10 and 100 years';
        }
        if (formData.bike_weight && (formData.bike_weight < 5 || formData.bike_weight > 25)) {
          newErrors.bike_weight = 'Bike weight must be between 5 and 25 kg';
        }
        if (formData.gender && !['male', 'female', 'other'].includes(formData.gender)) {
          newErrors.gender = 'Please select a valid gender';
        }
        break;
      case 2:
        // Heart rate fields validation
        if (formData.max_hr && (formData.max_hr < 100 || formData.max_hr > 220)) {
          newErrors.max_hr = 'Max HR must be between 100 and 220 bpm';
        }
        if (formData.resting_hr && (formData.resting_hr < 40 || formData.resting_hr > 100)) {
          newErrors.resting_hr = 'Resting HR must be between 40 and 100 bpm';
        }
        if (formData.lactate_threshold && (formData.lactate_threshold < 120 || formData.lactate_threshold > 200)) {
          newErrors.lactate_threshold = 'Lactate Threshold must be between 120 and 200 bpm';
        }
        break;
      case 3:
        // Experience level has default value
        break;
      case 4:
        // Email collection step for Strava users OR Strava connection for email users
        if (authType === 'strava') {
          if (!formData.email || !formData.email.includes('@')) {
            newErrors.email = 'Please enter a valid email address';
          }
        }
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateCurrentStep()) {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1);
      } else {
        handleSubmit();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    try {
      // Generate HR zones string if individual fields are provided
      let hrZonesString = formData.hr_zones;
      
      if (!hrZonesString && (formData.max_hr || formData.resting_hr || formData.lactate_threshold)) {
        const zones = calculateHRZones();
        if (zones) {
          hrZonesString = `Zone 1: ${zones.zone1.min}-${zones.zone1.max} bpm\nZone 2: ${zones.zone2.min}-${zones.zone2.max} bpm\nZone 3: ${zones.zone3.min}-${zones.zone3.max} bpm\nZone 4: ${zones.zone4.min}-${zones.zone4.max} bpm\nZone 5: ${zones.zone5.min}-${zones.zone5.max} bpm`;
        }
      }
      
      // Filter out empty values from form data, exclude only email
      const profileData = Object.fromEntries(
        Object.entries(formData).filter(([key, value]) => 
          value !== '' && 
          key !== 'email'
        )
      );
      
      // Add generated hr_zones if available
      if (hrZonesString) {
        profileData.hr_zones = hrZonesString;
      }
      
      // Save profile data
      await apiFetch('/api/user-profile/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileData)
      });
      
      // Handle email update for Strava users
      if (authType === 'strava' && formData.email) {
        const emailResponse = await apiFetch('/api/user-profile/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: formData.email })
        });
        
        // Update token if server returns a new one
        if (emailResponse.token) {
          localStorage.setItem('token', emailResponse.token);
        }
      }
      
      // Notify other components that onboarding is complete and token might have changed
      window.dispatchEvent(new CustomEvent('onboardingComplete', { 
        detail: { authType, tokenUpdated: true } 
      }));
      
      onComplete();
    } catch (error) {
      console.error('❌ Error completing onboarding:', error);
      setErrors({ submit: 'Failed to save your data. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    
    try {
      // Mark onboarding as completed even when skipping
      await apiFetch('/api/user-profile/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ onboarding_completed: true })
      });
      
      onSkip();
    } catch (error) {
      console.error('Error skipping onboarding:', error);
      // Still close the modal even if there's an error
      onSkip();
    } finally {
      setLoading(false);
    }
  };

  const handleStravaConnection = () => {
    // Get current JWT token for state parameter
    const token = localStorage.getItem('token');
    if (!token) {
      setErrors({ strava: 'Authentication error. Please refresh the page.' });
      return;
    }
    
    // Backend URL for redirect (not frontend)
    const backendBase = window.location.hostname === 'localhost' 
      ? 'http://localhost:8080' 
      : 'https://bikelab.app';
    const redirectUri = `${backendBase}/link_strava`;
    const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=165560&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=force&scope=read,activity:read_all&state=${encodeURIComponent(token)}`;
    

    
    // Open Strava auth in new window
    const popup = window.open(stravaAuthUrl, 'strava-auth', 'width=600,height=600');
    
    // Listen for messages from popup
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'STRAVA_CONNECTED') {
        // Update local storage with new token
        if (event.data.token) {
          localStorage.setItem('token', event.data.token);
        }
        
        // Close popup if still open
        if (popup && !popup.closed) {
          popup.close();
        }
        
        // Continue to next step or submit
        if (currentStep < totalSteps) {
          setCurrentStep(currentStep + 1);
        } else {
          handleSubmit();
        }
        
        // Clean up event listener
        window.removeEventListener('message', handleMessage);
      }
    };
    
    // Add event listener for popup messages
    window.addEventListener('message', handleMessage);
    
    // Fallback: if popup is manually closed, continue anyway
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        
        // Continue to next step even if we don't know if connection was successful
        if (currentStep < totalSteps) {
          setCurrentStep(currentStep + 1);
        } else {
          handleSubmit();
        }
      }
    }, 1000);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
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
                  value={formData.weight}
                  onChange={(e) => handleInputChange('weight', e.target.value)}
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
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                >
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
        );

      case 2:
        const calculatedZones = calculateHRZones();
        
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
                    onChange={(e) => handleInputChange('max_hr', e.target.value)}
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
                    onChange={(e) => handleInputChange('resting_hr', e.target.value)}
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
                    onChange={(e) => handleInputChange('lactate_threshold', e.target.value)}
                    placeholder="165"
                    min="120"
                    max="200"
                  />
                  {errors.lactate_threshold && <span className="error">{errors.lactate_threshold}</span>}
                  <p className="field-hint">From lactate test or FTP test (optional)</p>
                </div>
              </div>
              
              {calculatedZones && (
                <div className="zones-preview">
                  <h4>Calculated Heart Rate Zones:</h4>
                  <div className="zones-display">
                    <div className="zone-row">
                      <span className="zone-label">Zone 1 (Recovery):</span>
                      <span className="zone-range">{calculatedZones.zone1.min} - {calculatedZones.zone1.max} bpm</span>
                    </div>
                    <div className="zone-row">
                      <span className="zone-label">Zone 2 (Endurance):</span>
                      <span className="zone-range">{calculatedZones.zone2.min} - {calculatedZones.zone2.max} bpm</span>
                    </div>
                    <div className="zone-row">
                      <span className="zone-label">Zone 3 (Tempo):</span>
                      <span className="zone-range">{calculatedZones.zone3.min} - {calculatedZones.zone3.max} bpm</span>
                    </div>
                    <div className="zone-row">
                      <span className="zone-label">Zone 4 (Threshold):</span>
                      <span className="zone-range">{calculatedZones.zone4.min} - {calculatedZones.zone4.max} bpm</span>
                    </div>
                    <div className="zone-row">
                      <span className="zone-label">Zone 5 (VO2 Max):</span>
                      <span className="zone-range">{calculatedZones.zone5.min} - {calculatedZones.zone5.max} bpm</span>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="field-hint">* Leave fields empty to estimate based on age and experience level</p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <h2>Experience Level</h2>
            <p className="step-description">You can always add or change this information later in your profile</p>
            
            <div className="experience-levels">
              {experienceLevels.map(level => (
                <div
                  key={level.value}
                  className={`experience-level ${formData.experience_level === level.value ? 'selected' : ''}`}
                  onClick={() => handleInputChange('experience_level', level.value)}
                >
                  <div className="level-header">
                    <input
                      type="radio"
                      name="experience_level"
                      value={level.value}
                      checked={formData.experience_level === level.value}
                      onChange={() => handleInputChange('experience_level', level.value)}
                    />
                    <label>{level.label}</label>
                  </div>
                  <p className="level-description">{level.description}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 4:
        if (authType === 'strava') {
          // Email collection for Strava users
          return (
            <div className="step-content">
              <h2>Email Address</h2>
              <p className="step-description">We need your email address to send you important updates and training insights</p>
              
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                  required
                />
                {errors.email && <span className="error">{errors.email}</span>}
              </div>
              
              <p className="field-hint">This email will be used for notifications and account recovery</p>
            </div>
          );
        } else if (authType === 'email') {
          // Strava connection for email users
          return (
            <div className="step-content">
            
              
              <div className="strava-connection">
                <div className="strava-benefits">
                  <h3>By connecting Strava, you will:</h3>
                  <ul>
                    <li>Get an automatic activity sync</li>
                    <li>Detailed power analysis</li>
                    <li>Performance tracking</li>
                    <li>Training recommendations</li>
                  </ul>
                  <br />
                  <button 
                  type="button" 
                  className="strava-connect-btn accent-btn"
                  onClick={handleStravaConnection}
                  disabled={loading}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.917"/>
                  </svg>
                  Connect with Strava
                </button>
                </div>
                
               
                
                {errors.strava && <span className="error">{errors.strava}</span>}
                
                <p className="field-hint">You can always connect Strava later in your profile settings</p>
              </div>
            </div>
          );
        }
        return null;

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay onboarding-modal">
      <div className="main-logo-text">
          <img src={bl_logo} alt="BikeLab" />
         
        </div>
      {/* Video Background */}
      <iframe 
        className="onboarding-video-bg"
        src="https://www.youtube.com/embed/4wU7uNLvgKA?autoplay=1&loop=1&mute=1&playlist=4wU7uNLvgKA&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=0"
        title="YouTube video player" 
        frameBorder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      ></iframe>
      
      {/* Fallback Background Image */}
      <div 
        className="fallback-bg"
        style={{
          backgroundImage: `url('https://img.youtube.com/vi/y7ln90AROlc/maxresdefault.jpg')`
        }}
      ></div>


      
      {/* Overlay for better readability */}
      <div className="video-overlay"></div>
      
      <div className="modal-content onboarding-content">
        {/* Progress Bar */}
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
          <div className="progress-text">
          <b>Step {currentStep}</b> <span style={{opacity: 0.5}}>of {totalSteps}</span>
          </div>
        </div>

        <div className="onboarding-header">
        <p>Welcome to bikelab.app</p>
          <h1>Ready to <br /> improve riding experience?</h1>
          
        </div>
<br />
<br />
        <div className="onboarding-body">
          {renderStepContent()}
         
        </div>

        {errors.submit && (
          <div className="error-message">
            {errors.submit}
          </div>
        )}

        <div className="onboarding-actions">
          <button
            type="button"
            onClick={handleSkip}
            className="skip-button"
            disabled={loading}
          >
            Skip for now
          </button>
          
          <div className="navigation-buttons">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="prev-button"
                disabled={loading}
              >
                Previous
              </button>
            )}
            
            <button
              type="button"
              onClick={nextStep}
              className="accent-btn"
              disabled={loading}
            >
              {loading ? 'Saving...' : currentStep === totalSteps ? 'Complete Setup' : 'Next'}
            </button>
           
          </div>
         
        </div>
       
       
      </div>
    </div>
  );
} 