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

  const checkOnboardingStatus = async () => {
    try {
      const profile = await apiFetch('/api/user-profile');
      
      // Проверяем, что profile это объект, а не Response
      if (profile && typeof profile === 'object' && !profile.onboarding_completed) {
        setShowOnboarding(true);
        setIsFirstLogin(true);
      }
    } catch (error) {
      console.error('❌ Error checking onboarding status:', error);
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
      checkOnboardingStatus();
    }
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