import { createContext, useContext } from 'react';

// Split out of OnboardingContext.jsx (T-6.3 lint pass): react-refresh's
// only-export-components rule wants a file that exports a component (the
// Provider) to export nothing else, so the context object + hook live here
// and OnboardingContext.jsx re-exports `useOnboarding` for its existing
// callers (ExchangeTokenPage.jsx) to keep importing from the same path.
export const OnboardingContext = createContext();

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
