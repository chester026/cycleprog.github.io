import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import BlobOrb from '../components/BlobOrb';
import WeeklyTrainingCalendar from '../components/WeeklyTrainingCalendar';
import GoalsManager from '../components/GoalsManager';
import AddGoalModal from '../components/AddGoalModal';
import { TIER_CONFIG, getGoalTypeLabel, getGoalUnit } from '@bikelab/shared/constants';
import './GoalDetailPage.css';

// Big ring gauge for the goal-board's "Progress" column — same geometry as
// MaintenancePage.jsx's Bike Health gauge.
const GOAL_GAUGE_SIZE = 132;
const GOAL_GAUGE_STROKE = 7;
const GOAL_GAUGE_RADIUS = (GOAL_GAUGE_SIZE - GOAL_GAUGE_STROKE) / 2;
const GOAL_GAUGE_CIRCUMFERENCE = 2 * Math.PI * GOAL_GAUGE_RADIUS;

// TIER_CONFIG, getGoalTypeLabel/getGoalUnit moved to @bikelab/shared/constants
// (T-2.4, reconciled with BikeLabApp/src/components/MetaGoalCard.tsx's and
// BikeLabApp/src/screens/GoalDetailsScreen.tsx's copies).

// Mirrors the app's SCHEDULE_TYPE_COLORS.
const SCHEDULE_TYPE_COLORS = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

// Skill categories for grouping sub-goals into board columns.
//
// Turns out almost no real goal carries metric.skill: that field only
// exists for the rare goal created with an explicit "improve my climbing"
// intent (server/aiGoals.js: source: 'skills'). The vast majority of
// AI-generated goals measure a concrete ride stat instead
// (source: 'activity', e.g. { aggregate: 'avg', field: 'average_watts' }),
// so those are classified from metric.field/filter first. Count-style
// goals (aggregate: 'count'/'count_where') omit "field" entirely per the
// prompt schema (e.g. "3 long rides", "2 climbing intervals"), so those
// fall back to keywords in the goal's own AI-written title — which is
// reliably descriptive ("Climbing Interval Workouts", "Long Endurance
// Rides") even though it isn't structured data. Legacy (pre-redesign)
// goals have neither metric.skill nor a title written with this in mind,
// so they get one more fallback onto the old goal_type enum. Anything
// still unmatched lands in "Other".
const SKILL_GROUPS = [
  { key: 'climbing', label: 'Climbing' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'power', label: 'Power' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'other', label: 'Other' },
];

// metric.field values are a fixed enum in aiGoals.js's prompt schema.
const METRIC_FIELD_TO_SKILL = {
  total_elevation_gain: 'climbing',
  average_speed: 'sprint',
  max_speed: 'sprint',
  average_watts: 'power',
  distance: 'endurance',
  moving_time: 'endurance',
};

// Ordered so the most specific/unambiguous word wins first (e.g. a title
// with both "power" and "climbing" reads as a climbing goal that happens
// to mention power as context, so climbing is checked first).
const TITLE_KEYWORD_TO_SKILL = [
  { skill: 'climbing', pattern: /climb|hill|elevation|ascent|gradient|alpine|mountain/i },
  { skill: 'sprint', pattern: /sprint|time trial|acceleration|\bspeed\b/i },
  { skill: 'power', pattern: /power|watt|ftp|threshold/i },
  { skill: 'endurance', pattern: /endurance|long ride|\bdistance\b|volume|aerobic/i },
  { skill: 'consistency', pattern: /consisten|habit|ride count|frequency/i },
];

const LEGACY_GOAL_TYPE_TO_SKILL = {
  elevation: 'climbing',
  speed_hills: 'climbing',
  avg_hr_hills: 'climbing',
  distance: 'endurance',
  long_rides: 'endurance',
  time: 'endurance',
  rides_count: 'endurance',
  avg_power: 'power',
  ftp_vo2max: 'power',
  recovery: 'consistency',
  intervals: 'consistency',
  cadence: 'other',
  pulse: 'other',
  speed_flat: 'other',
};

function getGoalSkill(goal) {
  const skill = goal.metric?.skill;
  if (skill && SKILL_GROUPS.some((g) => g.key === skill)) return skill;

  const field = goal.metric?.field;
  if (field && METRIC_FIELD_TO_SKILL[field]) return METRIC_FIELD_TO_SKILL[field];

  // Count-style goals with no field but a distance filter ("3 rides over
  // 50km") are endurance goals in every real example in aiGoals.js.
  if (!field && goal.metric?.source === 'activity' && goal.metric?.filter?.min_distance) {
    return 'endurance';
  }

  const text = `${goal.title || ''} ${goal.description || ''}`;
  const keywordMatch = TITLE_KEYWORD_TO_SKILL.find((k) => k.pattern.test(text));
  if (keywordMatch) return keywordMatch.skill;

  if (goal.goal_type && LEGACY_GOAL_TYPE_TO_SKILL[goal.goal_type]) {
    return LEGACY_GOAL_TYPE_TO_SKILL[goal.goal_type];
  }

  return 'other';
}

export default function GoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [metaGoal, setMetaGoal] = useState(null);
  const [subGoals, setSubGoals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics' | 'schedule'

  const [userProfile, setUserProfile] = useState(null);

  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [showGoalsManager, setShowGoalsManager] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    target_date: '',
    status: 'active'
  });

  useEffect(() => {
    loadMetaGoal();
    loadActivities();
    loadUserProfile();
    loadScheduledEvents();
  }, [id]);

  // Only consumed by GoalsManager below (e.g. to compute a live preview when
  // creating an FTP/VO2max-type goal) — the redesigned Metrics/Trainings/
  // Schedule tabs above all read server-computed values instead.
  const loadActivities = async () => {
    try {
      const data = await apiFetch('/api/activities');
      setActivities(data || []);
    } catch (e) {
      console.error('Error loading activities:', e);
    }
  };

  const loadMetaGoal = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/meta-goals/${id}`);
      setMetaGoal(data.metaGoal);
      setSubGoals(data.subGoals || []);
      setEditForm({
        title: data.metaGoal.title,
        description: data.metaGoal.description || '',
        target_date: data.metaGoal.target_date || '',
        status: data.metaGoal.status || 'active'
      });
    } catch (e) {
      console.error('Error loading meta goal:', e);
      setError('Failed to load goal details');
    } finally {
      setLoading(false);
    }
  };

  // Feeds WeeklyTrainingCalendar's "Training Recommendations" section below
  // (mode="ai-generated") — restored from the pre-redesign page, which
  // fetched this the same way.
  const loadUserProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setUserProfile(data);
    } catch (e) {
      console.error('Error loading user profile:', e);
    }
  };

  // Every calendar_events row linked to this goal (past + future — the
  // server skips its usual date window entirely when goal_id is passed, see
  // GET /api/calendar in server.js). Same endpoint the app's Schedule tab uses.
  const loadScheduledEvents = async () => {
    try {
      setLoadingScheduled(true);
      const data = await apiFetch(`/api/calendar?goal_id=${id}`);
      setScheduledEvents(data || []);
    } catch (e) {
      console.error('Error loading scheduled sessions:', e);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const handleUpdateMetaGoal = async () => {
    try {
      await apiFetch(`/api/meta-goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      setShowEditModal(false);
      await loadMetaGoal();
    } catch (e) {
      console.error('Error updating meta goal:', e);
      alert('Failed to update goal');
    }
  };

  const handleDeleteMetaGoal = async () => {
    if (!window.confirm('Delete this goal and all sub-goals? This cannot be undone.')) {
      return;
    }
    try {
      await apiFetch(`/api/meta-goals/${id}`, { method: 'DELETE' });
      navigate('/goal-assistant');
    } catch (e) {
      console.error('Error deleting meta goal:', e);
      alert('Failed to delete goal');
    }
  };

  const handleCompleteGoal = async () => {
    if (!window.confirm('Mark this goal as completed?')) {
      return;
    }
    try {
      await apiFetch(`/api/meta-goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      await loadMetaGoal();
    } catch (e) {
      console.error('Error completing goal:', e);
      alert('Failed to complete goal');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No deadline';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Same local-time-parse trick the app's CalendarScreen/GoalDetailsScreen use:
  // a bare "YYYY-MM-DD" parses as UTC midnight, which would render a day early
  // for anyone west of UTC. Appending T00:00:00 (no "Z") forces local parsing.
  const formatScheduleDate = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Ahead/behind/on-track badge from the server-computed pace object (only
  // present for goals with both start_date/end_date — see goalCalculator.js's
  // addPaceData). Legacy sliding-window goals have no fixed dates, so
  // goal.pace is null for them, same as in the app.
  const getPaceBadge = (goal) => {
    if (!goal.pace) return null;
    if (goal.pace.onTrack) {
      return { label: 'On track', color: '#10b981' };
    }
    return goal.pace.percentDelta < 0
      ? { label: 'Behind schedule', color: '#ef4444' }
      : { label: 'Ahead of schedule', color: '#10b981' };
  };

  // Human-readable overall-status line under the progress ring — same role
  // as the app's computed rider profile ("Developing Rider") on the
  // Maintenance page's Bike Health card, but for a goal: prefers real
  // schedule data (any sub-goal behind schedule) over the plain percentage,
  // and falls back to a simple percent-based band otherwise.
  const getProgressStatusLabel = () => {
    if (relevantSubGoals.some((g) => getPaceBadge(g)?.label === 'Behind schedule')) {
      return 'Behind Schedule';
    }
    if (overallProgress >= 100) return 'Goal Achieved';
    if (overallProgress >= 75) return 'Almost There';
    if (overallProgress >= 50) return 'Making Progress';
    if (overallProgress >= 25) return 'Building Momentum';
    return 'Just Getting Started';
  };

  if (loading) {
    return (
      <div className="goal-detail-page">
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading goal details...</p>
        </div>
      </div>
    );
  }

  if (error || !metaGoal) {
    return (
      <div className="goal-detail-page">
        <div className="error-container">
          <h2>⚠️ {error || 'Goal not found'}</h2>
          <button onClick={() => navigate('/goal-assistant')} className="accent-btn">
            ← Back to Goals
          </button>
        </div>
      </div>
    );
  }

  const tier = metaGoal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const isHighTier = tier === 'legendary' || tier === 'epic' || tier === 'grand';
  const relevantSubGoals = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');

  // Same average-of-sub-goal-percentages logic as the app (ftp_vo2max
  // excluded — legacy special case with its own target_value semantics).
  // Apple Health data is client-only and app-only, so unlike the app the
  // web has no live override for health-source sub-goals — it reads the
  // last value the server computed.
  const overallProgress = (() => {
    if (relevantSubGoals.length === 0) return 0;
    const percentages = relevantSubGoals.map((g) => {
      const current = Number(g.current_value) || 0;
      const target = Number(g.target_value) || 1;
      return Math.min((current / target) * 100, 100);
    });
    return percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
  })();

  // metaGoal.target_date is basically never populated by the redesigned AI
  // prompt anymore — deadlines live per sub-goal as end_date instead of one
  // meta-goal-level field. Fall back to the latest sub-goal end_date so the
  // header pill reflects reality; legacy goals with target_date still win.
  const derivedDueDate = metaGoal.target_date || subGoals.reduce((latest, g) => {
    if (!g.end_date) return latest;
    return !latest || g.end_date > latest ? g.end_date : latest;
  }, null);

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

      <div className="page-header">
        <div className="header-top-row">
          <button onClick={() => navigate('/goal-assistant')} className="back-btn">
            ← Back to Goal Assistant
          </button>
          <div className="header-icon-actions">
            <button className="icon-btn" onClick={() => setShowEditModal(true)} title="Edit goal">
              <span className="material-symbols-outlined">edit</span>
            </button>
            <button className="icon-btn icon-btn-danger" onClick={handleDeleteMetaGoal} title="Delete goal">
              <span className="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>

        <div className="title-row">
          <h1>{metaGoal.title}</h1>
        </div>

        <div className="meta-row">
          {isHighTier && (
            <span className="tier-badge" style={{ background: tierCfg.color }}>
              {tierCfg.label}
            </span>
          )}
          <span className="pill">
            <span className="material-symbols-outlined pill-icon">calendar_month</span>
            {derivedDueDate ? `Due: ${formatDate(derivedDueDate)}` : 'No deadline'}
          </span>
          <span className="pill">
            <span
              className="status-dot"
              style={{ background: metaGoal.status === 'completed' ? '#9ca3af' : '#22c55e' }}
            />
            {metaGoal.status === 'completed' ? 'Completed' : 'Active'}
          </span>
        </div>

        {metaGoal.description && (
          <p className="description">{metaGoal.description}</p>
        )}

      </div>

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
              <div className="goal-board-column goal-board-column-progress">
                <div className="goal-board-column-header">
                  <span className="goal-board-section-title">Progress</span>
                </div>
                <div className="goal-board-column-cards">
                  <div className="goal-board-card goal-progress-card">
                    <div className="goal-gauge-wrap">
                      <svg width={GOAL_GAUGE_SIZE} height={GOAL_GAUGE_SIZE}>
                        <circle
                          cx={GOAL_GAUGE_SIZE / 2} cy={GOAL_GAUGE_SIZE / 2} r={GOAL_GAUGE_RADIUS}
                          stroke="#DDDDE0" strokeWidth={GOAL_GAUGE_STROKE} fill="none"
                        />
                        <circle
                          cx={GOAL_GAUGE_SIZE / 2} cy={GOAL_GAUGE_SIZE / 2} r={GOAL_GAUGE_RADIUS}
                          stroke="#1A1A1A" strokeWidth={GOAL_GAUGE_STROKE} fill="none"
                          strokeDasharray={`${(overallProgress / 100) * GOAL_GAUGE_CIRCUMFERENCE} ${GOAL_GAUGE_CIRCUMFERENCE}`}
                          strokeLinecap="round"
                          transform={`rotate(-90 ${GOAL_GAUGE_SIZE / 2} ${GOAL_GAUGE_SIZE / 2})`}
                        />
                      </svg>
                      <div className="goal-gauge-label">
                        <div className="goal-gauge-val-row">
                          <span className="goal-gauge-val">{Math.round(overallProgress)}</span>
                          <span className="goal-gauge-suffix">%</span>
                        </div>
                        <div className="goal-gauge-caption">Progress</div>
                      </div>
                    </div>
                    <div className="goal-progress-title">{getProgressStatusLabel()}</div>
                  </div>

                  <button
                    className="goal-board-card goal-coach-card"
                    onClick={() => navigate('/goal-assistant', {
                      state: { initialPrompt: `Can you give me some advice about my goal "${metaGoal.title}"?` }
                    })}
                  >
                    <span className="goal-coach-icon material-symbols-outlined">auto_awesome</span>
                    <span className="goal-coach-text">
                      <span className="goal-coach-title">Ask your AI coach</span>
                      <span className="goal-coach-subtitle">Get any advice about this goal</span>
                    </span>
                    <span className="goal-coach-chevron">›</span>
                  </button>
                </div>
              </div>

              {SKILL_GROUPS.map((group) => {
                const goalsInGroup = relevantSubGoals.filter((g) => getGoalSkill(g) === group.key);
                if (goalsInGroup.length === 0) return null;

                return (
                  <div className="goal-board-column" key={group.key}>
                    <div className="goal-board-column-header">
                      <span className="goal-board-section-title">{group.label}</span>
                    </div>
                    <div className="goal-board-column-cards">
                      {goalsInGroup.map((goal) => {
                        const current = Number(goal.current_value) || 0;
                        const target = Number(goal.target_value) || 1;
                        const percentage = Math.min((current / target) * 100, 100);
                        const safePercentage = isFinite(percentage) ? percentage : 0;
                        const label = goal.title || getGoalTypeLabel(goal.goal_type);
                        const unit = goal.unit || getGoalUnit(goal.goal_type);
                        const paceBadge = getPaceBadge(goal);

                        return (
                          <div key={goal.id} className="goal-board-card metric-card">
                            <div className="metric-card-header">
                              <span className="metric-title">{label}</span>
                              {paceBadge && (
                                <span
                                  className="pace-badge"
                                  style={{ background: `${paceBadge.color}18`, color: paceBadge.color }}
                                >
                                  {paceBadge.label}
                                </span>
                              )}
                            </div>

                            {goal.description && (
                              <p className="metric-description">{goal.description}</p>
                            )}

                            <div className="progress-row">
                              <div className="progress-bar">
                                <div
                                  className="progress-fill"
                                  style={{
                                    width: `${safePercentage}%`,
                                    background: safePercentage >= 100 ? '#10b981' : safePercentage >= 50 ? '#f59e0b' : '#ef4444'
                                  }}
                                />
                              </div>
                              <span className="progress-percentage">{Math.round(safePercentage)}%</span>
                            </div>

                            <div className="stats-row">
                              <span className="stat-text">Current:<br/> <b className="stat-value">{current.toFixed(1)} {unit}</b></span>
                              <span className="stat-text">Target:<br/> <b className="stat-value">{target.toFixed(1)} {unit}</b></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Schedule Tab — calendar_events linked to this goal (goal_id) */}
      {activeTab === 'schedule' && (
        <section className="tab-section">
          {loadingScheduled ? (
            <div className="loading-container small">
              <div className="loader small"></div>
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

      {/* Training Recommendations — WeeklyTrainingCalendar, restored from
          the pre-redesign page (was dropped when the Metrics/Trainings/
          Scheduled tabs replaced the old single-column layout). Always
          visible below the tabs, same as it was before. */}
      {relevantSubGoals.length > 0 && (
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
      {metaGoal.status !== 'completed' && overallProgress >= 75 && (
        <div className="complete-btn-wrap">
          <button className="complete-btn" onClick={handleCompleteGoal}>
            <span className="complete-check">✓</span>
            Complete
          </button>
        </div>
      )}

      {/* Edit Modal — kept from the previous web-only design (the app has no
          manual edit UI for meta-goal metadata; declarative goals here are
          still user-editable on the web by design decision). */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Goal</h2>
              <button onClick={() => setShowEditModal(false)} className="modal-close-btn">×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Goal title"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Goal description"
                  rows={4}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Target Date</label>
                  <input
                    type="date"
                    value={editForm.target_date}
                    onChange={(e) => setEditForm({ ...editForm, target_date: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button onClick={handleUpdateMetaGoal} className="accent-btn">
                  Save Changes
                </button>
                <button onClick={() => setShowEditModal(false)} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddGoalModal && (
        <AddGoalModal
          isOpen={showAddGoalModal}
          onClose={() => setShowAddGoalModal(false)}
          onGoalCreated={loadMetaGoal}
          metaGoalId={parseInt(id)}
        />
      )}

      {/* Goals Manager */}
      {showGoalsManager && (
        <GoalsManager
          isOpen={showGoalsManager}
          onClose={() => setShowGoalsManager(false)}
          activities={activities}
          onGoalsUpdate={loadMetaGoal}
        />
      )}
    </div>
  );
}
