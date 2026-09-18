import React from 'react';
import styles from './ErrorMessage.module.css';

/**
 * Single `.error-message` replacement (W-21). Before this, the same class
 * name was defined 7 times with slightly different colors/spacing:
 *   - src/pages/AnalysisPage.css:207        (red, centered)
 *   - src/pages/GoalAssistantPage.css:247   (red-tinted card + shake anim)
 *   - src/pages/ProfilePage.css:418         (red-tinted card)
 *   - src/pages/TrainingsPage.css:320       (plain red text)
 *   - src/components/EventsManager.css:240  (red-tinted card, centered)
 *   - src/components/OnboardingModal.css:368 (red-tinted card)
 *   - src/components/RideAddModal.css:113   (inline field-error text)
 * None of that CSS is deleted here (pages/components still use their own
 * `.error-message` class until each is migrated) — this is the new
 * component those migrations should render instead.
 */
export default function ErrorMessage({ children, inline = false, className }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={[styles.error, inline ? styles.inline : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
