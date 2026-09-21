import React, { useMemo } from 'react';
import { isMetaGoalExpired } from '@bikelab/shared/calc';
import { useSaveMetaGoal } from '../data/hooks';
import { useToast } from '../ui';
import { averagePercent, filterRelevantSubGoals } from '../pages/goals/lib';
import './MetaGoalRow.css';

// Sub-goals (with server-computed current_value/percent) come inline on
// `metaGoal.sub_goals` from GET /api/meta-goals — no per-row GET /api/goals
// anymore (T-3.4, W-33, docs/audit/layers/03-react-spa.md W-33: "MetaGoalRow
// N+1"). `activities` is no longer needed here for that reason.
export default function MetaGoalRow({ metaGoal, onClick, onStatusChange }) {
  const saveMetaGoal = useSaveMetaGoal();
  const toast = useToast();
  const updating = saveMetaGoal.isPending;
  const loading = false;

  // Averages the server-computed `percent` field (T-6.3, audit W-08 follow-
  // up) — FTP goals excluded, they live in Analytics now. No more client
  // recompute of current_value/target_value as a fallback: every sub-goal
  // row from GET /api/meta-goals already carries `percent`. (The unused
  // `formatDate` helper that used to sit here — dead even before this
  // change, no call site — is deleted rather than moved.)
  const progress = useMemo(() => {
    return Math.round(averagePercent(filterRelevantSubGoals(metaGoal.sub_goals || [])));
  }, [metaGoal.sub_goals]);

  // Past its target date and still open — the row greys out and says so.
  // Nothing auto-completes it: only the rider (or the coach, after asking)
  // closes or extends a goal. Same helper the app and the coach use.
  const expired = isMetaGoalExpired(metaGoal);

  const getStatusColor = () => {
    if (progress >= 80) return '#10b981'; // green
    if (progress >= 50) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  // Обрезаем описание до первого предложения
  const getTruncatedDescription = (text) => {
    if (!text) return '';
    // Ищем первое предложение (до точки, восклицательного или вопросительного знака)
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text;
  };

  const handleMarkAsCompleted = async (e) => {
    e.stopPropagation(); // Останавливаем всплытие события, чтобы не открылась страница деталей

    if (updating) return;

    try {
      await saveMetaGoal.mutateAsync({ id: metaGoal.id, body: { ...metaGoal, status: 'completed' } });

      // Вызываем callback для перезагрузки мета-целей
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update goal status');
    }
  };

  return (
    <div
      className={`meta-goal-row${expired ? ' expired' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      }}
    >
      <div className="meta-goal-main">
        <div className="meta-goal-header">
          <div className="meta-goal-info">
            <div className="meta-goal-title-row">
              <h3>{metaGoal.title}</h3>
              {metaGoal.status === 'completed' && (
                <span className="status-badge completed">Completed</span>
              )}
              {expired && <span className="status-badge expired">Expired</span>}
            </div>
            <p className="meta-goal-description">{getTruncatedDescription(metaGoal.description)}</p>
          </div>
        </div>
        
      
      </div>

      <div className="meta-goal-progress">
        <svg className="circular-progress" viewBox="0 0 100 100">
          <circle
            className="progress-bg"
            cx="50"
            cy="50"
            r="45"
          />
          <circle
            className="progress-circle"
            cx="50"
            cy="50"
            r="45"
            style={{
              stroke: getStatusColor(),
              strokeDasharray: `${2 * Math.PI * 45}`,
              strokeDashoffset: `${2 * Math.PI * 45 * (1 - progress / 100)}`
            }}
          />
          
        </svg>
        <text
            x="50"
            y="50"
            className="progress-text"
            dominantBaseline="middle"
            textAnchor="middle"
            style={{ fill: getStatusColor() }}
          >
            {loading ? '...' : `${progress}%`}
          </text>
      </div>

      {metaGoal.status === 'active' && (
        <button 
          className="complete-btn" 
          onClick={handleMarkAsCompleted}
          disabled={updating}
          title="Complete"
        >
          {updating ? '...' : '✓'}
        </button>
      )}

      <div className="meta-goal-arrow">→</div>
    </div>
  );
}

