import React, { useState, useEffect, useCallback } from 'react';
import { call, userProfile } from '../data/api';
import OnboardingModal from '../components/OnboardingModal';
import { useAuth } from '../auth/AuthProvider';
import { OnboardingContext } from './useOnboarding';

export const OnboardingProvider = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const checkOnboardingStatus = useCallback(async (retryCount = 0) => {
    try {
      const profile = await call(userProfile.get);

      // Проверяем, что profile это объект, а не Response
      if (profile && typeof profile === 'object' && !profile.onboarding_completed) {
        console.log('🎯 OnboardingContext: user needs onboarding');
        setShowOnboarding(true);
        setIsFirstLogin(true);
      } else {
        console.log('✅ OnboardingContext: onboarding already completed');
      }
    } catch (error) {
      console.error('❌ Error checking onboarding status:', error);

      // Retry logic для случаев когда профиль еще не создан
      if (retryCount < 3 && error.status === 404) {
        console.log(`🔄 OnboardingContext: retry #${retryCount + 1} in 2 seconds...`);
        setTimeout(() => {
          checkOnboardingStatus(retryCount + 1);
        }, 2000);
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
      checkOnboardingStatus().catch(console.error);
    }

    // Слушаем кастомное событие завершения онбординга
    const handleOnboardingComplete = () => {
      console.log('🔄 OnboardingContext: received onboarding-complete event');
      setShowOnboarding(false);
      setIsFirstLogin(false);
    };

    // Слушаем кастомное событие обновления токена (из ExchangeTokenPage) —
    // fires after a fresh login/token exchange, when there's no `token`
    // key in Storage left to listen for a `storage` event on.
    const handleTokenUpdate = () => {
      console.log('🔄 OnboardingContext: received token-update event');
      setTimeout(() => {
        checkOnboardingStatus();
      }, 1000); // Задержка для создания профиля на сервере
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
