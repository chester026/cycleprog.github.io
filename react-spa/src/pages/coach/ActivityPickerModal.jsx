import React, { useEffect, useMemo, useState } from 'react';
import { MAX_ATTACHED_ACTIVITIES } from '@bikelab/shared/coach';
import { Button, Modal, Loader, ErrorMessage, useToast } from '../../ui';
import { useActivities } from '../../data/hooks';
import { t } from './copy';
import styles from './ActivityPickerModal.module.css';

const dateFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function formatRide(a) {
  const km = (a.distance / 1000).toFixed(1);
  const hours = Math.floor(a.moving_time / 3600);
  const minutes = Math.floor((a.moving_time % 3600) / 60);
  return `${dateFormat.format(new Date(a.start_date))} · ${km} km · ${hours}h${String(minutes).padStart(2, '0')} · ${Math.round(a.total_elevation_gain)} m↑`;
}

/**
 * Multi-select over the rider's synced activities (newest first), capped at
 * MAX_ATTACHED_ACTIVITIES — the chosen rides become hidden model context
 * for the next message. Reads the shared activities query itself.
 */
export default function ActivityPickerModal({ open, onClose, onConfirm, preselectedIds = [] }) {
  const toast = useToast();
  const { data, isLoading, isError } = useActivities({ enabled: open });
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Re-seed from the current attachments each time the sheet opens. The
  // ids are joined into a string so a fresh array per render doesn't retrigger.
  const preselectedKey = preselectedIds.join(',');
  useEffect(() => {
    if (open) setSelectedIds(new Set(preselectedKey ? preselectedKey.split(',').map(Number) : []));
  }, [open, preselectedKey]);

  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => new Date(b.start_date) - new Date(a.start_date)),
    [data],
  );

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size >= MAX_ATTACHED_ACTIVITIES) {
        toast.error(t('coach.attachLimitMessage', { max: MAX_ATTACHED_ACTIVITIES }));
        return prev;
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(sorted.filter((a) => selectedIds.has(a.id)));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('coach.attachActivities')}
      className={styles.dialog}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={selectedIds.size === 0}>
            Attach ({selectedIds.size})
          </Button>
        </>
      }
    >
      {isLoading ? (
        <Loader label="Loading activities..." />
      ) : isError ? (
        <ErrorMessage>Failed to load your activities.</ErrorMessage>
      ) : sorted.length === 0 ? (
        <p className={styles.empty}>{t('coach.attachEmptyActivities')}</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((a) => {
            const checked = selectedIds.has(a.id);
            return (
              <li key={a.id} className={[styles.row, checked ? styles.rowChecked : null].filter(Boolean).join(' ')}>
                <input
                  id={`coach-pick-${a.id}`}
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked}
                  onChange={() => toggle(a.id)}
                />
                <label htmlFor={`coach-pick-${a.id}`} className={styles.text}>
                  {a.name || 'Untitled ride'}
                  <span className={styles.meta}>{formatRide(a)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
