import React from 'react';
import Modal from './Modal';
import Button from './Button';

/**
 * Presentational confirm dialog on top of `Modal`. Used directly by
 * `useConfirm` below; exported separately in case a caller wants to build
 * its own confirm flow without the promise wrapper.
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
