import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { calculateGoalProgress } from '../utils/goalsCache';
import './MetaGoalRow.css';

export default function MetaGoalRow({ metaGoal, activities, onClick, onStatusChange }) {
  const [subGoals, setSubGoals] = useState([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadSubGoals();
  }, [metaGoal.id]);

  useEffect(() => {
    if (subGoals.length > 0 && activities.length > 0) {
      calculateProgress();
    }
  }, [subGoals, activities]);

  const loadSubGoals = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/goals`);
      // Фильтруем только подцели этой мета-цели
      const filtered = data.filter(g => g.meta_goal_id === metaGoal.id);
      setSubGoals(filtered);
    } catch (e) {
      console.error('Error loading sub-goals:', e);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = () => {
    // Исключаем FTP цели - они теперь в Analytics
    const relevantGoals = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');
    
    if (relevantGoals.length === 0) {
      setProgress(0);
      return;
    }

    // Вычисляем прогресс для каждой подцели
    const progressValues = relevantGoals.map(goal => {
      const current = goal.current_value || 0;
      const target = goal.target_value || 1;
      return Math.min((current / target) * 100, 100);
    });

    // Средний прогресс
    const avgProgress = progressValues.reduce((sum, p) => sum + p, 0) / progressValues.length;
    setProgress(Math.round(avgProgress));
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

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
      setUpdating(true);
      await apiFetch(`/api/meta-goals/${metaGoal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metaGoal,
          status: 'completed'
        })
      });
      
      // Вызываем callback для перезагрузки мета-целей
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="meta-goal-row" onClick={onClick}>
      <div className="meta-goal-main">
        <div className="meta-goal-header">
          <div className="meta-goal-info">
            <div className="meta-goal-title-row">
              <h3>{metaGoal.title}</h3>
              {metaGoal.status === 'completed' && (
                <span className="status-badge completed">Completed</span>
              )}
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

