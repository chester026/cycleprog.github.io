import React, { useState } from 'react';
import styles from './PlanHeader.module.css';

/**
 * The weekly calendar's top bar (T-6.3, audit W-21): fallback-plan notice,
 * generated/manual view toggle, the "How it works?" AI popover, and the
 * "Personal settings" button. Extracted verbatim from
 * WeeklyTrainingCalendar.jsx's render, minus two `display: none` popovers
 * ("training types" / "Tips") that were unreachable dead UI.
 */
export function PlanHeader({ isFallbackPlan, fallbackMessage, viewMode, onViewModeChange, onToggleProfileSettings }) {
  const [showAITip, setShowAITip] = useState(false);

  return (
    <>
      {isFallbackPlan && (
        <div className="fallback-plan-notice">
          <span className="material-symbols-outlined">info</span>
          <div className="fallback-plan-text">
            <strong>Basic Training Plan</strong>
            <p>{fallbackMessage}</p>
          </div>
        </div>
      )}

      <div className="calendar-header">
        <div className="view-mode-toggle">
          <button
            className={`toggle-btn ${viewMode === 'generated' ? 'active' : ''}`}
            onClick={() => onViewModeChange('generated')}
          >
            <span className="material-symbols-outlined">star_shine</span> AI-Generated
          </button>
          <button
            className={`toggle-btn ${viewMode === 'manual' ? 'active' : ''}`}
            onClick={() => onViewModeChange('manual')}
          >
            Manual Plan
          </button>
        </div>

        <div className={styles.actions}>
          <span
            className={styles.howItWorksLink}
            onMouseEnter={() => setShowAITip(true)}
            onMouseLeave={() => setShowAITip(false)}
            title="How AI generates your plan"
          >
            How it works?
          </span>
          {showAITip && (
            <div className={styles.popover}>
              <div className={styles.popoverItem}>
                <strong>Goal Analysis:</strong> AI analyzes your current goals and progress to determine training
                priorities.
              </div>
              <div className={styles.popoverItem}>
                <strong>Fitness Assessment:</strong> Your recent activities help assess current fitness level and
                areas for improvement.
              </div>
              <div className={styles.popoverItem}>
                <strong>Personalization:</strong> Training types are selected based on your experience level,
                available time, and preferences.
              </div>
              <div className={styles.popoverItem}>
                <strong>Adaptive Updates:</strong> The plan automatically adjusts as you progress and achieve your
                goals.
              </div>
            </div>
          )}

          <button className="settings-btn" onClick={onToggleProfileSettings}>
            Personal settings
          </button>
        </div>
      </div>
    </>
  );
}

export default PlanHeader;
