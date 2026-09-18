import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useConfirm } from './useConfirm';

function Harness({ onResult }) {
  const [confirm, confirmDialog] = useConfirm();
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm({ title: 'Delete ride?', message: 'This cannot be undone.', danger: true });
          onResult(ok);
        }}
      >
        Trigger
      </button>
      {confirmDialog}
    </div>
  );
}

describe('useConfirm', () => {
  it('resolves true when the user confirms', async () => {
    let result;
    render(<Harness onResult={(v) => (result = v)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(await screen.findByText('Delete ride?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(result).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when the user cancels', async () => {
    let result;
    render(<Harness onResult={(v) => (result = v)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    await screen.findByText('Delete ride?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(result).toBe(false));
  });

  it('resolves false on Escape', async () => {
    let result;
    render(<Harness onResult={(v) => (result = v)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    await screen.findByText('Delete ride?');
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(result).toBe(false));
  });
});
