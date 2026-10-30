import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetaGoals } from '../../data/hooks';
import { ErrorMessage, Loader } from '../../ui';
import MetaGoalRow from '../../components/MetaGoalRow';
import './MetaGoalList.css';

const EMPTY_HINTS = {
  active: 'Ask the coach above to set a goal — it builds a personalized training plan for you.',
  completed: 'Completed goals will appear here.',
};

/**
 * The coach home's Goals panel: Active/Completed filter + the list of
 * `MetaGoalRow`s. Self-contained — fetches `useMetaGoals()` itself; a
 * failed request shows an error, never an empty "No active goals".
 */
export default function MetaGoalList() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active');

  const { data: metaGoalsData, isLoading, isError } = useMetaGoals();
  const metaGoals = metaGoalsData || [];
  const visibleGoals = metaGoals.filter((mg) => mg.status === activeTab);

  return (
    <section className="meta-goals-section" aria-labelledby="meta-goals-heading">
      <div className="meta-goals-header">
        <h2 id="meta-goals-heading" className="section-eyebrow">
          Personalized Goals
        </h2>

        <div className="goals-tabs" role="tablist" aria-label="Goal status">
          {['active', 'completed'].map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'active' ? 'Active' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Loader label="Loading goals..." tone="light" />
      ) : isError ? (
        <ErrorMessage>Failed to load your goals.</ErrorMessage>
      ) : visibleGoals.length === 0 ? (
        <div className="no-goals">
          <h3>No {activeTab} goals</h3>
          <p>{EMPTY_HINTS[activeTab]}</p>
        </div>
      ) : (
        <div className="meta-goals-list">
          {visibleGoals.map((metaGoal) => (
            <MetaGoalRow key={metaGoal.id} metaGoal={metaGoal} onClick={() => navigate(`/goals/${metaGoal.id}`)} />
          ))}
        </div>
      )}
    </section>
  );
}
