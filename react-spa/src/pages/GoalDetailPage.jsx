import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BlobOrb from '../components/BlobOrb';
import WeeklyTrainingCalendar from '../components/WeeklyTrainingCalendar';
import GoalsManager from '../components/GoalsManager';
import AddGoalModal from '../components/AddGoalModal';
import GoalHeader from './goals/GoalHeader';
import SubGoalsTable from './goals/SubGoalsTable';
import ProgressSection from './goals/ProgressSection';
import { formatScheduleDate, filterRelevantSubGoals, averagePercent } from './goals/lib';
import {
  useMetaGoal,
  useProfile,
  useCalendar,
  useSaveMetaGoal,
} from '../data/hooks';
import { Loader, ErrorMessage, useConfirm, useToast } from '../ui';
import './GoalDetailPage.css';

// Mirrors the app's SCHEDULE_TYPE_COLORS.
const SCHEDULE_TYPE_COLORS = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

// T-6.3 part 2: GoalDetailPage split into GoalHeader, SubGoalsTable and
// ProgressSection. The skill-classification helpers
// (SKILL_GROUPS/getGoalSkill/...), getPaceBadge, date formatting and the
// overall-progress average all moved to `./goals/lib.js` — this file is now
// just the tab shell + data wiring. Every number those pieces render comes
// straight from the sub-goal rows `GET /api/meta-goals/:id` already
// computed (`current_value`/`percent`/`pace`) — no client recompute
// (audit W-08 follow-up).
export default function GoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: metaGoalData, isLoading: loading, error: metaGoalError, refetch: refetchMetaGoal } = useMetaGoal(id);
  const metaGoal = metaGoalData?.metaGoal ?? null;
  const subGoals = metaGoalData?.subGoals ?? [];

  // Feeds WeeklyTrainingCalendar's "Training Recommendations" section below
  // (mode="ai-generated") — restored from the pre-redesign page, which
  // fetched this the same way.
  const { data: userProfile } = useProfile();

  // Every calendar_events row linked to this goal (past + future — the
  // server skips its usual date window entirely when goal_id is passed, see
  // GET /api/calendar in server.js). Same endpoint the app's Schedule tab uses.
  const { data: scheduledEventsData, isLoading: loadingScheduled } = useCalendar({ goalId: id });
  const scheduledEvents = scheduledEventsData || [];

  const saveMetaGoal = useSaveMetaGoal();
  const toast = useToast();
  const [confirmComplete, confirmCompleteDialog] = useConfirm();

  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics' | 'schedule'
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [showGoalsManager, setShowGoalsManager] = useState(false);

  const handleCompleteGoal = async () => {
    const ok = await confirmComplete({ title: 'Mark this goal as completed?' });
    if (!ok) return;
    try {
      await saveMetaGoal.mutateAsync({ id, body: { status: 'completed' } });
    } catch (e) {
      console.error('Error completing goal:', e);
      toast.error('Failed to complete goal');
    }
  };

  if (loading) {
    return (
      <div className="goal-detail-page">
        <div className="loading-container">
          <Loader label="Loading goal details..." />
        </div>
      </div>
    );
  }

  if (metaGoalError || !metaGoal) {
    return (
      <div className="goal-detail-page">
        <div className="error-container">
          <ErrorMessage>{metaGoalError ? 'Failed to load goal details' : 'Goal not found'}</ErrorMessage>
          <button onClick={() => navigate('/goal-assistant')} className="accent-btn">
            ← Back to Goals
          </button>
        </div>
      </div>
    );
  }

  const relevantSubGoals = filterRelevantSubGoals(subGoals);

  return (
    <div className="goal-detail-page">
      {/* Blob + blur backdrop behind the header, same combo as the app's
          heroBackground/BlobOrb/BlurView — scrolls away with the header
          since it's positioned absolute only behind the header block. */}
      <div className="hero-background" aria-hidden="true">
        <div className="blob-container">
          <BlobOrb size={850} />
        </div>
      </div>

      <GoalHeader
        metaGoal={metaGoal}
        onBack={() => navigate('/goal-assistant')}
        onDeleted={() => navigate('/goal-assistant')}
      />

      {/* Tabs — Add Goal / Manage Goals sit at the right end of this same
          row on the Metrics tab, instead of their own row below. */}
      <div className="tabs-container">
        <div className="tabs-list">
          <button
            className={`tab ${activeTab === 'metrics' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            Metrics
          </button>
          <button
            className={`tab ${activeTab === 'schedule' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            Scheduled
          </button>
        </div>

        {activeTab === 'metrics' && (
          <div className="goals-actions">
            <button className="btn-secondary" onClick={() => setShowAddGoalModal(true)}>
              <span className="material-symbols-outlined">add</span>
              Add Goal
            </button>
            <button className="btn-primary" onClick={() => setShowGoalsManager(true)}>
              <span className="material-symbols-outlined">tune</span>
              Manage Goals
            </button>
          </div>
        )}
      </div>

      {/* Metrics Tab — Trello-style board, same pattern as /maintenance:
          leftmost column is the AI-coach progress card, the rest hold the
          sub-goal cards two per column. Grid auto-fit + minmax wraps columns
          onto new rows as the viewport narrows — no scroll, no breakpoints. */}
      {activeTab === 'metrics' && (
        <section className="tab-section">
          {relevantSubGoals.length === 0 ? (
            <div className="no-goals">
              <p>No sub-goals defined yet.</p>
              <button className="btn-primary" onClick={() => setShowAddGoalModal(true)}>
                Add Your First Goal
              </button>
            </div>
          ) : (
            <div className="goal-board">
              <ProgressSection metaGoal={metaGoal} relevantSubGoals={relevantSubGoals} />
              <SubGoalsTable subGoals={relevantSubGoals} />
            </div>
          )}
        </section>
      )}

      {/* Schedule Tab — calendar_events linked to this goal (goal_id) */}
      {activeTab === 'schedule' && (
        <section className="tab-section">
          {loadingScheduled ? (
            <div className="loading-container small">
              <Loader label="Loading schedule..." size="sm" />
            </div>
          ) : scheduledEvents.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-text">No sessions scheduled yet</p>
              <p className="empty-state-subtext">Ask the coach to build a training plan for this goal.</p>
            </div>
          ) : (
            [...scheduledEvents]
              .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
              .map((ev) => (
                <div key={ev.id} className="schedule-row">
                  <div
                    className="schedule-dot"
                    style={{ background: SCHEDULE_TYPE_COLORS[ev.type] || SCHEDULE_TYPE_COLORS.planned_ride }}
                  />
                  <div className="schedule-content">
                    <span className={`schedule-title ${ev.completed ? 'schedule-title-done' : ''}`}>
                      {ev.title}
                    </span>
                    <span className="schedule-date">{formatScheduleDate(ev.start_date)}</span>
                  </div>
                  {ev.completed && <span className="schedule-done-badge">Done</span>}
                </div>
              ))
          )}
        </section>
      )}

      {/* Training Recommendations — WeeklyTrainingCalendar, below the
          Metrics board only. The Scheduled tab is the coach-built plan
          itself, so showing the plan generator there again read as a
          duplicate (owner feedback). */}
      {activeTab === 'metrics' && relevantSubGoals.length > 0 && (
        <section className="training-center-section">
          <h2>Training Recommendations</h2>
          <WeeklyTrainingCalendar
            goals={relevantSubGoals}
            userProfile={userProfile}
            metaGoal={metaGoal}
            mode="ai-generated"
          />
        </section>
      )}

      {/* Fixed footer CTA — only shows once the rider is actually close to
          done, same 75% threshold as the app. */}
      {metaGoal.status !== 'completed' && averagePercent(relevantSubGoals) >= 75 && (
        <div className="complete-btn-wrap">
          <button className="complete-btn" onClick={handleCompleteGoal}>
            <span className="complete-check">✓</span>
            Complete
          </button>
        </div>
      )}

      {confirmCompleteDialog}

      {/* Add Goal Modal */}
      {showAddGoalModal && (
        <AddGoalModal
          isOpen={showAddGoalModal}
          onClose={() => setShowAddGoalModal(false)}
          onGoalCreated={refetchMetaGoal}
          metaGoalId={parseInt(id)}
        />
      )}

      {/* Goals Manager */}
      {showGoalsManager && (
        <GoalsManager
          isOpen={showGoalsManager}
          onClose={() => setShowGoalsManager(false)}
          onGoalsUpdate={refetchMetaGoal}
        />
      )}
    </div>
  );
}
