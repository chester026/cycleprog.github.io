import React from 'react';
import { getGoalTypeLabel, getGoalUnit } from '@bikelab/shared/constants';
import { groupSubGoalsBySkill, getPaceBadge } from './lib';

/**
 * GoalDetailPage's Metrics-tab board columns (T-6.3 part 2): one column per
 * skill group, two metric cards per goal. All numbers (`current_value`,
 * `target_value`, `percent`, `pace`) are read straight off the sub-goal row
 * exactly as `GET /api/meta-goals/:id` computed them — nothing here
 * recalculates a percentage. Renders only the skill columns — the leftmost
 * "Progress" column is `ProgressSection`, and the empty state / outer
 * `.goal-board` grid stay in `GoalDetailPage` since both the progress
 * column and this table appear/disappear together based on whether there
 * are any sub-goals at all.
 */
export default function SubGoalsTable({ subGoals }) {
  const groups = groupSubGoalsBySkill(subGoals);

  return (
    <>
      {groups.map((group) => (
        <div className="goal-board-column" key={group.key}>
          <div className="goal-board-column-header">
            <span className="goal-board-section-title">{group.label}</span>
          </div>
          <div className="goal-board-column-cards">
            {group.goals.map((goal) => {
              const current = Number(goal.current_value) || 0;
              const target = Number(goal.target_value) || 1;
              const percentage = Number(goal.percent) || 0;
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
                          width: `${percentage}%`,
                          background: percentage >= 100 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="progress-percentage">{Math.round(percentage)}%</span>
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
      ))}
    </>
  );
}
