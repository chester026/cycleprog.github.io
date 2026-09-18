import React from 'react';
import { useGoals, useDeleteGoal } from '../../data/hooks';
import { useConfirm, useToast } from '../../ui';
import GoalCard from '../../components/GoalCard';

/**
 * The read/delete half of GoalsManager (T-6.3 part 2, "GoalsManager →
 * GoalList + GoalForm"): the goals grid, plus deleting one via
 * `useDeleteGoal` — confirmed with `useConfirm` instead of
 * `window.confirm` (GUIDE-6.md's ui-primitives rule).
 *
 * `onEdit(goal)` is the caller's job (it owns the add/edit form's open
 * state) — this component only renders the grid and handles delete.
 * `onDeleted()` (optional) fires after a successful delete, for a caller
 * that also needs to refetch data `useDeleteGoal`'s own invalidation
 * doesn't cover (GoalDetailPage's `useMetaGoal(id)`, a different query key).
 */
export default function GoalList({ onEdit, onDeleted }) {
  const { data: fetchedGoals, isFetching: loading } = useGoals();
  const goals = fetchedGoals ?? [];
  const deleteGoal = useDeleteGoal();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete this goal?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteGoal.mutateAsync(id);
      onDeleted?.();
    } catch (e) {
      console.error('Error deleting goal:', e);
      toast.error('Failed to delete goal');
    }
  };

  if (loading && goals.length === 0) {
    return (
      <>
        <div className="goals-loading">Loading goals...</div>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      {goals.length === 0 ? (
        <div className="no-goals">
          <p>No goals set yet. Click &quot;Add Goal&quot; to create your first personal goal!</p>
        </div>
      ) : (
        <div className="goals-grid" id="goal-manage">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} showActions onEdit={onEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}
      {confirmDialog}
    </>
  );
}
