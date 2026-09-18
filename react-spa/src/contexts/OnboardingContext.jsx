import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import OnboardingModal from '../components/OnboardingModal';
import { useAuth } from '../auth/AuthProvider';
import { OnboardingContext } from './useOnboarding';

export const OnboardingProvider = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const checkOnboardingStatus = useCallback(async (retryCount = 0) => {
    try {
      const profile = await apiFetch('/api/user-profile');

      // Проверяем, что profile это объект, а не Response
      if (profile && typeof profile === 'object' && !profile.onboarding_completed) {
        console.log('🎯 OnboardingContext: пользователь нуждается в онбординге');
        setShowOnboarding(true);
        setIsFirstLogin(true);
      } else {
        console.log('✅ OnboardingContext: онбординг уже завершен');
      }
    } catch (error) {
      console.error('❌ Error checking onboarding status:', error);

      // Retry logic для случаев когда профиль еще не создан
      if (retryCount < 3 && error.status === 404) {
        console.log(`🔄 OnboardingContext: retry #${retryCount + 1} через 2 секунды...`);
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
      console.log('🔄 OnboardingContext: получено событие завершения онбординга');
      setShowOnboarding(false);
      setIsFirstLogin(false);
    };

    // Слушаем кастомное событие обновления токена (из ExchangeTokenPage) —
    // fires after a fresh login/token exchange, when there's no `token`
    // key in Storage left to listen for a `storage` event on.
    const handleTokenUpdate = () => {
      console.log('🔄 OnboardingContext: получено событие обновления токена');
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
