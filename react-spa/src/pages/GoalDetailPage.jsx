import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { createActivitiesHash, updateGoalsWithCache } from '../utils/goalsCache';
import GoalCard from '../components/GoalCard';
import WeeklyTrainingCalendar from '../components/WeeklyTrainingCalendar';
import GoalsAnalysis from '../components/GoalsAnalysis';
import GoalsManager from '../components/GoalsManager';
import AddGoalModal from '../components/AddGoalModal';
import './GoalDetailPage.css';

export default function GoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [metaGoal, setMetaGoal] = useState(null);
  const [subGoals, setSubGoals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  }, [id]);

  // Автоматическое обновление целей при изменении активностей
  useEffect(() => {
    if (activities.length > 0 && subGoals.length > 0) {
      const activitiesHash = createActivitiesHash(activities);
      const isFirstLoad = !updateGoalsOnActivitiesChange.lastHash;
      
      if (updateGoalsOnActivitiesChange.lastHash !== activitiesHash || isFirstLoad) {
        updateGoalsOnActivitiesChange.lastHash = activitiesHash;
        updateGoalsOnActivitiesChange(activities, isFirstLoad);
      }
    }
  }, [activities, subGoals.length]);

  const loadMetaGoal = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await apiFetch(`/api/meta-goals/${id}`);
      if (!silent) {
        console.log('📊 Loaded meta goal data:', data);
        console.log('📊 SubGoals count:', data.subGoals?.length || 0);
      }
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
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadActivities = async () => {
    try {
      const data = await apiFetch('/api/activities');
      setActivities(data || []);
    } catch (e) {
      console.error('Error loading activities:', e);
    }
  };

  const loadUserProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setUserProfile(data);
    } catch (e) {
      console.error('Error loading user profile:', e);
    }
  };

  // Функция для автоматического обновления целей при изменении активностей
  const updateGoalsOnActivitiesChange = async (newActivities, isFirstLoad = false) => {
    if (!newActivities || newActivities.length === 0) {
      return;
    }
    
    try {
      // Получаем все цели этой мета-цели
      const goals = subGoals.filter(g => g.meta_goal_id == id);
      
      if (goals.length === 0) {
        return;
      }
      
      // Пересчитываем прогресс целей на основе активностей
      const updatedGoals = await updateGoalsWithCache(newActivities, goals, userProfile);
      
      // Проверяем, есть ли изменения в прогрессе
      const hasChanges = updatedGoals.some((updatedGoal, index) => {
        const originalGoal = goals[index];
        
        // Пропускаем некоторые типы на первой загрузке
        if (updatedGoal.goal_type === 'avg_hr_hills' || updatedGoal.goal_type === 'speed_hills' || updatedGoal.goal_type === 'speed_flat') {
          if (isFirstLoad) {
            return false;
          }
        }
        
        return updatedGoal.current_value !== originalGoal.current_value;
      });
      
      if (hasChanges) {
        console.log('🔄 Sub-goals progress changed, updating in database...');
        
        // Обновляем каждую цель в базе данных
        for (const goal of updatedGoals) {
          try {
            // Пропускаем некоторые типы на первой загрузке
            if (goal.goal_type === 'avg_hr_hills' || goal.goal_type === 'speed_hills' || goal.goal_type === 'speed_flat') {
              if (isFirstLoad) {
                continue;
              }
            }
            
            await apiFetch(`/api/goals/${goal.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                current_value: goal.current_value
              })
            });
          } catch (error) {
            console.error(`Error updating goal ${goal.id}:`, error);
          }
        }
        
        // Перезагружаем мета-цель чтобы обновился прогресс sub-goals (без показа лоадера)
        console.log('✅ Sub-goals updated, reloading meta-goal silently...');
        await loadMetaGoal(true); // silent = true
      }
    } catch (error) {
      console.error('Error in updateGoalsOnActivitiesChange:', error);
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

  const formatDate = (dateString) => {
    if (!dateString) return 'No deadline';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

  return (
    <div className="goal-detail-page">
      {/* Header */}
      <div className="page-header">
        <button onClick={() => navigate('/goal-assistant')} className="back-btn">
          ← Back to Goal Assistant
        </button>
        
        <div className="header-content">
          <div className="header-main">
            
            <div className="goal-info">
              <div className="goal-title-row">
                <h1>{metaGoal.title}</h1>
                {metaGoal.status === 'completed' && (
                  <span className="status-badge completed">Completed</span>
                )}
              </div>
              <p className="goal-description">{metaGoal.description}</p>
              <br />
              <div className="goal-meta">
                
                <span className="badge">
                  Due: {formatDate(metaGoal.target_date)}
                </span>
                <span className="badge">
                  Status: {metaGoal.status}
                </span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            <button onClick={() => setShowEditModal(true)} className="secondary-btn">
              Edit
            </button>
            <button onClick={handleDeleteMetaGoal} className="danger-btn">
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Goals Grid */}
      <section className="goals-section">
        <div className="goals-section-header">
          <h2>Generated Goals</h2>
          <div className="goals-actions">
            <button 
              className="btn-secondary"
              onClick={() => setShowAddGoalModal(true)}
            >
              <span className="material-symbols-outlined">add</span>
              Add Goal
            </button>
            <button 
              className="btn-primary"
              onClick={() => setShowGoalsManager(true)}
            >
              <span className="material-symbols-outlined">tune</span>
              Manage Goals
            </button>
          </div>
        </div>

        {subGoals.length === 0 ? (
          <div className="no-goals">
            <p>No sub-goals defined yet.</p>
            <button 
              className="btn-primary"
              onClick={() => setShowAddGoalModal(true)}
            >
              Add Your First Goal
            </button>
          </div>
        ) : (
          <div className="goals-grid">
            {subGoals
              .filter(goal => goal.goal_type !== 'ftp_vo2max') // Исключаем FTP цели - они теперь в Analysis
              .sort((a, b) => (a.priority || 3) - (b.priority || 3))
              .map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  showActions={false}
                />
              ))}
          </div>
        )}
      </section>

      {/* Training Center */}
      {subGoals.filter(g => g.goal_type !== 'ftp_vo2max').length > 0 && (
        <section className="training-center-section">
          <h2>Training Recommendations</h2>
          <br />
          <WeeklyTrainingCalendar
            goals={subGoals.filter(g => g.goal_type !== 'ftp_vo2max')}
            userProfile={userProfile}
            metaGoal={metaGoal}
            mode="ai-generated"
          />
        </section>
      )}

      {/* Goals Analysis */}
      {subGoals.filter(g => g.goal_type !== 'ftp_vo2max').length > 0 && activities.length > 0 && (
        <section className="goals-analysis-section">
          <GoalsAnalysis
            goals={subGoals.filter(g => g.goal_type !== 'ftp_vo2max')}
            activities={activities}
          />
        </section>
      )}

      {/* Edit Modal */}
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
          userProfile={userProfile}
          onGoalsUpdate={loadMetaGoal}
          metaGoalId={parseInt(id)}
        />
      )}
    </div>
  );
}

