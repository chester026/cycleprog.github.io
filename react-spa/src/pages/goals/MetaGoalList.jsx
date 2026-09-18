import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetaGoals } from '../../data/hooks';
import { Loader } from '../../ui';
import MetaGoalRow from '../../components/MetaGoalRow';

/**
 * GoalAssistantPage's "Personalized Goals" section (T-6.3 part 2): the
 * Active/Completed tabs + the list of `MetaGoalRow`s. Self-contained —
 * fetches its own `useMetaGoals()` — since nothing above it in the page
 * needs the meta-goals list.
 */
export default function MetaGoalList() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'

  const { data: metaGoalsData, isLoading: loading } = useMetaGoals();
  const metaGoals = metaGoalsData || [];
  const visibleGoals = metaGoals.filter((mg) => mg.status === activeTab);

  return (
    <section className="meta-goals-section">
      <div className="section-header">
        <h2>Personalized Goals</h2>

        <div className="goals-tabs">
          <button
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active
          </button>
          <button
            className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed
          </button>
        </div>
      </div>

      {loading ? (
        <Loader label="Loading goals..." />
      ) : visibleGoals.length === 0 ? (
        <div className="no-goals">
          <div className="no-goals-icon"></div>
          <h3>No {activeTab} goals</h3>
          <p>
            {activeTab === 'active'
              ? 'Describe your cycling goal above and let AI create a personalized training plan for you.'
              : 'Completed goals will appear here.'}
          </p>
        </div>
      ) : (
        <div className="meta-goals-list">
          {visibleGoals.map((metaGoal) => (
            <MetaGoalRow
              key={metaGoal.id}
              metaGoal={metaGoal}
              onClick={() => navigate(`/goal-assistant/${metaGoal.id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
