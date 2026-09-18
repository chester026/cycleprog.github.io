import React, { useState } from 'react';
import { useTrainingPlan, useTrainingTypes } from '../data/hooks';
import { ErrorMessage, Loader } from '../ui';
import { PlanHeader } from './training/PlanHeader';
import { DayGrid } from './training/DayGrid';
import { PriorityWorkouts } from './training/PriorityWorkouts';
import { ProfileSettingsForm } from './training/ProfileSettingsForm';
import { groupTrainings, getFullDayName } from './training/lib';
import TrainingDayModal from './TrainingDayModal';
import TrainingDetailsModal from './TrainingDetailsModal';
import TrainingLibraryModal from './TrainingLibraryModal';
import './WeeklyTrainingCalendar.css';

/**
 * The weekly training plan (T-6.3, audit W-21) — split from a single
 * 1156-line file into this shell (state/composition) plus:
 *   - `training/lib.js`      pure week/priority math (unit tested)
 *   - `training/PlanHeader`  view toggle + AI-plan popover + settings button
 *   - `training/DayGrid`     the "Manual Plan" clickable week grid
 *   - `training/PriorityWorkouts` the "AI-Generated" Training Center cards
 *   - `training/ProfileSettingsForm` the "Personal settings" panel
 * plus the three modals (`TrainingDayModal`, `TrainingDetailsModal`,
 * `TrainingLibraryModal`), each now on `src/ui`'s `Modal` and this
 * page's `useTrainingPlan`/`useTrainingTypes` data hooks instead of a
 * hand-rolled `apiFetch` + `useState` loading/error dance.
 */
const WeeklyTrainingCalendar = ({
  metaGoal = null, // Мета-цель с AI-сгенерированными trainingTypes
  mode = null, // Режим: 'ai-generated' для GoalDetailPage
}) => {
  const { data: weeklyPlan, isLoading, isError, refetch } = useTrainingPlan();
  const { data: trainingTypes = [] } = useTrainingTypes();

  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [viewMode, setViewMode] = useState('generated'); // 'generated' или 'manual'
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);

  const handleDayClick = (dayKey, dayPlan) => {
    setSelectedDay({ key: dayKey, plan: dayPlan });
    setModalOpen(true);
  };

  const handleHowToRideClick = (training) => {
    setSelectedTraining(training);
    setDetailsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="weekly-calendar">
        <Loader label="Loading training plan..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="weekly-calendar">
        <h3>Weekly Training Recommendations</h3>
        <div className="calendar-message">
          <h4>Loading Error</h4>
          <ErrorMessage>Ошибка загрузки плана тренировок</ErrorMessage>
          <button
            onClick={() => refetch()}
            style={{
              background: '#667eea',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '10px',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const grouped = groupTrainings({ mode, metaGoal, trainingTypes, weeklyPlan });

  return (
    <div className="weekly-calendar">
      <PlanHeader
        isFallbackPlan={weeklyPlan?.isFallbackPlan}
        fallbackMessage={weeklyPlan?.fallbackMessage}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onToggleProfileSettings={() => setShowProfileSettings((prev) => !prev)}
      />

      {viewMode === 'generated' ? (
        <PriorityWorkouts grouped={grouped} onHowToRide={handleHowToRideClick} onOpenLibrary={() => setLibraryModalOpen(true)} />
      ) : (
        weeklyPlan?.plan && (
          <DayGrid
            weeklyPlan={weeklyPlan}
            customPlan={weeklyPlan?.customPlan || {}}
            trainingTypes={trainingTypes}
            onDayClick={handleDayClick}
          />
        )
      )}

      {weeklyPlan?.analysis && weeklyPlan.analysis.length > 0 && (
        <div className="goals-analysis">
          <h4>Goal Priority Analysis</h4>
          {weeklyPlan.analysis.map((goal, index) => (
            <div key={index} className="goal-priority">
              <div className="goal-info">
                <div className="goal-name">{goal.goalType}</div>
                <div className="goal-progress">
                  Progress: {(goal.progress || 0).toFixed(1)}% ({goal.currentValue || 0} / {goal.targetValue || 0}{' '}
                  {goal.unit || ''})
                </div>
              </div>
              <div className="goal-priority-score">{(goal.priority || 0).toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}

      <TrainingDayModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        dayKey={selectedDay?.key}
        dayName={selectedDay?.key ? getFullDayName(selectedDay.key) : ''}
        currentTraining={selectedDay?.plan}
      />

      <TrainingDetailsModal isOpen={detailsModalOpen} onClose={() => setDetailsModalOpen(false)} training={selectedTraining} />

      <TrainingLibraryModal
        isOpen={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onTrainingClick={(trainingType) => {
          const trainingData = {
            name: trainingType.name,
            type: trainingType.key,
            trainingType: trainingType.key,
            recommendation: trainingType.description,
            details: {
              intensity: trainingType.intensity,
              duration: trainingType.duration,
              cadence: trainingType.cadence,
              hr_zones: trainingType.hr_zones,
              structure: trainingType.structure,
              benefits: trainingType.benefits,
            },
          };
          handleHowToRideClick(trainingData);
          setLibraryModalOpen(false);
        }}
      />

      <ProfileSettingsForm open={showProfileSettings} onSaved={() => setShowProfileSettings(false)} />
    </div>
  );
};

export default WeeklyTrainingCalendar;
