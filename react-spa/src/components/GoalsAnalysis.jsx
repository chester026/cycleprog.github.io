import React, { useMemo } from 'react';
import './GoalsAnalysis.css';

export default function GoalsAnalysis({ goals, activities }) {
  const analysis = useMemo(() => {
    if (!goals || goals.length === 0 || !activities || activities.length === 0) {
      return null;
    }

    // Анализ целей по типам
    const goalsByType = {};
    goals.forEach(goal => {
      if (!goalsByType[goal.goal_type]) {
        goalsByType[goal.goal_type] = [];
      }
      goalsByType[goal.goal_type].push(goal);
    });

    // Вычисляем средний прогресс
    const progressValues = goals.map(goal => {
      if (goal.goal_type === 'ftp_vo2max') {
        const current = goal.target_value || 0;
        const target = 60;
        return Math.min((current / target) * 100, 100);
      }
      const current = goal.current_value || 0;
      const target = goal.target_value || 1;
      return Math.min((current / target) * 100, 100);
    });

    const avgProgress = progressValues.reduce((sum, p) => sum + p, 0) / progressValues.length;

    // Определяем критичные цели (прогресс < 30%)
    const criticalGoals = goals.filter((goal, idx) => progressValues[idx] < 30);

    // Определяем цели близкие к выполнению (прогресс >= 80%)
    const nearCompletionGoals = goals.filter((goal, idx) => progressValues[idx] >= 80);

    // Анализ активностей по неделям
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const recentActivities = activities.filter(a => new Date(a.start_date) >= fourWeeksAgo);

    const weeklyStats = {
      rides: recentActivities.length,
      totalDistance: recentActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000,
      totalTime: recentActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600,
      totalElevation: recentActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0)
    };

    // Рекомендации на основе анализа
    const recommendations = [];

    if (avgProgress < 50) {
      recommendations.push({
        type: 'warning',
        title: 'Low Overall Progress',
        message: 'Consider reviewing your goals or increasing training frequency.',
        icon: '⚠️'
      });
    }

    if (criticalGoals.length > 0) {
      recommendations.push({
        type: 'critical',
        title: `${criticalGoals.length} Goal${criticalGoals.length > 1 ? 's' : ''} Need Attention`,
        message: `Focus on: ${criticalGoals.map(g => g.title).join(', ')}`,
        icon: '🔴'
      });
    }

    if (nearCompletionGoals.length > 0) {
      recommendations.push({
        type: 'success',
        title: `${nearCompletionGoals.length} Goal${nearCompletionGoals.length > 1 ? 's' : ''} Almost Complete`,
        message: 'Great job! Keep up the momentum.',
        icon: '🎉'
      });
    }

    if (weeklyStats.rides < 3) {
      recommendations.push({
        type: 'info',
        title: 'Increase Training Frequency',
        message: `You've completed ${weeklyStats.rides} rides in the last 4 weeks. Try to maintain 3-5 rides per week.`,
        icon: '📅'
      });
    }

    return {
      avgProgress: Math.round(avgProgress),
      goalsByType,
      criticalGoals,
      nearCompletionGoals,
      weeklyStats,
      recommendations
    };
  }, [goals, activities]);

  if (!analysis) {
    return null;
  }

  const getProgressColor = (progress) => {
    if (progress >= 80) return '#10b981';
    if (progress >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getRecommendationClass = (type) => {
    switch (type) {
      case 'critical': return 'rec-critical';
      case 'warning': return 'rec-warning';
      case 'success': return 'rec-success';
      case 'info': return 'rec-info';
      default: return 'rec-info';
    }
  };

  return (
    <div className="goals-analysis">
      <h2>Goals Analysis</h2>
      
      {/* Overall Progress */}
      <div className="analysis-card">
        <h3>Overall Progress</h3>
        <div className="progress-circle-container">
          <div 
            className="progress-circle" 
            style={{ 
              background: `conic-gradient(${getProgressColor(analysis.avgProgress)} ${analysis.avgProgress * 3.6}deg, #3a3f4a 0deg)` 
            }}
          >
            <div className="progress-circle-inner">
              <span className="progress-percentage">{analysis.avgProgress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Stats */}
      <div className="analysis-card">
        <h3>Last 4 Weeks</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Rides</span>
            <span className="stat-value">{analysis.weeklyStats.rides}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{analysis.weeklyStats.totalDistance.toFixed(1)} km</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Time</span>
            <span className="stat-value">{analysis.weeklyStats.totalTime.toFixed(1)} hrs</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Elevation</span>
            <span className="stat-value">{Math.round(analysis.weeklyStats.totalElevation)} m</span>
          </div>
        </div>
      </div>

      {/* Goals by Type */}
      <div className="analysis-card">
        <h3>Goals by Type</h3>
        <div className="goals-type-list">
          {Object.entries(analysis.goalsByType).map(([type, typeGoals]) => (
            <div key={type} className="goal-type-item">
              <span className="goal-type-name">{type.replace(/_/g, ' ')}</span>
              <span className="goal-type-count">{typeGoals.length}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div className="analysis-card recommendations-card">
          <h3>Recommendations</h3>
          <div className="recommendations-list">
            {analysis.recommendations.map((rec, idx) => (
              <div key={idx} className={`recommendation-item ${getRecommendationClass(rec.type)}`}>
                <div className="rec-icon">{rec.icon}</div>
                <div className="rec-content">
                  <h4>{rec.title}</h4>
                  <p>{rec.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

