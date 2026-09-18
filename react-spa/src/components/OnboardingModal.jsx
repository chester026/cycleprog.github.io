import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfile, useCompleteOnboarding, useChangeEmail } from '../data/hooks';
import { isApiError } from '../utils/api';
import { startStravaLink } from '../utils/strava';
import Step1PersonalInfo from './onboarding/Step1PersonalInfo';
import Step2HrZones from './onboarding/Step2HrZones';
import Step3Experience from './onboarding/Step3Experience';
import { INITIAL_FORM_DATA, getAuthType, getTotalSteps, validateStep, buildOnboardingPayload } from './onboarding/lib';
import './OnboardingModal.css';
import bl_logo from '../assets/img/logo/bl_logo_white.png';

// T-6.3 decomposition (audit W-21/W-32): this file used to hold all four
// wizard steps' JSX inline (680 lines) plus a page-local `apiFetch`-in-a-
// `useEffect` profile load. Steps 1-3 now live in `./onboarding/StepN*.jsx`
// (mirroring BikeLabApp/src/screens/Onboarding/), the shared pure helpers
// in `./onboarding/lib.js`; this file keeps the wizard shell (progress
// bar, step 4's Strava/email branch, nav buttons, submit) and the data
// hooks. The full-bleed video background + slide-in panel chrome below is
// intentionally NOT rebuilt on top of `src/ui`'s `Modal` — that primitive
// is a centered card dialog and has no way to host this full-viewport
// video hero without visibly changing it; adopting it here would trade a
// real pixel regression for architectural purity the guide explicitly
// ranks below "same pixels".
export default function OnboardingModal({ isOpen, onComplete, onSkip }) {
  const { login } = useAuth();
  const { data: userProfile } = useProfile();
  const completeOnboarding = useCompleteOnboarding();
  const changeEmail = useChangeEmail();

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState({});

  const authType = getAuthType(userProfile);
  const totalSteps = getTotalSteps(authType);
  const loading = completeOnboarding.isPending || changeEmail.isPending;

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const nextStep = () => {
    const stepErrors = validateStep(currentStep, formData, authType);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    try {
      await completeOnboarding.mutateAsync(buildOnboardingPayload(formData));

      if (authType === 'strava' && formData.email) {
        // POST /api/user-profile/email mints a fresh access token (the
        // email just changed) but no new refresh token — login() updates
        // only the in-memory access token (T-6.1) and leaves the existing
        // refresh token alone.
        const emailResponse = await changeEmail.mutateAsync(formData.email);
        if (emailResponse.token) {
          await login({ token: emailResponse.token });
        }
      }

      window.dispatchEvent(new CustomEvent('onboardingComplete', { detail: { authType, tokenUpdated: true } }));
      onComplete();
    } catch (error) {
      const message =
        isApiError(error) && error.code === 'EMAIL_TAKEN'
          ? 'That email is already used by another account.'
          : 'Failed to save your data. Please try again.';
      setErrors({ submit: message });
    }
  };

  const handleSkip = async () => {
    try {
      await completeOnboarding.mutateAsync({ onboarding_completed: true });
      onSkip();
    } catch {
      // Still close the modal even if there's an error — matches the
      // original behaviour (skipping must never trap the user in the wizard).
      onSkip();
    }
  };

  const handleStravaConnection = async () => {
    let popup;
    try {
      popup = await startStravaLink({ popup: true });
    } catch {
      setErrors({ strava: 'Authentication error. Please refresh the page.' });
      return;
    }
    if (!popup) {
      setErrors({ strava: 'Could not open the Strava connection window.' });
      return;
    }

    // Listen for messages from popup. The popup no longer carries a JWT —
    // it just tells us linking succeeded (see docs/audit/layers/01-server.md
    // S-07); this window's own session token is unaffected by linking.
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'strava-linked') {
        if (popup && !popup.closed) popup.close();
        if (currentStep < totalSteps) {
          setCurrentStep(currentStep + 1);
        } else {
          handleSubmit();
        }
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);

    // Fallback: if popup is manually closed, continue anyway.
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        if (currentStep < totalSteps) {
          setCurrentStep(currentStep + 1);
        } else {
          handleSubmit();
        }
      }
    }, 1000);
  };

  const renderStepContent = () => {
    if (currentStep === 1) {
      return <Step1PersonalInfo formData={formData} errors={errors} onChange={handleInputChange} />;
    }
    if (currentStep === 2) {
      return <Step2HrZones formData={formData} errors={errors} onChange={handleInputChange} profile={userProfile} />;
    }
    if (currentStep === 3) {
      return <Step3Experience formData={formData} onChange={handleInputChange} />;
    }
    if (currentStep === 4 && authType === 'strava') {
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
    }
    if (currentStep === 4 && authType === 'email') {
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
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.917" />
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
        style={{ backgroundImage: `url('https://img.youtube.com/vi/y7ln90AROlc/maxresdefault.jpg')` }}
      ></div>

      {/* Overlay for better readability */}
      <div className="video-overlay"></div>

      <div className="modal-content onboarding-content">
        {/* Progress Bar */}
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(currentStep / totalSteps) * 100}%` }}></div>
          </div>
          <div className="progress-text">
            <b>Step {currentStep}</b> <span style={{ opacity: 0.5 }}>of {totalSteps}</span>
          </div>
        </div>

        <div className="onboarding-header">
          <p>Welcome to bikelab.app</p>
          <h1>
            Ready to <br /> improve riding experience?
          </h1>
        </div>
        <br />
        <br />
        <div className="onboarding-body">{renderStepContent()}</div>

        {errors.submit && <div className="error-message">{errors.submit}</div>}

        <div className="onboarding-actions">
          <button type="button" onClick={handleSkip} className="skip-button" disabled={loading}>
            Skip for now
          </button>

          <div className="navigation-buttons">
            {currentStep > 1 && (
              <button type="button" onClick={prevStep} className="prev-button" disabled={loading}>
                Previous
              </button>
            )}

            <button type="button" onClick={nextStep} className="accent-btn" disabled={loading}>
              {loading ? 'Saving...' : currentStep === totalSteps ? 'Complete Setup' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
