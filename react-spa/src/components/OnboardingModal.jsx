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
    gender: '',
    experience_level: 'intermediate'
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const experienceLevels = [
    { value: 'beginner', label: 'Beginner', description: 'New to cycling or returning after a long break. Focus on building basic fitness and getting comfortable on the bike.' },
    { value: 'intermediate', label: 'Intermediate', description: 'Regular cyclist with some training experience. Ready for structured workouts and performance improvement.' },
    { value: 'advanced', label: 'Advanced', description: 'Experienced cyclist with structured training. Looking for advanced techniques and race-specific preparation.' }
  ];

  const totalSteps = 3;

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
        // Heart rate zones are optional
        break;
      case 3:
        // Experience level has default value
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
      // Filter out empty values
      const dataToSend = Object.fromEntries(
        Object.entries(formData).filter(([_, value]) => value !== '')
      );
      
      const response = await apiFetch('/api/user-profile/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      });
      
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
        return (
          <div className="step-content">
            <h2>Heart Rate Zones</h2>
            <p className="step-description">You can always add or change this information later in your profile</p>
            
            <div className="hr-zones-section">
              <div className="form-group">
               
                <textarea
                  id="hr_zones"
                  value={formData.hr_zones}
                  onChange={(e) => handleInputChange('hr_zones', e.target.value)}
                  placeholder="Zone 1: 120-140, Zone 2: 140-160, Zone 3: 160-170, Zone 4: 170-180, Zone 5: 180+"
                  rows="4"
                />
                
                <p className="field-hint">* If leave this empty we estimate based on your age</p>
              </div>
              
              
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
        src="https://www.youtube.com/embed/BkBLr2zipto?autoplay=1&loop=1&mute=1&playlist=BkBLr2zipto&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=0"
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