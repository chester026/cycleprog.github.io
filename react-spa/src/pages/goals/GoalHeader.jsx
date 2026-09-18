import React, { useState } from 'react';
import { TIER_CONFIG } from '@bikelab/shared/constants';
import { useSaveMetaGoal, useDeleteMetaGoal } from '../../data/hooks';
import { Modal, useConfirm, useToast } from '../../ui';
import { formatDate, deriveDueDate } from './lib';

/**
 * GoalDetailPage's header block (T-6.3 part 2): back link, edit/delete
 * icon buttons (+ the edit-goal modal, migrated to the shared `Modal`
 * primitive), title, tier/due-date/status pills, description. Owns its own
 * `useSaveMetaGoal`/`useDeleteMetaGoal` calls and their edit-form state —
 * `window.confirm`/`alert` replaced with `useConfirm`/`useToast`
 * (GUIDE-6.md's ui-primitives rule).
 */
export default function GoalHeader({ metaGoal, subGoals, onBack, onDeleted }) {
  const saveMetaGoal = useSaveMetaGoal();
  const deleteMetaGoal = useDeleteMetaGoal();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    title: metaGoal.title,
    description: metaGoal.description || '',
    target_date: metaGoal.target_date || '',
    status: metaGoal.status || 'active',
  });

  const openEditModal = () => {
    setEditForm({
      title: metaGoal.title,
      description: metaGoal.description || '',
      target_date: metaGoal.target_date || '',
      status: metaGoal.status || 'active',
    });
    setShowEditModal(true);
  };

  const handleUpdateMetaGoal = async () => {
    try {
      await saveMetaGoal.mutateAsync({ id: metaGoal.id, body: editForm });
      setShowEditModal(false);
    } catch (e) {
      console.error('Error updating meta goal:', e);
      toast.error('Failed to update goal');
    }
  };

  const handleDeleteMetaGoal = async () => {
    const ok = await confirm({
      title: 'Delete this goal?',
      message: 'This will delete the goal and all its sub-goals. This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteMetaGoal.mutateAsync(metaGoal.id);
      onDeleted?.();
    } catch (e) {
      console.error('Error deleting meta goal:', e);
      toast.error('Failed to delete goal');
    }
  };

  const tier = metaGoal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const isHighTier = tier === 'legendary' || tier === 'epic' || tier === 'grand';
  const derivedDueDate = deriveDueDate(metaGoal, subGoals);

  return (
    <>
      <div className="page-header">
        <div className="header-top-row">
          <button onClick={onBack} className="back-btn">
            ← Back to Goal Assistant
          </button>
          <div className="header-icon-actions">
            <button className="icon-btn" onClick={openEditModal} title="Edit goal">
              <span className="material-symbols-outlined">edit</span>
            </button>
            <button className="icon-btn icon-btn-danger" onClick={handleDeleteMetaGoal} title="Delete goal">
              <span className="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>

        <div className="title-row">
          <h1>{metaGoal.title}</h1>
        </div>

        <div className="meta-row">
          {isHighTier && (
            <span className="tier-badge" style={{ background: tierCfg.color }}>
              {tierCfg.label}
            </span>
          )}
          <span className="pill">
            <span className="material-symbols-outlined pill-icon">calendar_month</span>
            {derivedDueDate ? `Due: ${formatDate(derivedDueDate)}` : 'No deadline'}
          </span>
          <span className="pill">
            <span
              className="status-dot"
              style={{ background: metaGoal.status === 'completed' ? '#9ca3af' : '#22c55e' }}
            />
            {metaGoal.status === 'completed' ? 'Completed' : 'Active'}
          </span>
        </div>

        {metaGoal.description && (
          <p className="description">{metaGoal.description}</p>
        )}
      </div>

      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Goal"
        footer={
          <>
            <button onClick={handleUpdateMetaGoal} className="accent-btn">
              Save Changes
            </button>
            <button onClick={() => setShowEditModal(false)} className="cancel-btn">
              Cancel
            </button>
          </>
        }
      >
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
      </Modal>

      {confirmDialog}
    </>
  );
}
