import React from 'react';
import { useNavigate } from 'react-router-dom';
import { averagePercent, getProgressStatusLabel } from './lib';

const GOAL_GAUGE_SIZE = 132;
const GOAL_GAUGE_STROKE = 7;
const GOAL_GAUGE_RADIUS = (GOAL_GAUGE_SIZE - GOAL_GAUGE_STROKE) / 2;
const GOAL_GAUGE_CIRCUMFERENCE = 2 * Math.PI * GOAL_GAUGE_RADIUS;

/**
 * GoalDetailPage's leftmost "Progress" board column (T-6.3 part 2): the
 * ring gauge + "Ask your AI coach" card. `overallProgress` is the average
 * of each sub-goal's server-computed `percent` (no client recompute —
 * audit W-08 follow-up). Nothing else lives here on purpose: the
 * per-sub-goal ProgressChart breakdown a decomposition pass added was
 * AnalysisPage's block chart misapplied to a page with no history and was
 * removed at the owner's request.
 */
export default function ProgressSection({ metaGoal, relevantSubGoals }) {
  const navigate = useNavigate();
  const overallProgress = averagePercent(relevantSubGoals);

  return (
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
          <div className="goal-progress-title">{getProgressStatusLabel(overallProgress, relevantSubGoals)}</div>
        </div>

        <button
          className="goal-board-card goal-coach-card"
          onClick={() => navigate('/goal-assistant', {
            state: { initialPrompt: `Can you give me some advice about my goal "${metaGoal.title}"?` },
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
  );
}
