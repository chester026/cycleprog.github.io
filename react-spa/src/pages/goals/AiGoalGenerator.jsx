import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGenerateAiGoals } from '../../data/hooks';
import { useToast } from '../../ui';
import { isApiError } from '../../utils/api';
import { isRelevantToCycling } from './lib';

/**
 * The AI input row + quick templates from GoalAssistantPage's hero (T-6.3
 * part 2). Reports its `generating` state up to `GoalsHero` (which owns the
 * blob/heading chrome around it) via `onGeneratingChange`, since that
 * visual belongs to the hero shell, not this input.
 */
export default function AiGoalGenerator({ onGeneratingChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const generateAiGoals = useGenerateAiGoals();
  const generating = generateAiGoals.isPending;

  const [goalInput, setGoalInput] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  // Prefill from GoalDetailPage's "Ask coach for a plan" CTA (Trainings tab
  // empty state) — it navigates here with { state: { initialPrompt } } since
  // this input is the closest equivalent to the app's dedicated CoachChat
  // screen. Consumed once so it doesn't reappear on back/forward.
  useEffect(() => {
    const prefill = location.state?.initialPrompt;
    if (prefill) {
      setGoalInput(prefill);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateGoal = async () => {
    if (!goalInput.trim()) {
      setError('Please describe your goal');
      return;
    }

    if (!isRelevantToCycling(goalInput)) {
      setError('🚴 Please describe a cycling-related goal. For example: "Ride 300km per week" or "Prepare for Gran Fondo".');
      return;
    }

    try {
      setError(null);

      // useGenerateAiGoals() invalidates the meta-goals query on success, so
      // MetaGoalList's list refetches itself — no manual reload here.
      const result = await generateAiGoals.mutateAsync(goalInput);

      setGoalInput('');
      navigate(`/goal-assistant/${result.metaGoal.id}`);
    } catch (e) {
      // The server 429s with AI_BUDGET_EXCEEDED once the day's AI token
      // budget is spent (services/aiBudget.js) — that's an expected,
      // user-facing condition (not a bug), so it gets its own friendly
      // toast instead of the generic inline error message.
      if (isApiError(e) && e.status === 429 && e.code === 'AI_BUDGET_EXCEEDED') {
        toast.error("You've used up today's AI budget — please try again tomorrow.");
        return;
      }
      console.error('Error generating goal:', e);
      setError(e.message || 'Failed to generate goal. Please try again.');
    }
  };

  const handleQuickTemplate = (template) => {
    setGoalInput(template);
    setError('');
  };

  return (
    <>
      <div className="ai-input-wrapper">
        <span className="ai-input-icon" aria-hidden="true">✦</span>
        <input
          type="text"
          className="ai-input"
          placeholder="Ask your AI coach..."
          aria-label="Ask your AI coach"
          value={goalInput}
          onChange={(e) => {
            setGoalInput(e.target.value);
            if (error) setError('');
          }}
          disabled={generating}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !generating && goalInput.trim()) {
              handleGenerateGoal();
            }
          }}
        />
        <button
          onClick={handleGenerateGoal}
          className="ai-submit-btn"
          disabled={generating || !goalInput.trim()}
          title="Generate Goal Plan"
        >
          <span className="btn-content">{generating ? '···' : '→'}</span>
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="quick-templates">
        <span>Quick templates:</span>
        <button
          onClick={() => handleQuickTemplate('Ride 300km per week consistently')}
          disabled={generating}
        >
          Distance Goal
        </button>
        <button
          onClick={() => handleQuickTemplate('Prepare for Gran Fondo event with 150km and 2000m elevation')}
          disabled={generating}
        >
          Gran Fondo
        </button>
        <button
          onClick={() => handleQuickTemplate('Improve my FTP and climbing ability')}
          disabled={generating}
        >
          FTP Improvement
        </button>
        <button
          onClick={() => handleQuickTemplate('Build endurance base for long distance cycling')}
          disabled={generating}
        >
          Base Building
        </button>
      </div>
    </>
  );
}
