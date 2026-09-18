import React, { useState } from 'react';
import { useProfile, useSaveGoal } from '../data/hooks';
import { Modal, useToast } from '../ui';
import GoalList from '../pages/goals/GoalList';
import GoalForm from '../pages/goals/GoalForm';
import './GoalsManager.css';

// T-6.3 part 2: GoalsManager decomposed into GoalList (the grid + delete)
// and GoalForm (the add/edit fields) — see src/pages/goals/. This file now
// only owns the modal shell (migrated to the shared `Modal` primitive,
// GUIDE-6.md's ui-primitives rule — was a hand-rolled `.modal-overlay`
// before) and the add/edit-form open state.
export default function GoalsManager({ onGoalsUpdate, isOpen, onClose }) {
  const { data: userProfile } = useProfile();
  const saveGoal = useSaveGoal();
  const toast = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  const closeForm = () => {
    setShowAddForm(false);
    setEditingGoal(null);
  };

  const handleSubmit = async (formData) => {
    try {
      await saveGoal.mutateAsync({ id: editingGoal?.id, body: formData });
      closeForm();
      // Progress (current_value/percent/pace) is computed server-side only
      // (GET /api/goals, GET /api/meta-goals/:id) — the client no longer
      // recomputes it and writes it back here (T-3.4, W-08).
      onGoalsUpdate?.();
    } catch (e) {
      console.error('Error saving goal:', e);
      toast.error('Failed to save goal');
    }
  };

  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setShowAddForm(true);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Manage Personal Goals"
      className="goals-manager-modal"
    >
      <div className="goals-manager">
        {showAddForm && (
          <GoalForm
            editingGoal={editingGoal}
            userProfile={userProfile}
            saving={saveGoal.isPending}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        )}

        {!showAddForm && (
          <div className="goals-header">
            <button type="button" className="accent-btn" onClick={() => setShowAddForm(true)}>
              Add Goal
            </button>
          </div>
        )}

        <GoalList onEdit={handleEdit} onDeleted={onGoalsUpdate} />
      </div>
    </Modal>
  );
}
