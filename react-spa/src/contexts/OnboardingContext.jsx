import React, { useState, useEffect, useCallback } from 'react';
import { call, userProfile } from '../data/api';
import OnboardingModal from '../components/OnboardingModal';
import { useAuth } from '../auth/AuthProvider';
import { OnboardingContext } from './useOnboarding';
import { logError } from '../lib/log';

const PROFILE_404_MAX_RETRIES = 3;
const PROFILE_404_RETRY_MS = 2000;
const PROFILE_CREATE_GRACE_MS = 1000;

export const OnboardingProvider = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const checkOnboardingStatus = useCallback(async (retryCount = 0) => {
    try {
      const profile = await call(userProfile.get);

      if (profile && typeof profile === 'object' && !profile.onboarding_completed) {
        setShowOnboarding(true);
        setIsFirstLogin(true);
      }
    } catch (error) {
      logError(error, 'Error checking onboarding status');

      // Right after a fresh signup the profile row may not exist yet (404)
      // — retry a few times before giving up.
      if (retryCount < PROFILE_404_MAX_RETRIES && error.status === 404) {
        setTimeout(() => {
          checkOnboardingStatus(retryCount + 1);
        }, PROFILE_404_RETRY_MS);
      }
    }
  }, []);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setIsFirstLogin(false);
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    setIsFirstLogin(false);
  };

  useEffect(() => {
    // Check onboarding status once AuthProvider's initial refresh has
    // settled (T-6.1) — replaces the old `localStorage.getItem('token')`
    // check, which only knew about a token that had already been set.
    if (isLoading) return;
    if (isAuthenticated) {
      checkOnboardingStatus().catch((e) => logError(e, 'Error checking onboarding status'));
    }

    const handleOnboardingComplete = () => {
      setShowOnboarding(false);
      setIsFirstLogin(false);
    };

    // `tokenUpdated` (ExchangeTokenPage) fires after a fresh login/token
    // exchange, when there's no `token` key in Storage left to listen for a
    // `storage` event on. The server creates the profile row asynchronously
    // after the exchange, hence the delay before the first check.
    const handleTokenUpdate = () => {
      setTimeout(() => {
        checkOnboardingStatus();
      }, PROFILE_CREATE_GRACE_MS);
    };

    window.addEventListener('onboardingComplete', handleOnboardingComplete);
    window.addEventListener('tokenUpdated', handleTokenUpdate);

    return () => {
      window.removeEventListener('onboardingComplete', handleOnboardingComplete);
      window.removeEventListener('tokenUpdated', handleTokenUpdate);
    };
  }, [isAuthenticated, isLoading, checkOnboardingStatus]);

  return (
    <OnboardingContext.Provider
      value={{
        showOnboarding,
        isFirstLogin,
        checkOnboardingStatus,
        handleOnboardingComplete,
        handleOnboardingSkip,
      }}
    >
      {children}
      <OnboardingModal isOpen={showOnboarding} onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />
    </OnboardingContext.Provider>
  );
};
