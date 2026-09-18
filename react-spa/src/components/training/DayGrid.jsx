import React from 'react';
import { DAY_KEYS, getDayName, getDayTraining, getCompositeDescription } from './lib';

/**
 * The "Manual Plan" week grid (T-6.3, audit W-21): one clickable card per
 * day showing its custom training (or "Add training" when empty).
 *
 * Extracted from WeeklyTrainingCalendar's `renderCalendarDay` — only its
 * `viewMode === 'manual'` branch: the `viewMode === 'generated'` branch was
 * dead code (the caller only ever rendered this grid for the manual view;
 * the generated view renders `PriorityWorkouts` instead), so it was
 * dropped rather than ported.
 */
export function DayGrid({ weeklyPlan, customPlan, trainingTypes, onDayClick }) {
  return (
    <div className="calendar-grid">
      {DAY_KEYS.map((dayKey) => {
        const currentTraining = getDayTraining({ viewMode: 'manual', dayKey, customPlan, weeklyPlan });
        const isCustom = Boolean(customPlan?.[dayKey] || weeklyPlan?.customPlan?.[dayKey]);
        const displayClass = isCustom ? 'custom' : 'empty';

        return (
          <div
            key={dayKey}
            className={`calendar-day ${displayClass}`}
            data-type={currentTraining?.type || 'empty'}
            onClick={() => onDayClick(dayKey, currentTraining || null)}
            style={{ cursor: 'pointer' }}
          >
            <div className="day-header">
              <span className="day-name">{getDayName(dayKey)}</span>
              <span className="day-type">
                {currentTraining?.type === 'rest' ? 'Rest' : currentTraining?.type ? 'Training' : 'Empty'}
              </span>
              {isCustom && <span className="custom-indicator">✏️</span>}
            </div>
            <div className="day-content">
              {currentTraining?.type === 'composite' && currentTraining?.parts ? (
                <div className="composite-workout-details">
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#666',
                      marginBottom: '8px',
                      fontWeight: 500,
                    }}
                  >
                    {getCompositeDescription(currentTraining.parts, trainingTypes)}
                  </div>
                  {currentTraining.parts.map((part, index) => (
                    <div key={index} className="workout-part">
                      <div className="part-name">
                        {trainingTypes.find((t) => t.key === part.type)?.name || part.type}
                      </div>
                      <div className="part-info">
                        <span>{part.duration} min</span>
                        <span>{part.intensity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : currentTraining?.type === 'rest' ? (
                <div className="rest-day-content">
                  <div className="rest-icon">😴</div>
                  <div className="rest-text">Rest day</div>
                </div>
              ) : currentTraining?.details && currentTraining?.type !== 'rest' ? (
                <div className="workout-details">
                  <div>
                    <strong>Intensity:</strong> {currentTraining.details.intensity}
                  </div>
                  <div>
                    <strong>Duration:</strong> {currentTraining.details.duration}
                  </div>
                  <div>
                    <strong>Cadence:</strong> {currentTraining.details.cadence}
                  </div>
                </div>
              ) : !currentTraining ? (
                <div className="empty-day-content">
                  <div className="empty-icon">+</div>
                  <div className="empty-text">Add training</div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DayGrid;
