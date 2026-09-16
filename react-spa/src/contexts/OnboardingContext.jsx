import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import OnboardingModal from '../components/OnboardingModal';

const OnboardingContext = createContext();

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};

export const OnboardingProvider = ({ children }) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const checkOnboardingStatus = async (retryCount = 0) => {
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
      if (retryCount < 3 && error.message?.includes('404')) {
        console.log(`🔄 OnboardingContext: retry #${retryCount + 1} через 2 секунды...`);
        setTimeout(() => {
          checkOnboardingStatus(retryCount + 1);
        }, 2000);
      }
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setIsFirstLogin(false);
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    setIsFirstLogin(false);
  };

  useEffect(() => {
    // Check onboarding status when the app loads
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      checkOnboardingStatus().catch(console.error);
    }

    // Слушаем кастомное событие завершения онбординга
    const handleOnboardingComplete = () => {
      console.log('🔄 OnboardingContext: получено событие завершения онбординга');
      setShowOnboarding(false);
      setIsFirstLogin(false);
    };

    // Слушаем изменения localStorage для реагирования на новые токены
    const handleStorageChange = (e) => {
      if (e.key === 'token' && e.newValue) {
        console.log('🔄 OnboardingContext: обнаружен новый токен, проверяем онбординг');
        setTimeout(() => {
          checkOnboardingStatus();
        }, 500); // Увеличиваем задержку для создания профиля
      }
    };

    // Слушаем кастомное событие обновления токена (из ExchangeTokenPage)
    const handleTokenUpdate = () => {
      console.log('🔄 OnboardingContext: получено событие обновления токена');
      setTimeout(() => {
        checkOnboardingStatus();
      }, 1000); // Задержка для создания профиля на сервере
    };

    window.addEventListener('onboardingComplete', handleOnboardingComplete);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('tokenUpdated', handleTokenUpdate);

    return () => {
      window.removeEventListener('onboardingComplete', handleOnboardingComplete);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('tokenUpdated', handleTokenUpdate);
    };
  }, []);

  return (
    <OnboardingContext.Provider value={{
      showOnboarding,
      isFirstLogin,
      checkOnboardingStatus,
      handleOnboardingComplete,
      handleOnboardingSkip
    }}>
      {children}
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    </OnboardingContext.Provider>
  );
}; 